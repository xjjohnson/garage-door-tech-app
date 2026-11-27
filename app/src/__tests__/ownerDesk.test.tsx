import { render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { fireEvent } from '@testing-library/react-native';
import { setRolePreview } from '../lib/devFlags';
import { ageBuckets, changePercent, dollars } from '../lib/ownerMoney';
import { barFor, OWNER_ONLY_HREFS, SECTIONS } from '../lib/sections';
import { OWNER_COLORS, themeById } from '../lib/themes';
import { useOwnerBar } from '../lib/useDepartments';
import { OwnerAreas, OwnerHome, OwnerManage, OwnerMoney } from '../screens/OwnerDesk';

type Call = [string, string, unknown[]];
const calls: Call[] = [];
let held: string[] = [];
let mockSignedIn = true;

const mockClient = {
  session: { kind: 'oca', uid: 1, name: 'Justin', fields: [] },
  jobsPlannedBetween: async () => [],
  techs: async () => [],
  jobsBetween: async () => [],
  call: async (model: string, method: string, args: unknown[] = []) => {
    calls.push([model, method, args]);
    switch (`${model}.${method}`) {
      case 'res.users.has_group':
        return held.includes(args[1] as string);
      case 'account.move.search_read':
        return [
          { id: 70, name: 'INV/70', partner_id: [9, 'Pine Ridge'], amount_residual: 2150, invoice_date_due: '2020-01-01', ref: false },
          { id: 71, name: 'INV/71', partner_id: [10, 'Alvarez'], amount_residual: 840, invoice_date_due: '2999-01-01', ref: false },
        ];
      case 'sale.order.search_read':
        return [{ id: 80, name: 'S0080', partner_id: [9, 'Maria Lopez'], amount_total: 1420, write_date: '2020-01-01 12:00:00', date_order: '2020-01-01 12:00:00', client_order_ref: false }];
      case 'purchase.order.line.search_read':
        return [{ product_id: [5, 'Spring'], price_unit: 42.3, date_order: '2026-11-20 12:00:00' }];
      case 'product.product.read':
        return [{ id: 5, name: 'Spring', standard_price: 38.2, list_price: 80 }];
      case 'hr.attendance.search_count':
        return 3;
      case 'fsm.order.search_count':
        return 4;
      default:
        return [];
    }
  },
};
jest.mock('../lib/useOdoo', () => ({ useOdoo: () => (mockSignedIn ? { status: 'signedIn', client: mockClient } : { status: 'signedOut', client: null }) }));
jest.mock('../lib/useStats', () => ({
  useStats: () => ({
    stats: {
      openJobs: 3,
      owed: 299000,
      owedInvoices: 2,
      week: { collected: 120000 },
      month: { collected: 1842000 },
      months: [{ start: 1, collected: 1644000 }, { start: 2, collected: 1842000 }],
      days: [{ start: Date.UTC(2026, 10, 26), collected: 50000 }, { start: Date.UTC(2026, 10, 27), collected: 20000 }],
    },
    fromOdoo: true,
  }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));

beforeEach(() => {
  calls.length = 0;
  held = [];
  mockSignedIn = true;
  setRolePreview(null);
  (router.push as jest.Mock).mockClear();
  (router.navigate as jest.Mock).mockClear();
});

describe('owner sums', () => {
  it('buckets what is owed by how late it is', () => {
    expect(ageBuckets([{ cents: 100, days: 0 }, { cents: 200, days: 12 }, { cents: 400, days: 41 }, { cents: 800, days: 30 }])).toEqual({ current: 100, late30: 1000, late: 400 });
  });
  it('gives the change from last time in whole percent, or null with nothing to compare', () => {
    expect(changePercent(1842000, 1644000)).toBe(12);
    expect(changePercent(50, 100)).toBe(-50);
    expect(changePercent(50, 0)).toBeNull();
  });
  it('writes whole dollars with commas', () => {
    expect(dollars(1842000)).toBe('$18,420');
    expect(dollars(-2500)).toBe('-$25');
  });
});

describe('the owner bar', () => {
  const hrefs = () => barFor('owner').map((id) => SECTIONS.find((s) => s.id === id)?.href);
  it('is Home, Jobs, Money, Areas and Manage', () => {
    expect(hrefs()).toEqual(['/', '/jobs', '/money', '/areas', '/manage']);
    expect(OWNER_ONLY_HREFS).toEqual(['/money', '/areas', '/manage']);
  });
  it('leaves the other bars as they were', () => {
    expect(barFor('other').map((id) => SECTIONS.find((s) => s.id === id)?.href)).toEqual(['/', '/jobs', '/customers', '/sales', '/tools']);
  });
  it('an Odoo owner gets it, a tech does not, and the signed-out phone keeps its full bar', async () => {
    held = ['fieldservice.group_fsm_manager'];
    const a = await renderHook(() => useOwnerBar());
    await waitFor(() => expect(a.result.current).toBe(true));
    held = [];
    const b = await renderHook(() => useOwnerBar());
    await new Promise((r) => setTimeout(r, 50));
    expect(b.result.current).toBe(false);
    mockSignedIn = false;
    setRolePreview('owner');
    const c = await renderHook(() => useOwnerBar());
    await new Promise((r) => setTimeout(r, 50));
    expect(c.result.current).toBe(false);
  });
});

describe('the Owner theme colors', () => {
  it('has a warm light page and a charcoal dark one, both with the Johnsons green header', () => {
    expect(themeById('owner').colors).toBe(OWNER_COLORS);
    expect(OWNER_COLORS.light.bg).toBe('#F6F4EC');
    expect(OWNER_COLORS.dark.bg).toBe('#14171A');
    expect(OWNER_COLORS.light.head).toBe('#002D04');
    expect(OWNER_COLORS.dark.head).toBe('#002D04');
  });
});

describe('owner screens', () => {
  it('Home shows the month, what is owed, the cost increase to review and the chase lines', async () => {
    await render(<OwnerHome now={() => Date.UTC(2026, 10, 27, 15)} />);
    expect(await screen.findByText('$18,420')).toBeTruthy();
    expect(screen.getByText('▲ 12% vs last month')).toBeTruthy();
    expect(screen.getByText('$2,990')).toBeTruthy();
    expect(await screen.findByText('Cost went up on 1 part')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('owner-need-cost'));
    expect(router.push).toHaveBeenCalledWith('/purchasing');
    expect(await screen.findByText(/3 clocked in/)).toBeTruthy();
  });

  it('Home asks to sign in when Odoo is not connected', async () => {
    mockSignedIn = false;
    await render(<OwnerHome />);
    expect(screen.getByTestId('owner-signin')).toBeTruthy();
  });

  it('Money lists what is owed by age and who to chase, and only reads Odoo', async () => {
    await render(<OwnerMoney now={() => Date.UTC(2026, 10, 27, 15)} />);
    expect(await screen.findByText('Over 30 days late')).toBeTruthy();
    expect(await screen.findByTestId('owner-chase-70')).toBeTruthy();
    expect(screen.queryByTestId('owner-chase-71')).toBeNull();
    expect(calls.some((c) => ['write', 'create', 'unlink'].includes(c[1]))).toBe(false);
  });

  it('Areas has a tile for every area and the rest of the app one tap away', async () => {
    await render(<OwnerAreas />);
    for (const a of ['dispatch', 'office', 'sales', 'warehouse', 'purchasing', 'overview']) expect(screen.getByTestId(`owner-area-${a}`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('owner-area-purchasing'));
    expect(router.push).toHaveBeenCalledWith('/purchasing');
    await fireEvent.press(screen.getByTestId('owner-areas-customers'));
    expect(router.navigate).toHaveBeenCalledWith('/customers');
    await fireEvent.press(screen.getByTestId('owner-areas-tools'));
    expect(router.navigate).toHaveBeenCalledWith('/tools');
  });

  it('Manage opens Management, price book, numbers, scorecard, setup and settings', async () => {
    const view = await render(<OwnerManage now={() => Date.UTC(2026, 10, 27, 15)} />);
    for (const [id, href] of [['management', '/management'], ['price-book', '/price-book'], ['stats', '/stats'], ['scorecard', '/scorecard'], ['setup', '/setup'], ['settings', '/settings'], ['costs', '/purchasing']] as const) {
      await fireEvent.press(await view.findByTestId(`owner-manage-${id}`));
      expect(router.push).toHaveBeenCalledWith(href);
    }
    expect(await view.findByText('1 to review')).toBeTruthy();
  });
});
