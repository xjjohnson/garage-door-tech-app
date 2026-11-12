import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { ATTACHMENTS_STORAGE_KEY, parseAttachments } from '../lib/attachments';
import { DeviceMedia } from '../lib/deviceMedia';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import {
  checkCounts,
  DOOR_ITEMS,
  EMPTY_INSPECTION,
  flags,
  Inspection,
  inspectionText,
  MOTOR_ITEMS,
  parseInspection,
  repairLines,
  restGood,
  sections,
  setAnswer,
  summary,
  withRepairs,
} from '../lib/inspection';
import { inspectionHtml } from '../lib/inspectionReport';
import { EMPTY_BUSINESS } from '../lib/invoices';
import { createJob, JOBS_STORAGE_KEY, parseJobs } from '../lib/jobs';
import { reportTarget, sendReport } from '../lib/odooReports';
import { DEFAULT_PRICE_SHEET, PRICE_SHEET_STORAGE_KEY, PriceSheet } from '../lib/prices';
import { buildQuote } from '../lib/quote';
import { renderApp } from '../testing/renderApp';

const mockMedia: jest.Mocked<DeviceMedia> = {
  takePhoto: jest.fn(async () => 'file:///photos/one.jpg'),
  pickPhotos: jest.fn(async () => []),
  deletePhoto: jest.fn(),
  sharePdf: jest.fn(async (_html: string, _name: string) => undefined),
  sharePhoto: jest.fn(async (_uri: string) => undefined),
  photoDataUrl: jest.fn(async (_uri: string) => 'data:image/jpeg;base64,AAAA'),
  pdfBase64: jest.fn(async (_html: string) => 'JVBERi0='),
  keepFile: jest.fn(async (uri: string) => uri),
};
jest.mock('../lib/deviceMedia', () => ({ deviceMedia: () => mockMedia }));

const MATCH = { mode: 'match' as const, form: { ...DEFAULT_MATCH_FORM, twentyCoil: '4 1/2', length: '24' } };
const SHEET: PriceSheet = { ...DEFAULT_PRICE_SHEET, serviceCall: '89', springLabor: '150', spring: { good: '60', better: '85', best: '120' }, taxPercent: '10' };
const job = createJob(MATCH, { customer: 'Pat Smith', address: '12 Oak St', phone: '', notes: '' }, { title: '.225 × 2" × 24"' }, 1000, 'j1');

function sample(): Inspection {
  let i = EMPTY_INSPECTION(new Date(2026, 10, 11).getTime());
  const d = i.doors[0];
  const m = d.motors[0];
  i = setAnswer(i, `d:${d.id}:cables`, { rating: 'poor', note: 'Frayed at the bottom', action: 'Replace cables' });
  i = setAnswer(i, `d:${d.id}:rollers`, { rating: 'good' });
  i = setAnswer(i, `d:${d.id}:windows`, { rating: 'na' });
  i = setAnswer(i, `m:${d.id}:${m.id}:eyes`, { rating: 'non' });
  i = setAnswer(i, `m:${d.id}:${m.id}:remote`, { rating: 'pass' });
  return {
    ...i,
    repairs: [
      { id: 'r1', label: 'Lift cables (pair)', price: '45', taxable: true },
      { id: 'r2', label: 'Extra labor', price: '30', taxable: false },
      { id: 'r3', label: 'No price yet', price: '', taxable: true },
    ],
  };
}

