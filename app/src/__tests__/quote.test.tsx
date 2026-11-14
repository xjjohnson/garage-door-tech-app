import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { renderApp } from '../testing/renderApp';
import { DEFAULT_DOOR_FORM, DEFAULT_EXTENSION_FORM, DEFAULT_MATCH_FORM } from '../lib/forms';
import { createJob, JOBS_STORAGE_KEY, parseJobs } from '../lib/jobs';
import { cents, DEFAULT_PRICE_SHEET, formatMoney, parsePriceSheet, PRICE_SHEET_STORAGE_KEY, PriceSheet } from '../lib/prices';
import { buildQuote, quoteText } from '../lib/quote';

/** .225 × 2" × 24" pair on a 7' door. */
const MATCH = { mode: 'match' as const, form: { ...DEFAULT_MATCH_FORM, twentyCoil: '4 1/2', length: '24' } };

const SHEET: PriceSheet = {
  serviceCall: '89',
  springLabor: '150',
  spring: { good: '60', better: '85', best: '120' },
  extensionSpring: { good: '30', better: '45', best: '45' },
  extensionLabor: '95',
  addOns: [
    { id: 'c', name: 'Lift cables (pair)', price: '45', tiers: { good: false, better: true, best: true } },
    { id: 'r', name: 'Rollers', price: '80', tiers: { good: false, better: false, best: true } },
  ],
  taxPercent: '8.25',
  odoo: {},
};

describe('prices and quotes (plain logic)', () => {
  it('reads money as cents and writes it back', () => {
    expect(cents('42.5')).toBe(4250);
    expect(cents('')).toBe(0);
    expect(cents('abc')).toBe(0);
    expect(formatMoney(101260)).toBe('$1,012.60');
    expect(formatMoney(97500)).toBe('$975');
  });

  it('prices good, better and best from the sheet, taxing parts only', () => {
    const q = buildQuote(MATCH, SHEET);
    expect(q.blocked).toBeUndefined();
    expect(q.options.map((o) => o.available)).toEqual([true, true, true]);
    const [good, better, best] = q.options;
    // Good: 2 × $60 springs + $150 labor + $89 call; tax 8.25% on $120 = $9.90.
    expect(good.lines[0].label).toBe('2 springs, .225 × 2" × 24"');
    expect(good.subtotal).toBe(35900);
    expect(good.tax).toBe(990);
    expect(good.total).toBe(36890);
    // Better adds cables; its springs are the 25k upgrade, not the old size.
    expect(better.lines.map((l) => l.label)).toContain('Lift cables (pair)');
    expect(better.spring!.life.cycles).toBeGreaterThanOrEqual(25_000);
    expect(better.subtotal).toBe(2 * 8500 + 15000 + 8900 + 4500);
    expect(best.lines.map((l) => l.label)).toEqual(expect.arrayContaining(['Lift cables (pair)', 'Rollers']));
    expect(best.spring!.life.cycles).toBeGreaterThanOrEqual(50_000);
  });

  it('quotes a size-from-door job from the lightest spring at each rating', () => {
    const q = buildQuote({ mode: 'door', form: { ...DEFAULT_DOOR_FORM, weight: '164' } }, SHEET);
    expect(q.options.every((o) => o.available)).toBe(true);
    expect(q.options[2].spring!.life.cycles).toBeGreaterThanOrEqual(50_000);
  });

  it('gives no quote while the calculator has a STOP or is missing inputs', () => {
    expect(buildQuote({ mode: 'match', form: DEFAULT_MATCH_FORM }, SHEET).blocked).toMatch(/Missing/);
    expect(buildQuote({ mode: 'match', form: { ...MATCH.form, twentyCoil: '4 7/16' } }, SHEET).blocked).toBeTruthy();
  });

  it('quotes an extension job: the same springs on every option, priced by option', () => {
    const q = buildQuote({ mode: 'extension', form: { ...DEFAULT_EXTENSION_FORM, weight: '147' } }, SHEET);
    expect(q.blocked).toBeUndefined();
    const [good, better] = q.options;
    expect(good.lines[0].label).toBe('2 extension springs, 140 lb Blue, 25" × 42"');
    expect(good.lines[1]).toMatchObject({ label: 'Extension spring labor', cents: 9500 });
    // 2 × $30 + $95 + $89; tax 8.25% on $60 = $4.95.
    expect(good.subtotal).toBe(6000 + 9500 + 8900);
    expect(good.tax).toBe(495);
    expect(better.lines[0].cents).toBe(9000);
    expect(better.extension).toEqual([{ ratingLb: 140, color: 'Blue' }]);
  });

  it('names a four-spring door with mixed springs', () => {
    const q = buildQuote({ mode: 'extension', form: { ...DEFAULT_EXTENSION_FORM, weight: '214', springsPerSide: 2 } }, SHEET);
    expect(q.options[0].lines[0].label).toBe('4 extension springs, 110 + 100 lb a side, 25" × 42"');
    expect(q.options[0].lines[0].cents).toBe(4 * 3000);
  });

  it('gives no extension quote from a color alone', () => {
    expect(buildQuote({ mode: 'extension', form: { ...DEFAULT_EXTENSION_FORM, oldColor: 'Blue' } }, SHEET).blocked).toMatch(/repeat every 100 lb/);
  });

  it('writes a plain-text quote to send', () => {
    const text = quoteText(buildQuote(MATCH, SHEET), 'Pat Smith');
    expect(text).toContain('for Pat Smith');
    expect(text).toContain('GOOD: $368.90');
    expect(text).toContain('- Rollers: $80');
  });

  it('reads back a saved sheet and falls back on junk', () => {
    expect(parsePriceSheet(JSON.stringify(SHEET))).toEqual(SHEET);
    expect(parsePriceSheet('nope')).toEqual(DEFAULT_PRICE_SHEET);
    expect(parsePriceSheet(JSON.stringify({ serviceCall: 5, addOns: [{ id: 'x' }] }))).toMatchObject({ serviceCall: '', addOns: [] });
  });
});

