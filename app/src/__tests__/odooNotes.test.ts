import AsyncStorage from '@react-native-async-storage/async-storage';
import { cacheNotes, dropFromOutbox, fetchNotes, houseOf, noteFileName, odooTime, plainText, postNote, queueNote, readCachedNotes, readOutbox, sendOutbox } from '../lib/odooNotes';

type Call = { model: string; method: string; args: unknown[]; kw: Record<string, unknown> };
const fake = (replies: Record<string, unknown> = {}, fail = false) => {
  const calls: Call[] = [];
  return {
    calls,
    client: {
      call: async (model: string, method: string, args: unknown[], kw: Record<string, unknown> = {}) => {
        calls.push({ model, method, args, kw });
        if (fail && method === 'message_post') throw new Error('offline');
        return replies[`${model}.${method}`] ?? (method === 'create' ? 70 + calls.length : true);
      },
    },
  };
};
const target = { model: 'fsm.order' as const, id: 5 };
const AT = new Date(2026, 10, 14, 9, 5).getTime();

describe('notes in Odoo', () => {
  beforeEach(() => AsyncStorage.clear());

  it('turns chatter HTML into plain text and reads Odoo times as UTC', () => {
    expect(plainText('<p>Gate code&nbsp;1234 &amp; dog</p><p>Call first</p>')).toBe('Gate code 1234 & dog\nCall first');
    expect(plainText(false)).toBe('');
    expect(odooTime('2026-11-14 16:02:11')).toBe(Date.UTC(2026, 10, 14, 16, 2, 11));
  });

  it('reads notes and emails newest first with author and attachment names', async () => {
    const { client, calls } = fake({
      'mail.message.search_read': [{ id: 9, date: '2026-11-14 16:00:00', author_id: [3, 'Justin'], body: '<p>Spring is rusty</p>', attachment_ids: [4] }, { id: 8, date: '2026-11-13 10:00:00', author_id: false, body: '', attachment_ids: [] }],
      'ir.attachment.read': [{ id: 4, name: 'Photo 1.jpg' }],
    });
    const rows = await fetchNotes(client, target);
    expect(rows).toEqual([
      { id: 9, at: Date.UTC(2026, 10, 14, 16), who: 'Justin', body: 'Spring is rusty', files: ['Photo 1.jpg'] },
      { id: 8, at: Date.UTC(2026, 10, 13, 10), who: 'Odoo', body: '', files: [] },
    ]);
    expect(calls[0].args).toEqual([[['model', '=', 'fsm.order'], ['res_id', '=', 5], ['message_type', 'in', ['comment', 'email']]]]);
  });

  it('posts an internal note with photos and voice notes as attachments on the same record', async () => {
    const { client, calls } = fake();
    const files: Record<string, string> = { 'file:///photos/a.jpg': 'data:image/jpeg;base64,QUJD', 'file:///voice/v.m4a': 'Vk9JQ0U=' };
    await postNote(client, { target, body: 'Back door sticks', photos: ['file:///photos/a.jpg'], voice: [{ uri: 'file:///voice/v.m4a', seconds: 12, at: AT }], at: AT }, async (u) => files[u]);
    expect(calls[0]).toMatchObject({ model: 'ir.attachment', method: 'create', args: [{ name: 'Photo 2026-11-14 09.05.jpg', datas: 'QUJD', res_model: 'fsm.order', res_id: 5, mimetype: 'image/jpeg' }] });
    expect(calls[1]).toMatchObject({ args: [{ name: 'Voice note 2026-11-14 09.05.m4a', datas: 'Vk9JQ0U=', mimetype: 'audio/mp4' }] });
    expect(calls[2]).toMatchObject({ model: 'fsm.order', method: 'message_post', args: [[5]], kw: { body: 'Back door sticks', attachment_ids: [71, 72], message_type: 'comment', subtype_xmlid: 'mail.mt_note' } });
    expect(noteFileName('Voice note', AT, 'x.WAV')).toBe('Voice note 2026-11-14 09.05.wav');
  });

  it('refuses to post when a file is gone from the phone, leaving nothing half sent', async () => {
    const { client, calls } = fake();
    await expect(postNote(client, { target, body: 'x', photos: ['file:///gone.jpg'], voice: [], at: AT }, async () => null)).rejects.toThrow(/missing/);
    expect(calls.find((c) => c.method === 'message_post')).toBeUndefined();
  });

  it('keeps notes in an outbox and sends them oldest first, stopping at a failure', async () => {
    await queueNote({ target, body: 'second', photos: [], voice: [] }, AT + 10);
    await queueNote({ target, body: 'first', photos: [], voice: [] }, AT);
    const bad = fake({}, true);
    const errors: unknown[] = [];
    expect(await sendOutbox(bad.client, async () => null, (e) => errors.push(e))).toBe(0);
    expect(errors).toHaveLength(1);
    expect(await readOutbox()).toHaveLength(2);
    const good = fake();
    expect(await sendOutbox(good.client, async () => null)).toBe(2);
    expect(good.calls.map((c) => (c.kw as { body: string }).body)).toEqual(['first', 'second']);
    expect(await readOutbox()).toHaveLength(0);
  });

  it('discards a waiting note', async () => {
    const n = await queueNote({ target, body: 'oops', photos: [], voice: [] });
    await dropFromOutbox(n.id);
    expect(await readOutbox()).toEqual([]);
  });

  it('finds the house of an order and remembers the last read', async () => {
    const { client } = fake({ 'fsm.order.read': [{ location_id: [14, 'House'] }] });
    expect(await houseOf(client, { model: 'fsm.order', id: 5 })).toEqual({ model: 'fsm.location', id: 14 });
    expect(await houseOf(client, { model: 'project.task', id: 5 })).toBeNull();
    await cacheNotes(target, [{ id: 1, at: 1, who: 'A', body: 'b', files: [] }]);
    expect(await readCachedNotes(target)).toHaveLength(1);
    expect(await readCachedNotes({ model: 'res.partner', id: 1 })).toBeNull();
  });
});