describe('inspection (plain logic)', () => {
  it('lists each door, its motors, then the gate', () => {
    const i = { ...EMPTY_INSPECTION(1), gate: { type: 'swing' as const, answers: {} } };
    expect(sections(i).map((s) => s.title)).toEqual(['Door 1', 'Door 1 · Motor 1', 'Gate · UL 325', 'Gate · Swing gate', 'Gate · ASTM F2200']);
    expect(sections(EMPTY_INSPECTION(1, true)).map((s) => s.title)).toEqual(['Gate · UL 325', 'Gate · ASTM F2200']);
    const slide = sections({ ...EMPTY_INSPECTION(1, true), gate: { type: 'slide', answers: {} } });
    expect(slide.map((s) => s.title)).toEqual(['Gate · UL 325', 'Gate · Slide gate', 'Gate · ASTM F2200']);
    expect(slide[1].items.map((x) => x.key)).toContain('g:slide-roller-covers');
    const swing = sections({ ...EMPTY_INSPECTION(1, true), gate: { type: 'swing', answers: {} } });
    expect(swing[1].items.map((x) => x.def.id)).toEqual(['swing-pivot', 'swing-wall']);
  });

  it('scores, flags and counts actions, leaving out N/A', () => {
    const i = sample();
    const s = summary(i);
    expect(s.total).toBe(DOOR_ITEMS.length + MOTOR_ITEMS.length);
    expect(s.answered).toBe(5);
    expect(s.flagged).toBe(2);
    expect(s.actions).toBe(1);
    // Rollers good 2/2, cables poor 0/2, eyes non-compliant 0/1, remote pass 1/1: 3 of 6.
    expect(s.score).toBe(50);
    expect(flags(i).map((f) => `${f.section}: ${f.label}`)).toEqual(['Door 1: Cables', 'Door 1 · Motor 1: Safety eyes']);
    expect(checkCounts(i)).toEqual({ done: 5, fix: 2, total: s.total });
    expect(summary(undefined).score).toBeNull();
  });

  it('marks the rest of a section good without changing answered items', () => {
    const i = sample();
    const d = i.doors[0];
    const done = restGood(i, d.id);
    expect(done.doors[0].answers.cables.rating).toBe('poor');
    expect(done.doors[0].answers.windows.rating).toBe('na');
    expect(done.doors[0].answers.track.rating).toBe('good');
    expect(sections(done)[0].items.every((x) => x.answer?.rating)).toBe(true);
    const motor = restGood(i, `${d.id}/${d.motors[0].id}`).doors[0].motors[0].answers;
    expect([motor.force.rating, motor.board.rating, motor.eyes.rating]).toEqual(['compliant', 'pass', 'non']);
  });

  it('adds priced repairs to every option and works out tax again', () => {
    const insp = sample();
    expect(repairLines(insp).map((l) => l.label)).toEqual(['Lift cables (pair)', 'Extra labor']);
    const base = buildQuote(MATCH, SHEET);
    const q = withRepairs(base, insp, SHEET);
    for (let n = 0; n < 3; n++) {
      const before = base.options[n];
      const after = q.options[n];
      if (!before.available) continue;
      expect(after.subtotal).toBe(before.subtotal + 4500 + 3000);
      expect(after.tax).toBe(before.tax + 450);
      expect(after.total).toBe(after.subtotal + after.tax);
    }
    expect(withRepairs(base, undefined, SHEET)).toBe(base);
  });

  it('writes a text summary for the customer', () => {
    const text = inspectionText(sample(), 'Pat Smith');
    expect(text).toMatch(/^Garage door inspection for Pat Smith/);
    expect(text).toContain('- Door 1, Cables: Poor. Frayed at the bottom → Replace cables');
    expect(text).toContain('Score: 50%');
    expect(text).toContain('- Lift cables (pair): $45');
  });

  it('moves a 0.4 safety check into Door 1 and Motor 1', () => {
    const p = parseInspection({
      at: 5,
      results: { cables: { status: 'fix', note: 'Frayed' }, rollers: { status: 'ok' }, 'photo-eyes': { status: 'fix' }, springs: { status: 'ok' }, balance: { status: 'fix', note: 'Heavy' }, nope: { status: 'ok' } },
      repairs: [{ id: 'a', label: 'X', price: '5' }, { nope: 1 }],
    })!;
    const d = p.doors[0];
    expect(d.answers.cables).toEqual({ rating: 'poor', note: 'Frayed', action: '' });
    expect(d.answers.rollers.rating).toBe('good');
    expect(d.answers.balance).toEqual({ rating: 'poor', note: 'Heavy', action: '' });
    expect(d.motors[0].answers.eyes.rating).toBe('non');
    expect(p.repairs).toEqual([{ id: 'a', label: 'X', price: '5', taxable: true }]);
    expect(p.voice).toEqual([]);
    expect(parseInspection(null)).toBeUndefined();
  });

  it('reads the new shape back, and jobs keep it', () => {
    const insp: Inspection = { ...sample(), lubricated: true, gate: { type: 'slide', answers: { 'ul-signs': { rating: 'compliant', note: '', action: '' } } }, voice: [{ id: 'v1', uri: 'file:///v.m4a', at: 3, seconds: 12 }], sent: { at: 9, to: 'customer' } };
    expect(parseInspection(JSON.parse(JSON.stringify(insp)))).toEqual(insp);
    expect(parseJobs(JSON.stringify([{ ...job, inspection: insp }]))[0].inspection).toEqual(insp);
  });

  it('makes a report with flagged items first, photos and the signature', () => {
    const i = sample();
    const html = inspectionHtml(
      i,
      { customer: 'Pat <Smith>', address: '12 Oak St', reference: 'S00041', inspector: 'Justin' },
      { ...EMPTY_BUSINESS, name: 'Johnsons' },
      'data:image/png;base64,LOGO',
      [{ item: `d:${i.doors[0].id}:cables`, src: 'data:image/jpeg;base64,PIC' }],
      { id: 's', for: 'inspection', refId: 'j1', name: 'Pat', paths: ['M1 1L2 2'], w: 300, h: 150, at: 5 },
    );
    expect(html).toContain('Garage door inspection');
    expect(html).toContain('Pat &lt;Smith&gt;');
    expect(html).toContain('S00041');
    expect(html).toContain('<div class="n">50%</div>');
    expect(html.indexOf('Flagged items')).toBeLessThan(html.indexOf('<h2>Door 1</h2>'));
    expect(html).toContain('Action: Replace cables');
    expect(html).toContain('<figcaption>Door 1 · Cables</figcaption>');
    expect(html).toContain('I have received this inspection report.');
    expect(html).toContain('Not checked');
  });

  it('sends the report to the Field Service order, else the sales order, else the customer', async () => {
    const customers = [{ id: 'c1', odooId: 77, name: 'John Smith' }];
    const j = { id: 'j1', customerId: 'c1', odooOrder: undefined };
    expect(reportTarget(j, [{ id: 'odoo-12', jobId: 'j1' }], customers, 'fsm.order')).toEqual({ model: 'fsm.order', id: 12, label: 'the Field Service order' });
    expect(reportTarget({ ...j, odooOrder: { id: 41, name: 'S00041' } } as never, [{ id: 'local-1', jobId: 'j1' }], customers, 'fsm.order')).toEqual({ model: 'sale.order', id: 41, label: 'the sales order S00041' });
    expect(reportTarget(j, [], customers, null)).toEqual({ model: 'res.partner', id: 77, label: "John Smith's contact" });
    expect(reportTarget({ ...j, customerId: undefined } as never, [], customers, null)).toBeNull();

    const calls: unknown[][] = [];
    const client = {
      call: jest.fn(async (...args: unknown[]) => {
        calls.push(args);
        if (args[1] === 'message_post') throw new Error('no chatter');
        return 501;
      }),
    };
    const id = await sendReport(client as never, { model: 'fsm.order', id: 12, label: 'x' }, 'Inspection.pdf', 'JVBERi0=', 'Inspection report');
    expect(id).toBe(501);
    expect(calls[0]).toEqual(['ir.attachment', 'create', [{ name: 'Inspection.pdf', type: 'binary', datas: 'JVBERi0=', res_model: 'fsm.order', res_id: 12, mimetype: 'application/pdf' }]]);
    expect(calls[1][0]).toBe('fsm.order');
    expect(calls[1][3]).toMatchObject({ attachment_ids: [501] });
  });
});

