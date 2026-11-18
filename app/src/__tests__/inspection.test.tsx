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
  newMotor,
  hubEntries,
  entryStats,
  repairForItem,
  suggestedRepairs,
  isFlagged,
  isBad,
  parseInspection,
  repairLines,
  restGood,
  sections,
  setAnswer,
  summary,
  withRepairs,
} from '../lib/inspection';
import { inspectionHtml } from '../lib/inspectionReport';
import { lastAnswer, previousInspection } from '../lib/lastInspection';
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
  openPdf: jest.fn(async (_base64: string, _name: string) => undefined),
  keepFile: jest.fn(async (uri: string) => uri),
};
jest.mock('../lib/deviceMedia', () => ({ deviceMedia: () => mockMedia }));

const MATCH = { mode: 'match' as const, form: { ...DEFAULT_MATCH_FORM, twentyCoil: '4 1/2', length: '24' } };
const SHEET: PriceSheet = { ...DEFAULT_PRICE_SHEET, serviceCall: '89', springLabor: '150', spring: { good: '60', better: '85', best: '120' }, taxPercent: '10' };
const job = createJob(MATCH, { customer: 'Pat Smith', address: '12 Oak St', phone: '', notes: '' }, { title: '.225 × 2" × 24"' }, 1000, 'j1');

/** A new inspection with one door and one opener on it. */
const withOpener = (i: Inspection): Inspection => ({ ...i, doors: [{ ...i.doors[0], motors: [newMotor(i.at)] }] });

function sample(): Inspection {
  let i = withOpener(EMPTY_INSPECTION(new Date(2026, 10, 11).getTime()));
  const d = i.doors[0];
  const m = d.motors[0];
  i = setAnswer(i, `d:${d.id}:cables`, { rating: 'poor', note: 'Frayed at the bottom', action: 'Replace cables' });
  i = setAnswer(i, `d:${d.id}:rollers`, { rating: 'good' });
  i = setAnswer(i, `d:${d.id}:windows`, { rating: 'na' });
  i = setAnswer(i, `m:${d.id}:${m.id}:eyes`, { rating: 'non' });
  i = setAnswer(i, `m:${d.id}:${m.id}:remote`, { rating: 'pass' });
  return {
    ...i,
    holdRepairs: undefined,
    repairs: [
      { id: 'r1', label: 'Lift cables (pair)', price: '45', taxable: true },
      { id: 'r2', label: 'Extra labor', price: '30', taxable: false },
      { id: 'r3', label: 'No price yet', price: '', taxable: true },
    ],
  };
}

