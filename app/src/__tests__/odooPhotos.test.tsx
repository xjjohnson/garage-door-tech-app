import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render } from '@testing-library/react-native';
import { OdooPhotoSync } from '../components/OdooPhotoSync';
import { ATTACHMENTS_STORAGE_KEY, JobPhoto, parseAttachments } from '../lib/attachments';
import type { DeviceMedia } from '../lib/deviceMedia';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { createJob, JOBS_STORAGE_KEY } from '../lib/jobs';
import { Fetch, ODOO_STORAGE_KEY } from '../lib/odoo';
import { photoFileName, photosToSend, sendPhoto } from '../lib/odooPhotos';
import { AttachmentsProvider } from '../lib/useAttachments';
import { JobsProvider } from '../lib/useJobs';
import { OdooProvider } from '../lib/useOdoo';

const AT = new Date(2026, 10, 13, 14, 5).getTime();
const photo = (id: string, jobId: string, over: Partial<JobPhoto> = {}): JobPhoto => ({ id, jobId, uri: `file:///photos/${id}.jpg`, kind: 'before', at: AT, ...over });
const ref = { model: 'fsm.order' as const, id: 5, name: 'FSO/0005' };

describe('job photos to Odoo (logic)', () => {
  it('picks photos of jobs that are in Odoo and not sent yet', () => {
    const jobs = [{ id: 'j1', odooJob: ref }, { id: 'j2' }];
    const list = photosToSend([photo('b', 'j1', { at: AT + 1 }), photo('a', 'j1'), photo('c', 'j2'), photo('d', 'j1', { odooId: 9 })], jobs);
    expect(list.map((x) => [x.photo.id, x.ref.id])).toEqual([
      ['a', 5],
      ['b', 5],
    ]);
  });

  it('attaches the photo to the order with a note in its chatter', async () => {
    const calls: { model: string; method: string; args: unknown[]; kw: Record<string, unknown> }[] = [];
    const client = { call: async (model: string, method: string, args: unknown[], kw: Record<string, unknown> = {}) => (calls.push({ model, method, args, kw }), method === 'create' ? 77 : true) };
    expect(photoFileName(photo('a', 'j1', { kind: 'after', uri: 'file:///x/p.PNG' }))).toBe('After photo 2026-11-13 14.05.png');
    expect(await sendPhoto(client, ref, photo('a', 'j1'), 'data:image/jpeg;base64,AAAA')).toBe(77);
    expect(calls[0]).toMatchObject({ model: 'ir.attachment', method: 'create', args: [{ name: 'Before photo 2026-11-13 14.05.jpg', type: 'binary', datas: 'AAAA', res_model: 'fsm.order', res_id: 5, mimetype: 'image/jpeg' }] });
    expect(calls[1]).toMatchObject({ model: 'fsm.order', method: 'message_post', args: [[5]], kw: { attachment_ids: [77] } });
  });
});

describe('job photos to Odoo in the background', () => {
  const settle = async (n = 10) => {
    for (let i = 0; i < n; i++) await act(async () => undefined);
  };
  const media = { photoDataUrl: jest.fn(async () => 'data:image/jpeg;base64,QUJD') } as unknown as DeviceMedia;

  beforeEach(async () => {
    jest.useFakeTimers();
    await AsyncStorage.clear();
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify({ url: 'x.test', db: 'x', login: 'j' }));
  });
  afterEach(() => jest.useRealTimers());

  it('sends a photo once its job is in Odoo and remembers it went', async () => {
    const made: Record<string, unknown>[] = [];
    const fetchFn: Fetch = async (_url, init) => {
      const { params } = JSON.parse(init.body);
      const reply = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) });
      if (params.service === 'common') return reply(2);
      const [, , , model, method, args] = params.args as [string, number, string, string, string, unknown[]];
      if (model === 'res.users') return reply([{ id: 2, name: 'Justin', partner_id: [90, 'Justin'] }]);
      if (model === 'fsm.order' && method === 'fields_get') return reply({ name: {} });
      if (model === 'fsm.person') return reply([]);
      if (model === 'ir.attachment') return made.push(args[0] as Record<string, unknown>), reply(300 + made.length);
      if (method === 'message_post') return reply(1);
      return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'Odoo Server Error', data: { name: 'builtins.KeyError', message: `Object ${model} doesn't exist` } } }) };
    };
    const job = (id: string, over: object = {}) => ({ ...createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Pat', address: '', phone: '', notes: '' }, { title: '' }, 1000, id), ...over });
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([job('j1', { odooJob: ref }), job('j2')]));
    await AsyncStorage.setItem(ATTACHMENTS_STORAGE_KEY, JSON.stringify({ photos: [photo('a', 'j1'), photo('b', 'j2')], signatures: [] }));
    const shown = await render(
      <JobsProvider>
        <AttachmentsProvider media={media}>
          <OdooProvider fetchFn={fetchFn} secrets={{ get: async () => 'k', set: async () => undefined, remove: async () => undefined }}>
            <OdooPhotoSync />
          </OdooProvider>
        </AttachmentsProvider>
      </JobsProvider>,
    );
    await settle();
    await act(async () => {
      jest.advanceTimersByTime(3500);
    });
    await settle();
    expect(made).toEqual([expect.objectContaining({ res_model: 'fsm.order', res_id: 5, datas: 'QUJD' })]);
    const saved = parseAttachments(await AsyncStorage.getItem(ATTACHMENTS_STORAGE_KEY));
    expect(saved.photos.map((p) => [p.id, p.odooId])).toEqual([
      ['a', 301],
      ['b', undefined],
    ]);
    await act(async () => shown.unmount());
  });
});
