import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { DIAG_BRANDS } from '../data/diagnostics';
import { MANUAL_LINKS } from '../data/manuals';
import { PROG_FAMILIES, PROG_TASK_ORDER } from '../data/programming';
import { manualsFor, progBrands, progFamiliesFor } from '../lib/programming';
import { DiagnoseScreen } from '../screens/DiagnoseScreen';

// A Diagnose maker id → the Manuals library makers its guides may link.
const MANUAL_BRANDS: Record<string, string[]> = { liftmaster: ['liftmaster', 'chamberlain'], genie: ['genie'], linear: ['linear'], guardian: ['guardian'] };

describe('programming data', () => {
  it('has unique family ids, known makers, and the four jobs plus erase for each', () => {
    const ids = PROG_FAMILIES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of PROG_FAMILIES) {
      expect(DIAG_BRANDS.some((b) => b.id === f.brand)).toBe(true);
      expect(f.tasks.map((t) => t.kind).sort()).toEqual([...PROG_TASK_ORDER].sort());
      expect(f.identify.length).toBeGreaterThan(20);
      expect(f.models.length).toBeGreaterThan(0);
    }
  });

  it('gives every task real steps, and says what to check until a date is set', () => {
    for (const f of PROG_FAMILIES) {
      for (const t of f.tasks) {
        expect(t.steps.length).toBeGreaterThan(1);
        for (const s of t.steps) expect(s.trim().length).toBeGreaterThan(10);
        if (t.checked) expect(Number.isNaN(Date.parse(t.checked))).toBe(false);
        else expect({ family: f.id, task: t.kind, toCheck: (t.toCheck ?? []).length > 0 }).toEqual({ family: f.id, task: t.kind, toCheck: true });
      }
    }
  });

  it("links only manuals from the library, from the family's own maker", () => {
    for (const f of PROG_FAMILIES) {
      expect(manualsFor(f).length).toBe(f.manuals.length);
      for (const m of manualsFor(f)) expect({ family: f.id, manual: m.id, ok: MANUAL_BRANDS[f.brand].includes(m.brand) }).toEqual({ family: f.id, manual: m.id, ok: true });
    }
    expect(MANUAL_LINKS.length).toBeGreaterThan(0);
  });

  it('covers LiftMaster and Genie', () => {
    expect(progBrands()).toEqual(expect.arrayContaining(['liftmaster', 'genie']));
    expect(progFamiliesFor('liftmaster').length).toBeGreaterThan(1);
  });
});

describe('Program mode on Diagnose', () => {
  it('shows remote steps first, and the safety box for travel limits', async () => {
    const openUrl = jest.fn(() => Promise.resolve());
    await render(<DiagnoseScreen openUrl={openUrl} />);
    await fireEvent.press(screen.getByText('Program'));
    expect(screen.getByTestId('program-lm-arrows-remote')).toBeTruthy();
    expect(screen.queryByTestId('program-safety')).toBeNull();
    expect(screen.getByTestId('program-unchecked')).toBeTruthy();

    await fireEvent.press(screen.getByText('Travel limits'));
    expect(screen.getByTestId('program-lm-arrows-limits')).toBeTruthy();
    expect(screen.getByTestId('program-safety')).toBeTruthy();

    await fireEvent.press(screen.getByText('Older openers with limit screws and force dials'));
    expect(screen.getByTestId('program-lm-dials-limits')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('program-manual-liftmaster-manuals'));
    expect(openUrl).toHaveBeenCalledWith(MANUAL_LINKS.find((l) => l.id === 'liftmaster-manuals')!.docs?.[0]?.url ?? MANUAL_LINKS.find((l) => l.id === 'liftmaster-manuals')!.url);
  });

  it('switches maker and keeps the chosen job', async () => {
    await render(<DiagnoseScreen openUrl={() => Promise.resolve()} />);
    await fireEvent.press(screen.getByText('Program'));
    await fireEvent.press(screen.getByText('Force'));
    await fireEvent.press(within(screen.getByTestId('program-brands')).getByText('Genie'));
    expect(screen.getByTestId('program-genie-arrows-force')).toBeTruthy();
  });
});
