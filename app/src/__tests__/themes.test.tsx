import { render, screen } from '@testing-library/react-native';
import { VisitCard } from '../components/VisitCard';
import { DEFAULT_THEME, THEMES, parseTheme, themeById } from '../lib/themes';
import { agingBuckets, chaseOrder, daysLate, isUnpaid, owedOf, sections } from '../lib/salesLayouts';
import type { OdooListRow } from '../lib/odooLists';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 19);
const row = (o: Partial<OdooListRow>): OdooListRow => ({ id: 1, name: 'INV/2026/00001', partnerId: 1, customer: 'Kelly jones', total: 31000, status: 'Not paid', warn: false, ...o });

describe('themes', () => {
  it('has Classic as the default and unknown ids fall back to it', () => {
    expect(DEFAULT_THEME).toBe('classic');
    expect(parseTheme('nope')).toBe('classic');
    expect(parseTheme(undefined)).toBe('classic');
    expect(parseTheme('field')).toBe('field');
  });

  it('keeps Classic exactly as the app was', () => {
    const c = themeById('classic');
    expect(c.shape).toBe('round');
    expect(c.size).toBe('legacy');
    expect(c.accent).toBeNull();
    expect(c.layouts).toEqual({ visitRows: 'card', jobRows: 'card', jobsGroup: 'none', jobsRail: false, jobsTeamFirst: false, jobsMap: false, home: 'classic', homeStartsOnMap: false, sales: 'classic', customers: 'classic', tools: 'classic', jobDetail: 'steps' });
  });

  it('defines eight themes besides Classic, each with a unique id and a plain description', () => {
    expect(THEMES).toHaveLength(9);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(9);
    for (const t of THEMES) {
      expect(t.label).toBeTruthy();
      expect(t.detail.length).toBeGreaterThan(10);
      expect(t.swatch).toHaveLength(3);
    }
  });

  it('never goes below the 40 px thumb target', () => {
    const { BUTTON_PX } = require('../lib/themeLook');
    for (const t of THEMES) expect(BUTTON_PX[t.size]).toBeGreaterThanOrEqual(40);
  });
});

describe('theme start values', () => {
  const load = (apptheme: string | null, palette: string | null = null, brandcolor: string | null = null) => {
    let mod: typeof import('../theme') = undefined as never;
    jest.isolateModules(() => {
      jest.doMock('../lib/themeStart', () => ({
        readStartChoice: () => 'light',
        readStartValue: (k: string) => (k === 'apptheme' ? apptheme : k === 'palette' ? palette : k === 'brandcolor' ? brandcolor : null),
        writeStartChoice: () => undefined,
        writeStartValue: () => undefined,
      }));
      mod = require('../theme');
    });
    return mod;
  };

  it('draws Classic with nothing saved: legacy size, Johnsons green, plain card rows', () => {
    const t = load(null);
    expect(t.themeDef.id).toBe('classic');
    expect(t.look.size).toBe('legacy');
    expect(t.colors.selected).toBe('#12633A');
    expect(t.sp(16)).toBe(16);
    expect(t.layouts.visitRows).toBe('card');
  });

  it('draws each theme with its own shape, size and layouts', () => {
    expect(load('office').look).toMatchObject({ shape: 'square', size: 'tight' });
    expect(load('office').layouts.sales).toBe('aging');
    expect(load('field').layouts.home).toBe('field');
    expect(load('simple').layouts.jobRows).toBe('tile');
    expect(load('dispatch').layouts.jobsTeamFirst).toBe(true);
    expect(load('map').layouts.homeStartsOnMap).toBe(true);
    expect(load('warehouse').layouts).toMatchObject({ home: 'warehouse', tools: 'shop' });
    expect(load('warehouse').look).toMatchObject({ shape: 'round', size: 'comfortable' });
    expect(load('sales')).toMatchObject({ look: { shape: 'square', size: 'compact' } });
    expect(load('sales').layouts).toMatchObject({ home: 'sales', sales: 'table', customers: 'table' });
  });

  it('tints the colors with the theme accent, or the company color when chosen', () => {
    expect(load('dispatch').colors.selected).not.toBe('#12633A');
    expect(load('field').colors.selected).toBe('#12633A');
    const brand = load('office', 'brand', '#C2410C');
    expect(brand.colors.selected).not.toBe(load('office').colors.selected);
    // Company color is only used when the tech chose it.
    expect(load('office', 'johnsons', '#C2410C').colors.selected).toBe(load('office').colors.selected);
  });
});

describe('VisitCard rows', () => {
  const props = { top: 'FO042', chip: 'New', name: 'Old Bastrop Hwy', address: 'San Marcos', what: 'Spring repair', note: 'Today 2:00 PM', onPress: () => undefined };
  for (const variant of ['card', 'dense', 'edge', 'tile', 'big', 'table'] as const) {
    it(`draws the ${variant} row with the job's name`, async () => {
      await render(<VisitCard {...props} variant={variant} testID="row" />);
      expect(screen.getByTestId('row')).toBeTruthy();
      expect(screen.getAllByText(/Old Bastrop Hwy|San Marcos/).length).toBeGreaterThan(0);
    });
  }
});

describe('sales layout helpers', () => {
  const rows = [
    row({ id: 1, status: 'Overdue', warn: true, due: NOW - 3 * DAY, total: 30000, residual: 30000 }),
    row({ id: 2, status: 'Overdue', warn: true, due: NOW - 40 * DAY, total: 50000, residual: 20000 }),
    row({ id: 3, status: 'Not paid', warn: false, due: NOW + 5 * DAY, total: 10000, residual: 10000 }),
    row({ id: 4, status: 'Paid', total: 99900 }),
    row({ id: 5, status: 'Paid', refund: true, total: 5000 }),
  ];

  it('knows what is unpaid and what is owed', () => {
    expect(rows.map(isUnpaid)).toEqual([true, true, true, false, false]);
    expect(owedOf(rows[1])).toBe(20000);
    expect(owedOf(rows[3])).toBe(0);
  });

  it('counts whole days late', () => {
    expect(daysLate(rows[0], NOW)).toBe(3);
    expect(daysLate(rows[2], NOW)).toBe(0);
    expect(daysLate(row({}), NOW)).toBe(0);
  });

  it('adds up what is owed by age', () => {
    const b = agingBuckets(rows, NOW);
    expect(b.map((x) => [x.bucket, x.total, x.count])).toEqual([
      ['Current', 10000, 1],
      ['1-7 days', 30000, 1],
      ['8-30 days', 0, 0],
      ['30+ days', 20000, 1],
    ]);
  });

  it('puts the longest overdue first in the chase order, and leaves out paid ones', () => {
    expect(chaseOrder(rows, NOW).map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it('groups rows into Overdue, Not paid yet and Paid and other', () => {
    const s = sections(rows, NOW);
    expect(s.map((x) => [x.title, x.rows.length, x.owed])).toEqual([
      ['Overdue', 2, 50000],
      ['Not paid yet', 1, 10000],
      ['Paid and other', 2, 0],
    ]);
  });
});