async function settle() {
  for (let i = 0; i < 5; i++) await act(async () => undefined);
}

describe('inspection in the app', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await AsyncStorage.setItem(PRICE_SHEET_STORAGE_KEY, JSON.stringify(SHEET));
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([job]));
  });

  it('rates items, flags a problem with a photo, prices it as a repair, and the quote includes it', async () => {
    const app = await renderApp('/jobs');
    await settle();
    await fireEvent.press(screen.getByTestId('job-toggle-j1'));
    await fireEvent.press(screen.getByTestId('job-inspection-j1'));
    expect(app.getPathname()).toBe('/inspection/j1');

    const door = EMPTY_INSPECTION(job.savedAt).doors[0];
    const cables = `d:${door.id}:cables`;
    await fireEvent.press(screen.getByTestId(`item-d:${door.id}:rollers-good`));
    await fireEvent.press(screen.getByTestId(`item-${cables}-poor`));
    await fireEvent.changeText(screen.getByTestId(`item-${cables}-note`), 'Frayed');
    await fireEvent.press(screen.getByTestId(`item-${cables}-photo`));
    await settle();
    await fireEvent.press(screen.getByTestId(`item-${cables}-repair`));
    expect(screen.getByTestId('inspection-summary')).toHaveTextContent(/50%.*1.*Flagged.*2\/27/);

    const photos = parseAttachments(await AsyncStorage.getItem(ATTACHMENTS_STORAGE_KEY)).photos;
    expect(photos).toEqual([expect.objectContaining({ jobId: 'j1', item: cables })]);

    const [repair] = parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].inspection!.repairs;
    expect(repair.label).toBe('Cables: repair');
    expect(screen.queryByTestId(`item-${cables}-repair`)).toBeNull();
    await fireEvent.press(screen.getByTestId(`repair-price-${repair.id}`));
    const pad = screen.getByTestId('keypad');
    for (const k of ['4', '5']) await fireEvent.press(within(pad).getByTestId(`key-${k}`));
    await fireEvent.press(within(pad).getByTestId('keypad-done'));

    await fireEvent.press(screen.getByTestId(`rest-good-${door.id}`));
    expect(screen.getByTestId('inspection-summary')).toHaveTextContent(/18\/27/);

    await fireEvent.press(screen.getByTestId('inspection-pdf'));
    await settle();
    expect(mockMedia.photoDataUrl).toHaveBeenCalledWith('file:///photos/one.jpg');
    const [html, name] = mockMedia.sharePdf.mock.calls[0];
    expect(html).toContain('Flagged items');
    expect(html).toContain('data:image/jpeg;base64,AAAA');
    expect(name).toMatch(/^Inspection/);

    const base = buildQuote(MATCH, SHEET).options[0];
    await fireEvent.press(screen.getByTestId('inspection-quote'));
    expect(app.getPathname()).toBe('/quote/j1');
    expect(screen.getByTestId('quote-good')).toHaveTextContent(/Cables: repair/);
    expect(screen.getByTestId('quote-total-good')).toHaveTextContent(`$${((base.total + 4950) / 100).toFixed(2)}`);
    expect(screen.getByTestId('quote-inspection')).toHaveTextContent('Inspection (1 repair added)');
  });

  it('adds a second door and a gate', async () => {
    await renderApp('/inspection/j1');
    await settle();
    await fireEvent.press(screen.getByTestId('inspection-add-door'));
    await fireEvent.press(screen.getByTestId('inspection-gate'));
    await fireEvent.press(screen.getByTestId('inspection-lube'));
    const insp = parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].inspection!;
    expect(insp.doors).toHaveLength(2);
    expect(insp.doors[1].motors).toHaveLength(1);
    expect(insp.gate).toEqual({ type: '', answers: {} });
    expect(insp.lubricated).toBe(true);
    expect(screen.getByTestId('item-g:ul-signs')).toBeTruthy();
    expect(screen.queryByTestId('item-g:swing-pivot')).toBeNull();
    await fireEvent.press(within(screen.getByTestId('gate-type')).getByText('Swing'));
    expect(screen.getByTestId('item-g:swing-pivot')).toBeTruthy();
    expect(screen.queryByTestId('item-g:slide-stops')).toBeNull();
    expect(screen.getByTestId('voice-notes')).toHaveTextContent('No voice notes.');

    // A door with answers needs a second tap to remove; an empty one goes at once.
    const first = insp.doors[0];
    await fireEvent.press(screen.getByTestId(`item-d:${first.id}:rollers-good`));
    await fireEvent.press(screen.getByTestId('door-0-remove'));
    expect(screen.getByTestId('door-0-remove')).toHaveTextContent('Tap again: answers will be lost');
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].inspection!.doors).toHaveLength(2);
    await fireEvent.press(screen.getByTestId('door-0-remove'));
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].inspection!.doors.map((d) => d.id)).toEqual([insp.doors[1].id]);
    await fireEvent.press(screen.getByTestId('door-0-remove'));
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].inspection!.doors).toHaveLength(0);
  });
});
