import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render } from '@testing-library/react-native';
import { OdooReportSync, REPORT_SYNC_SINCE_KEY } from '../components/OdooReportSync';
import { ATTACHMENTS_STORAGE_KEY, Signature } from '../lib/attachments';
import type { DeviceMedia } from '../lib/deviceMedia';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { EMPTY_INSPECTION, Inspection, setAnswer } from '../lib/inspection';
import { createJob, JOBS_STORAGE_KEY, parseJobs } from '../lib/jobs';
import { Fetch, ODOO_STORAGE_KEY } from '../lib/odoo';
import { reportNote, reportsToSend, reportTarget, sendVoice, voiceFileName, voiceToSend } from '../lib/odooReports';
import { AttachmentsProvider } from '../lib/useAttachments';
import { FollowUpsProvider } from '../lib/useFollowUps';
import { InvoicesProvider } from '../lib/useInvoices';
import { JobsProvider } from '../lib/useJobs';
import { OdooProvider } from '../lib/useOdoo';

const ref = { model: 'fsm.order' as const, id: 5, name: 'FSO/0005' };
const sig = (refId: string, at: number): Signature => ({ id: `s-${refId}-${at}`, for: 'inspection', refId, name: 'Pat', paths: ['M0 0L1 1'], w: 10, h: 10, at });

/** An inspection with the first door's rollers poor (with an action) and track good. */
function inspected(): Inspection {
  let i = EMPTY_INSPECTION(1000);
  const d = i.doors[0].id;
  i = setAnswer(i, `d:${d}:rollers`, { rating: 'poor', action: 'Replace rollers' });
  return setAnswer(i, `d:${d}:track`, { rating: 'good' });
}

describe('signed inspection reports to Odoo (logic)', () => {
  it("prefers the job's own order", () => {
    const j = { id: 'j1', customerId: 'c1', odooOrder: { id: 41, name: 'S00041' }, odooJob: ref };
    expect(reportTarget(j, [], [], 'fsm.order')).toEqual({ model: 'fsm.order', id: 5, label: 'the Field Service order FSO/0005' });
  });

  it('lists the flagged items in the note', () => {
    expect(reportNote(inspected())).toBe('Inspection report: score 50%, 1 flagged: Door 1 Rollers (Poor: Replace rollers).');
    expect(reportNote(EMPTY_INSPECTION(1000))).toBe('Inspection report: not scored, 0 flagged.');
  });

  it('picks jobs in Odoo signed since it started and since the report last went', () => {
    const insp = inspected();
    const jobs = [
      { id: 'new', inspection: insp, odooJob: ref },
      { id: 'old', inspection: insp, odooJob: ref },
      { id: 'sent', inspection: { ...insp, sent: { at: 600, to: 'x' } }, odooJob: ref },
      { id: 'resigned', inspection: { ...insp, sent: { at: 600, to: 'x' } }, odooJob: ref },
      { id: 'local', inspection: insp },
      { id: 'unsigned', inspection: insp, odooJob: ref },
    ];
    const signatures = [sig('new', 500), sig('old', 100), sig('sent', 550), sig('resigned', 550), sig('resigned', 700), sig('local', 500)];
    expect(reportsToSend(jobs, signatures, 200).map((r) => [r.job.id, r.signedAt])).toEqual([
      ['new', 500],
      ['resigned', 700],
    ]);
  });
});