async function keypad(keys: string[]) {
  const pad = screen.getByTestId('keypad');
  for (const k of keys) await fireEvent.press(within(pad).getByTestId(`key-${k}`));
  await fireEvent.press(within(pad).getByTestId('keypad-done'));
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('quotes in the app', () => {
  it('asks for prices, then quotes the job and records what the customer picked', async () => {
    const job = createJob(MATCH, { customer: 'Pat Smith', address: '12 Oak St', phone: '', notes: '' }, { title: '.225 × 2" × 24"' }, 1000, 'j1');
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([job]));
    await AsyncStorage.setItem(PRICE_SHEET_STORAGE_KEY, JSON.stringify({ ...DEFAULT_PRICE_SHEET, spring: { good: '60', better: '60', best: '60' }, springLabor: '150' }));
    await renderApp();
    await fireEvent.press(screen.getByTestId('section-jobs'));
    await fireEvent.press(await screen.findByTestId('job-toggle-j1'));
    await fireEvent.press(screen.getByTestId('job-quote-j1'));

    // No Springs templates in Odoo yet: the notice says to make them, with no price sheet to open.
    expect(screen.getByTestId('quote-no-spring-templates')).toBeTruthy();
    expect(screen.queryByTestId('quote-set-prices')).toBeNull();
    // 2 × $60 + $150 labor, no tax set.
    expect(screen.getByTestId('quote-total-good')).toHaveTextContent('$270');
    await fireEvent.press(screen.getByTestId('quote-accept-good'));
    expect(screen.getByTestId('quote-accepted-note')).toHaveTextContent(/^Customer picked Good at \$270 on /);
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].accepted).toMatchObject({ tier: 'good', total: 27000 });

    await fireEvent.press(screen.getByTestId('quote-sheet-close'));
    expect(screen.getByTestId('job-accepted-j1')).toHaveTextContent(/Picked Good, \$270/);
  });
});