describe('inspection (plain logic)', () => {
  it('lists each door, its motors, then the gate', () => {
    const i = { ...withOpener(EMPTY_INSPECTION(1)), gate: { type: 'swing' as const, answers: {} } };
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

  it('flags Fair and worse, red only for the bad ones', () => {
    expect([isFlagged('good'), isFlagged('fair'), isFlagged('poor'), isFlagged('fail')]).toEqual([false, true, true, true]);
    expect([isBad('fair'), isBad('poor'), isBad('non')]).toEqual([false, true, true]);
  });

  it('lists what was added, with progress, and starts with no opener or gate', () => {
    const start = EMPTY_INSPECTION(1);
    expect(hubEntries(start).map((e) => e.title)).toEqual(['Door 1']);
    const i = { ...withOpener(start), gate: { type: '' as const, answers: {} } };
    expect(hubEntries(i).map((e) => e.title)).toEqual(['Door 1', 'Opener', 'Gate']);
    const two = { ...i, doors: [...i.doors, { ...i.doors[0], id: 'd2', motors: [] }] };
    expect(hubEntries(two).map((e) => e.title)).toEqual(['Door 1', 'Door 1 · Opener', 'Door 2', 'Gate']);
    const done = setAnswer(i, `d:${i.doors[0].id}:cables`, { rating: 'fair' });
    expect(entryStats(done, hubEntries(done)[0])).toEqual({ answered: 1, total: DOOR_ITEMS.length, flagged: 1 });
  });

  it('holds suggested repairs off the quote until they are sent to the ticket', () => {
    const base = EMPTY_INSPECTION(1);
    const key = `d:${base.doors[0].id}:cables`;
    const held = { ...base, repairs: [{ id: 'r1', label: 'Cables', price: '45', taxable: true, item: key }] };
    expect(repairForItem(held, key)?.label).toBe('Cables');
    expect(repairLines(held)).toEqual([]);
    expect(suggestedRepairs(held).map((l) => l.label)).toEqual(['Cables']);
    expect(repairLines({ ...held, holdRepairs: false }).map((l) => l.label)).toEqual(['Cables']);
    expect(parseInspection(JSON.parse(JSON.stringify(held)))!.holdRepairs).toBe(true);
    expect(withRepairs(buildQuote(MATCH, SHEET), held, SHEET)).toEqual(buildQuote(MATCH, SHEET));
  });

  it('shows what the same door and item got on the customer\'s last inspection', () => {
    const old = (id: string, customer: string, at: number, rating: 'good' | 'fair' = 'good') => {
      const i = withOpener(EMPTY_INSPECTION(at));
      return { ...job, id, customer, inspection: setAnswer({ ...i, doors: [{ ...i.doors[0], id: 'old', size: '16x7', maker: 'Clopay' }] }, 'd:old:cables', { rating }) };
    };
    const now = withOpener(EMPTY_INSPECTION(9000));
    const cur = { ...job, id: 'now', inspection: { ...now, doors: [{ ...now.doors[0], id: 'new', size: '16x7', maker: 'Clopay' }] } };
    const jobs = [old('a', 'Pat Smith', 100, 'fair'), old('b', 'pat smith', 500, 'good'), old('c', 'Someone Else', 800), cur];
    const prev = previousInspection(jobs, cur);
    expect(prev?.at).toBe(500);
    expect(lastAnswer(cur.inspection, prev, 'd:new:cables')?.rating).toBe('good');
    expect(lastAnswer(cur.inspection, prev, 'd:new:rollers')).toBeUndefined();
    expect(previousInspection([cur], cur)).toBeUndefined();
    // No earlier size/maker match falls back to the same position.
    const unnamed = { ...cur, inspection: { ...now, doors: [{ ...now.doors[0], id: 'new' }] } };
    expect(lastAnswer(unnamed.inspection, prev, 'd:new:cables')?.rating).toBe('good');
  });

  it('prints flagged items first with their photos and suggested repair, then says everything else passed', () => {
    let i = EMPTY_INSPECTION(1);
    const d = i.doors[0];
    i = restGood(i, d.id);
    i = setAnswer(i, `d:${d.id}:cables`, { rating: 'fair', note: 'Coils gapping' });
    i = { ...i, repairs: [{ id: 'r1', label: 'Torsion spring pair', price: '185', taxable: true, item: `d:${d.id}:cables` }] };
    const html = inspectionHtml(i, { customer: 'Pat', address: '', inspector: 'J' }, { ...EMPTY_BUSINESS, name: 'Johnsons' }, '', [{ item: `d:${d.id}:cables`, src: 'data:image/jpeg;base64,PIC' }]);
    expect(html).toContain('Suggested repair: Torsion spring pair · $185');
    expect(html).toContain('Everything else passed (17 items).');
    expect(html.indexOf('PIC')).toBeLessThan(html.indexOf('The full checklist follows.'));
    expect(html.match(/PIC/g)).toHaveLength(1);
    expect(html).toContain('not signed yet');
    expect(html).not.toContain('Signature: ____');
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

  it('starts blank, flags a Fair item with a photo and a suggested repair, and finishes onto the ticket', async () => {
    const app = await renderApp('/jobs');
    await settle();
    await fireEvent.press(screen.getByTestId('job-toggle-j1'));
    await fireEvent.press(screen.getByTestId('job-inspection-j1'));
    expect(app.getPathname()).toBe('/inspection/j1');

    const door = EMPTY_INSPECTION(job.savedAt).doors[0];
    // The list shows only what was added: Door 1, not started; no opener or gate.
    expect(screen.getByTestId(`entry-${door.id}`)).toHaveTextContent(/Not started/);
    expect(screen.queryByText('Opener')).toBeNull();
    expect(screen.getByTestId('inspection-summary')).toHaveTextContent(/–.*0.*Flagged.*0\/18/);
    await fireEvent.press(screen.getByTestId(`entry-${door.id}`));
    expect(screen.queryByTestId(`item-d:${door.id}:cables-note`)).toBeNull();

    const cables = `d:${door.id}:cables`;
    await fireEvent.press(screen.getByTestId(`item-d:${door.id}:rollers-good`));
    await fireEvent.press(screen.getByTestId(`item-${cables}-fair`));
    await fireEvent.changeText(screen.getByTestId(`item-${cables}-note`), 'Frayed');
    await fireEvent.press(screen.getByTestId(`item-${cables}-photo`));
    await settle();
    const photos = parseAttachments(await AsyncStorage.getItem(ATTACHMENTS_STORAGE_KEY)).photos;
    expect(photos).toEqual([expect.objectContaining({ jobId: 'j1', item: cables })]);

    // The part picker opens with its search already filled in from the item name.
    await fireEvent.press(screen.getByTestId(`item-${cables}-pick-part`));
    expect(screen.getByTestId('pb-picker-search').props.value).toBe('Cables');
    await fireEvent.press(screen.getByTestId('pb-picker-close'));

    // A filled-in repair on a flagged item is the suggested repair.
    await fireEvent.press(screen.getByTestId(`item-${cables}-repair`));
    const [repair] = parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].inspection!.repairs;
    expect(repair.item).toBe(cables);
    await fireEvent.changeText(screen.getByTestId(`repair-name-${repair.id}`), 'Lift cables (pair)');
    await fireEvent.press(screen.getByTestId(`repair-price-${repair.id}`));
    const pad = screen.getByTestId('keypad');
    for (const k of ['4', '5']) await fireEvent.press(within(pad).getByTestId(`key-${k}`));
    await fireEvent.press(within(pad).getByTestId('keypad-done'));
    expect(screen.queryByTestId(`item-${cables}-repair`)).toBeNull();

    await fireEvent.press(screen.getByTestId(`rest-good-${door.id}`));
    await fireEvent.press(screen.getAllByTestId('inspection-back')[0]);
    expect(screen.getByTestId(`entry-${door.id}`)).toHaveTextContent(/18 of 18 checked.*1 flagged/);
    expect(screen.getByTestId('inspection-summary')).toHaveTextContent(/97%.*1.*Flagged.*18\/18/);
    expect(screen.getByTestId('suggested-repairs')).toHaveTextContent(/Lift cables \(pair\).*from Door 1 · Cables.*\$45/);

    await fireEvent.press(screen.getByTestId('inspection-finish-button'));
    // Without Odoo the unsigned save says what is missing, and nothing is lost.
    await fireEvent.press(screen.getByTestId('inspection-save-unsigned'));
    expect(screen.getByTestId('inspection-note')).toHaveTextContent(/Odoo/);

    await fireEvent.press(screen.getByTestId('inspection-pdf'));
    await settle();
    expect(mockMedia.photoDataUrl).toHaveBeenCalledWith('file:///photos/one.jpg');
    const [html, name] = mockMedia.sharePdf.mock.calls[0];
    expect(html).toContain('Flagged items');
    expect(html).toContain('Suggested repair: Lift cables (pair) · $45');
    expect(html).toContain('Everything else passed');
    expect(html).toContain('data:image/jpeg;base64,AAAA');
    expect(name).toMatch(/^Inspection/);

    // View or download opens the report in the phone's PDF viewer, like the invoice.
    await fireEvent.press(screen.getByTestId('inspection-pdf-view'));
    await settle();
    expect(mockMedia.openPdf).toHaveBeenCalledWith('JVBERi0=', expect.stringMatching(/^Inspection/));

    // The suggested repair stays off the quote until it is sent to the ticket.
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].inspection!.holdRepairs).toBe(true);
    await fireEvent.press(screen.getByTestId('inspection-send-repairs'));
    expect(app.getPathname()).toBe('/quote/j1');
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].inspection!.holdRepairs).toBeUndefined();
  });

  it('adds a second door, an opener and a gate, one at a time', async () => {
    await renderApp('/inspection/j1');
    await settle();
    await fireEvent.press(screen.getByTestId('inspection-add-door'));
    await fireEvent.press(screen.getByTestId('inspection-add-opener'));
    await fireEvent.press(screen.getByTestId('inspection-add-gate'));
    await fireEvent.press(screen.getByTestId('inspection-lube'));
    const insp = parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].inspection!;
    expect(insp.doors).toHaveLength(2);
    expect(insp.doors[0].motors).toHaveLength(0);
    expect(insp.doors[1].motors).toHaveLength(1);
    expect(insp.gate).toEqual({ type: '', answers: {} });
    expect(insp.lubricated).toBe(true);
    expect(screen.queryByTestId('inspection-add-gate')).toBeNull();
    expect(screen.getByTestId('voice-notes')).toHaveTextContent('No voice notes.');

    // The gate has its own page; its swing items show once the type is picked.
    await fireEvent.press(screen.getByTestId('entry-gate'));
    expect(screen.getByTestId('item-g:ul-signs')).toBeTruthy();
    expect(screen.queryByTestId('item-g:swing-pivot')).toBeNull();
    await fireEvent.press(within(screen.getByTestId('gate-type')).getByText('Swing'));
    expect(screen.getByTestId('item-g:swing-pivot')).toBeTruthy();
    expect(screen.queryByTestId('item-g:slide-stops')).toBeNull();
    await fireEvent.press(screen.getAllByTestId('inspection-back')[0]);

    // A door with answers needs a second tap to remove, and removing returns to the list.
    const first = insp.doors[0];
    await fireEvent.press(screen.getByTestId(`entry-${first.id}`));
    await fireEvent.press(screen.getByTestId(`item-d:${first.id}:rollers-good`));
    await fireEvent.press(screen.getByTestId('door-0-remove'));
    expect(screen.getByTestId('door-0-remove')).toHaveTextContent('Tap again: answers will be lost');
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].inspection!.doors).toHaveLength(2);
    await fireEvent.press(screen.getByTestId('door-0-remove'));
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].inspection!.doors.map((d) => d.id)).toEqual([insp.doors[1].id]);
    expect(screen.getByTestId('inspection-add-door')).toBeTruthy();
  });
});