describe('inspection voice notes to Odoo (logic)', () => {
  const AT = new Date(2026, 10, 13, 14, 5).getTime();
  const note = (id: string, at: number, over: object = {}) => ({ id, uri: `file:///voice/${id}.m4a`, at, seconds: 42, ...over });

  it('picks notes of jobs in Odoo, recorded since it started, not sent yet', () => {
    const insp = (voice: ReturnType<typeof note>[]) => ({ ...EMPTY_INSPECTION(1000), voice });
    const jobs = [
      { id: 'j1', odooJob: ref, inspection: insp([note('b', 600), note('a', 500), note('old', 100), note('sent', 700, { odooId: 9 })]) },
      { id: 'j2', inspection: insp([note('c', 500)]) },
    ];
    expect(voiceToSend(jobs, 200).map((x) => [x.jobId, x.note.id])).toEqual([
      ['j1', 'a'],
      ['j1', 'b'],
    ]);
  });

  it('attaches the note to the order with its length in the chatter', async () => {
    const calls: { model: string; method: string; args: unknown[]; kw: Record<string, unknown> }[] = [];
    const client = { call: async (model: string, method: string, args: unknown[], kw: Record<string, unknown> = {}) => (calls.push({ model, method, args, kw }), method === 'create' ? 88 : true) };
    expect(voiceFileName(note('a', AT))).toBe('Voice note 2026-11-13 14.05.m4a');
    expect(await sendVoice(client, ref, note('a', AT), 'QUFB')).toBe(88);
    expect(calls[0]).toMatchObject({ model: 'ir.attachment', method: 'create', args: [{ name: 'Voice note 2026-11-13 14.05.m4a', datas: 'QUFB', res_model: 'fsm.order', res_id: 5, mimetype: 'audio/mp4' }] });
    expect(calls[1]).toMatchObject({ model: 'fsm.order', method: 'message_post', kw: { body: 'Inspection voice note (0:42) from the app', attachment_ids: [88] } });
  });
});

