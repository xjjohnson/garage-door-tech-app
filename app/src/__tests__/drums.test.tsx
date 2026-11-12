import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { renderApp } from '../testing/renderApp';
import { DEFAULT_DRUMS_FORM, runDrums } from '../lib/forms';
import { createJob, JOBS_STORAGE_KEY, parseJobs } from '../lib/jobs';
import { DEFAULT_PRICE_SHEET } from '../lib/prices';
import { buildQuote } from '../lib/quote';

const HIGH = { ...DEFAULT_DRUMS_FORM, weight: '150', highLift: '36' };

describe('drums form (plain logic)', () => {
  it('high lift needs the high lift and the weight', () => {
    const out = runDrums(DEFAULT_DRUMS_FORM);
    expect(out).toEqual({ status: 'incomplete', missing: ['High lift', 'Door weight'] });
  });
  it('gives turns and springs on D400-54', () => {
    const out = runDrums(HIGH);
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    expect(out.result.highLift?.turns).toBe(10.5);
    expect(out.result.highLift?.options.length).toBeGreaterThan(0);
  });
  it('standard lift only needs a height, and points to Size from door for springs', () => {
    const out = runDrums({ ...DEFAULT_DRUMS_FORM, lift: 'standard' });
    expect(out.status).toBe('ok');
    if (out.status === 'ok') expect(out.result.noTurns).toMatch(/Size from door/);
  });
  it('a high lift too tall for the D400-54 chart lists drums but no turns', () => {
    const out = runDrums({ ...HIGH, heightChoice: 'other', heightOther: '168', highLift: '30' });
    expect(out.status).toBe('ok');
    if (out.status === 'ok') {
      expect(out.result.highLift).toBeUndefined();
      expect(out.result.fits.find((f) => f.drum.model === 'D525-54')?.fits).toBe(true);
    }
  });
  it('saves as a job and quotes from the springs at each rating', () => {
    const j = createJob({ mode: 'drums', form: HIGH }, { customer: 'Lee', address: '', phone: '', notes: '' }, { title: 'Wind 10 1/2' }, 5, 'd1');
    expect(parseJobs(JSON.stringify([j]))[0]).toMatchObject({ mode: 'drums', form: { highLift: '36' } });
    const q = buildQuote({ mode: 'drums', form: HIGH }, { ...DEFAULT_PRICE_SHEET, spring: { good: '60', better: '80', best: '100' } });
    expect(q.blocked).toBeUndefined();
    expect(q.options[0].lines[0].cents).toBe(12000);
    expect(q.options[0].spring!.life.cycles).toBeGreaterThanOrEqual(10_000);
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

describe('high lift tab in the app', () => {
  it('works out turns for a high-lift door', async () => {
    await renderApp('/springs');
    await fireEvent.press(screen.getByTestId('tab-drums'));
    await fireEvent.press(screen.getByTestId('field-drums-high-lift'));
    await keypad(['3', '6']);
    await fireEvent.press(screen.getByTestId('field-drums-weight'));
    await keypad(['1', '5', '0']);
    expect(screen.getByTestId('drums-bar')).toHaveTextContent(/Wind 10 1\/2 turns/);
    expect(screen.getByTestId('card-high-lift-options')).toBeTruthy();
    expect(screen.getByTestId('drum-D400-54')).toHaveTextContent(/✓ D400-54/);
  });
});

describe('heavy sectional on the drums tab', () => {
  const HEAVY = { ...DEFAULT_DRUMS_FORM, lift: 'standard' as const, heightChoice: 'other', heightOther: '168', weight: '700', springCount: 4 as const, ids: [3.75] };
  it('sizes a heavy door on D525-216', () => {
    const out = runDrums(HEAVY);
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    expect(out.result.heavy?.turns).toBe(10.75);
    expect(out.result.heavy?.options.length).toBeGreaterThan(0);
  });
  it('standard lift without a weight just lists drums', () => {
    const out = runDrums({ ...HEAVY, weight: '' });
    expect(out.status === 'ok' && out.result.heavy).toBeFalsy();
  });
  it('quotes four springs', () => {
    const q = buildQuote({ mode: 'drums', form: HEAVY }, { ...DEFAULT_PRICE_SHEET, spring: { good: '100', better: '140', best: '180' } });
    expect(q.options[0].lines[0].label).toMatch(/^4 springs, /);
    expect(q.options[0].lines[0].cents).toBe(40000);
  });
  it('high lift refuses four springs', () => {
    expect(runDrums({ ...HIGH, springCount: 4 }).status).toBe('error');
  });
});
