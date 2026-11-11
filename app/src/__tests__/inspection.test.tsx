import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { CHECK_ITEMS, checkCounts, Inspection, inspectionText, parseInspection, repairLines, withRepairs } from '../lib/inspection';
import { createJob, JOBS_STORAGE_KEY, parseJobs } from '../lib/jobs';
import { DEFAULT_PRICE_SHEET, PRICE_SHEET_STORAGE_KEY, PriceSheet } from '../lib/prices';
import { buildQuote } from '../lib/quote';
import { renderApp } from '../testing/renderApp';

const MATCH = { mode: 'match' as const, form: { ...DEFAULT_MATCH_FORM, twentyCoil: '4 1/2', length: '24' } };
const SHEET: PriceSheet = { ...DEFAULT_PRICE_SHEET, serviceCall: '89', springLabor: '150', spring: { good: '60', better: '85', best: '120' }, taxPercent: '10' };
const job = createJob(MATCH, { customer: 'Pat Smith', address: '12 Oak St', phone: '', notes: '' }, { title: '.225 × 2" × 24"' }, 1000, 'j1');

const INSP: Inspection = {
  at: new Date(2026, 10, 11).getTime(),
  results: { cables: { status: 'fix', note: 'Frayed at the bottom' }, rollers: { status: 'ok', note: '' }, 'photo-eyes': { status: 'na', note: '' } },
  repairs: [
    { id: 'r1', label: 'Lift cables (pair)', price: '45', taxable: true },
    { id: 'r2', label: 'Extra labor', price: '30', taxable: false },
    { id: 'r3', label: 'No price yet', price: '', taxable: true },
  ],
};

describe('safety check (plain logic)', () => {
  it('counts what was checked and what needs work', () => {
    expect(checkCounts(INSP)).toEqual({ done: 3, fix: 1, total: CHECK_ITEMS.length });
    expect(checkCounts(undefined).done).toBe(0);
  });

  it('adds priced repairs to every option and works out tax again', () => {
    expect(repairLines(INSP).map((l) => l.label)).toEqual(['Lift cables (pair)', 'Extra labor']);
    const base = buildQuote(MATCH, SHEET);
    const q = withRepairs(base, INSP, SHEET);
    for (let i = 0; i < 3; i++) {
      const before = base.options[i];
      const after = q.options[i];
      if (!before.available) continue;
      expect(after.subtotal).toBe(before.subtotal + 4500 + 3000);
      // Only the cables are taxed: 10% of $45.
      expect(after.tax).toBe(before.tax + 450);
      expect(after.total).toBe(after.subtotal + after.tax);
    }
    expect(withRepairs(base, undefined, SHEET)).toBe(base);
  });

  it('writes a report for the customer', () => {
    const text = inspectionText(INSP, 'Pat Smith');
    expect(text).toMatch(/^Garage door safety check for Pat Smith/);
    expect(text).toMatch(/Needs work:\n- Lift cables: Frayed at the bottom/);
    expect(text).toMatch(/Checked and OK: Rollers/);
    expect(text).toMatch(/- Lift cables \(pair\): \$45/);
  });

  it('reads a saved check safely, and jobs keep it', () => {
    expect(parseInspection(null)).toBeUndefined();
    const p = parseInspection({ at: 5, results: { cables: { status: 'broken' }, rollers: { status: 'ok' } }, repairs: [{ id: 'a', label: 'X', price: '5' }, { nope: 1 }] });
    expect(p).toEqual({ at: 5, results: { rollers: { status: 'ok', note: '' } }, repairs: [{ id: 'a', label: 'X', price: '5', taxable: true }] });
    expect(parseJobs(JSON.stringify([{ ...job, inspection: INSP }]))[0].inspection).toEqual(INSP);
  });
});

async function settle() {
  for (let i = 0; i < 5; i++) await act(async () => undefined);
}

describe('safety check in the app', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(PRICE_SHEET_STORAGE_KEY, JSON.stringify(SHEET));
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([job]));
  });

  it('marks items, turns a problem into a priced repair, and the quote includes it', async () => {
    const app = await renderApp('/jobs');
    await settle();
    await fireEvent.press(screen.getByTestId('job-toggle-j1'));
    await fireEvent.press(screen.getByTestId('job-inspection-j1'));
    expect(app.getPathname()).toBe('/inspection/j1');

    await fireEvent.press(screen.getByTestId('check-rollers-ok'));
    await fireEvent.press(screen.getByTestId('check-cables-fix'));
    await fireEvent.changeText(screen.getByTestId('check-cables-note'), 'Frayed');
    await fireEvent.press(screen.getByTestId('check-cables-repair'));
    expect(screen.getByTestId('inspection-summary')).toHaveTextContent('2 of 14 checked, 1 needs work');

    const [repair] = parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].inspection!.repairs;
    expect(repair.label).toBe('Lift cables: repair');
    await fireEvent.press(screen.getByTestId(`repair-price-${repair.id}`));
    const pad = screen.getByTestId('keypad');
    for (const k of ['4', '5']) await fireEvent.press(within(pad).getByTestId(`key-${k}`));
    await fireEvent.press(within(pad).getByTestId('keypad-done'));

    await fireEvent.press(screen.getByTestId('inspection-rest-ok'));
    expect(screen.getByTestId('inspection-summary')).toHaveTextContent('14 of 14 checked, 1 needs work');

    const base = buildQuote(MATCH, SHEET).options[0];
    await fireEvent.press(screen.getByTestId('inspection-quote'));
    expect(app.getPathname()).toBe('/quote/j1');
    expect(screen.getByTestId('quote-good')).toHaveTextContent(/Lift cables: repair/);
    // $45 taxed at 10%.
    expect(screen.getByTestId('quote-total-good')).toHaveTextContent(`$${((base.total + 4950) / 100).toFixed(2)}`);
    expect(screen.getByTestId('quote-inspection')).toHaveTextContent('Safety check (1 repair added)');
  });
});