describe('signed inspection reports to Odoo in the background', () => {
  const settle = async (n = 10) => {
    for (let i = 0; i < n; i++) await act(async () => undefined);
  };
  const media = { photoDataUrl: jest.fn(async () => null), pdfBase64: jest.fn(async () => 'UERG'), fileBase64: jest.fn(async () => 'Vk9J') } as unknown as DeviceMedia;

  beforeEach(async () => {
    jest.useFakeTimers();
    await AsyncStorage.clear();
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify({ url: 'x.test', db: 'x', login: 'j' }));
  });
  afterEach(() => jest.useRealTimers());

  it('attaches the report to the order once signed, with the flagged items, and only once', async () => {
    const made: Record<string, unknown>[] = [];
    const posted: Record<string, unknown>[] = [];
    const fetchFn: Fetch = async (_url, init) => {
      const { params } = JSON.parse(init.body);
      const reply = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) });
      if (params.service === 'common') return reply(2);
      const [, , , model, method, args, kw] = params.args as [string, number, string, string, string, unknown[], Record<string, unknown>];
      if (model === 'res.users') return reply([{ id: 2, name: 'Justin', partner_id: [90, 'Justin'] }]);
      if (model === 'fsm.order' && method === 'fields_get') return reply({ name: {} });
      if (model === 'fsm.person') return reply([]);
      if (model === 'ir.attachment') return made.push(args[0] as Record<string, unknown>), reply(300 + made.length);
      if (method === 'message_post') return posted.push(kw), reply(1);
      return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'Odoo Server Error', data: { name: 'builtins.KeyError', message: `Object ${model} doesn't exist` } } }) };
    };
    const job = (id: string, over: object = {}) => ({ ...createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Pat', address: '', phone: '', notes: '' }, { title: '' }, 1000, id), ...over });
    const now = Date.now();
    await AsyncStorage.setItem(REPORT_SYNC_SINCE_KEY, String(now - 60_000));
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([job('j1', { odooJob: ref, inspection: { ...inspected(), voice: [{ id: 'v1', uri: 'file:///voice/v1.m4a', at: now - 500, seconds: 5 }, { id: 'v0', uri: 'file:///voice/v0.m4a', at: now - 120_000, seconds: 5 }] } }), job('j2', { odooJob: { ...ref, id: 6 }, inspection: inspected() })]));
    // j2 was signed before this phone started sending reports, so it stays for the manual button.
    await AsyncStorage.setItem(ATTACHMENTS_STORAGE_KEY, JSON.stringify({ photos: [], signatures: [sig('j1', now - 1000), sig('j2', now - 120_000)] }));
    const shown = await render(
      <JobsProvider>
        <InvoicesProvider>
         <FollowUpsProvider>
          <AttachmentsProvider media={media}>
            <OdooProvider fetchFn={fetchFn} secrets={{ get: async () => 'k', set: async () => undefined, remove: async () => undefined }}>
              <OdooReportSync />
            </OdooProvider>
          </AttachmentsProvider>
         </FollowUpsProvider>
        </InvoicesProvider>
      </JobsProvider>,
    );
    await settle();
    await act(async () => {
      jest.advanceTimersByTime(3500);
    });
    await settle(20);
    // The new voice note, then the report; the voice note from before it started stays on the phone.
    expect(made).toEqual([expect.objectContaining({ res_model: 'fsm.order', res_id: 5, datas: 'Vk9J', mimetype: 'audio/mp4' }), expect.objectContaining({ res_model: 'fsm.order', res_id: 5, datas: 'UERG', name: 'Inspection Pat.pdf', mimetype: 'application/pdf' })]);
    expect(posted[1]).toEqual(expect.objectContaining({ body: 'Inspection report: score 50%, 1 flagged: Door 1 Rollers (Poor: Replace rollers).', attachment_ids: [302] }));
    const saved = parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY));
    expect(saved.find((j) => j.id === 'j1')?.inspection?.sent?.to).toBe('the Field Service order FSO/0005');
    expect(saved.find((j) => j.id === 'j1')?.inspection?.voice.map((v) => [v.id, v.odooId])).toEqual([
      ['v1', 301],
      ['v0', undefined],
    ]);
    expect(saved.find((j) => j.id === 'j2')?.inspection?.sent).toBeUndefined();

    await act(async () => {
      jest.advanceTimersByTime(5 * 60_000 + 10);
    });
    await settle(20);
    expect(made).toHaveLength(2);
    await act(async () => shown.unmount());
  });
  it('puts the doors and openers on the order\'s house as equipment, once', async () => {
    const created: Record<string, unknown>[] = [];
    const fetchFn: Fetch = async (_url, init) => {
      const { params } = JSON.parse(init.body);
      const reply = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) });
      if (params.service === 'common') return reply(2);
      const [, , , model, method, args] = params.args as [string, number, string, string, string, unknown[]];
      if (model === 'res.users') return reply([{ id: 2, name: 'Justin', partner_id: [90, 'Justin'] }]);
      if (model === 'fsm.order' && method === 'fields_get') return reply({ name: {} });
      if (model === 'fsm.order' && method === 'read') return reply([{ location_id: [77, 'Oak St'] }]);
      if (model === 'fsm.person') return reply([]);
      if (model === 'fsm.equipment' && method === 'fields_get') return reply({ name: {}, location_id: {}, notes: { type: 'text' } });
      if (model === 'fsm.equipment' && method === 'search_read') return reply([]);
      if (model === 'fsm.equipment' && method === 'create') return created.push(args[0] as Record<string, unknown>), reply(40 + created.length);
      if (model === 'ir.attachment') return reply(300);
      if (method === 'message_post') return reply(1);
      return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'Odoo Server Error', data: { name: 'builtins.KeyError', message: `Object ${model} doesn't exist` } } }) };
    };
    const now = Date.now();
    const insp = inspected();
    insp.doors[0] = { ...insp.doors[0], maker: 'Clopay', size: '16x7', motors: [{ ...insp.doors[0].motors[0], maker: 'LiftMaster', built: '2019' }] };
    const j = { ...createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Pat', address: '', phone: '', notes: '' }, { title: '' }, 1000, 'j1'), odooJob: ref, inspection: insp };
    await AsyncStorage.setItem(REPORT_SYNC_SINCE_KEY, String(now - 60_000));
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([j]));
    await AsyncStorage.setItem(ATTACHMENTS_STORAGE_KEY, JSON.stringify({ photos: [], signatures: [sig('j1', now - 1000)] }));
    const shown = await render(
      <JobsProvider>
        <InvoicesProvider>
          <FollowUpsProvider>
            <AttachmentsProvider media={media}>
              <OdooProvider fetchFn={fetchFn} secrets={{ get: async () => 'k', set: async () => undefined, remove: async () => undefined }}>
                <OdooReportSync />
              </OdooProvider>
            </AttachmentsProvider>
          </FollowUpsProvider>
        </InvoicesProvider>
      </JobsProvider>,
    );
    await settle();
    await act(async () => {
      jest.advanceTimersByTime(3500);
    });
    await settle(20);
    expect(created.map((c) => [c.name, c.location_id])).toEqual([['Garage door: Clopay 16x7', 77], ['Opener: LiftMaster 2019', 77]]);
    await act(async () => {
      jest.advanceTimersByTime(5 * 60_000 + 10);
    });
    await settle(20);
    expect(created).toHaveLength(2);
    await act(async () => shown.unmount());
  });
});
