import { render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { setRolePreview } from '../lib/devFlags';
import { barFor, OFFICE_ONLY_HREFS, SECTIONS } from '../lib/sections';
import { useOfficeOnly } from '../lib/useDepartments';
import { OfficeHome } from '../screens/OfficeAreaScreen';

let held: string[] = [];
let mockSignedIn = true;
const mockClient = {
  session: { kind: 'oca', uid: 5, name: 'Dana', fields: [] },
  call: async (model: string, method: string, args: unknown[] = []) => {
    const k = `${model}.${method}`;
    switch (k) {
      case 'res.users.has_group':
        return held.includes(args[1] as string);
      case 'account.move.search_read':
        return [{ id: 70, name: 'INV/70', partner_id: [9, 'Pine Ridge'], amount_residual: 2150, invoice_date_due: '2020-01-01', ref: false }];
      case 'res.partner.read':
        return [{ id: 9, phone: '', email: 'a@test.test' }];
      case 'sale.order.search_read':
        return [];
      default:
        return [];
    }
  },
};
jest.mock('../lib/useOdoo', () => ({ useOdoo: () => (mockSignedIn ? { status: 'signedIn', client: mockClient } : { status: 'signedOut', client: null }) }));
jest.mock('../lib/useInvoices', () => ({ useInvoices: () => ({ business: { name: 'Johnsons' } }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

beforeEach(() => {
  held = [];
  mockSignedIn = true;
  setRolePreview(null);
});

const hrefs = (k: Parameters<typeof barFor>[0]) => barFor(k).map((id) => SECTIONS.find((s) => s.id === id)?.href);

describe('the office-only bar', () => {
  it('is Home, Office, Customers and More', () => {
    expect(hrefs('office')).toEqual(['/', '/office-desk', '/customers', '/tools']);
    expect(OFFICE_ONLY_HREFS).toEqual(['/office-desk']);
  });

  it('leaves every other bar without the Office tab', () => {
    expect(hrefs('tech')).toEqual(['/', '/jobs', '/tools']);
    expect(hrefs('other')).toEqual(['/', '/jobs', '/customers', '/sales', '/tools']);
  });

  it('a person whose only role is Office gets it', async () => {
    held = ['account.group_account_manager'];
    const { result } = await renderHook(() => useOfficeOnly());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it.each([['owner', 'fieldservice.group_fsm_manager'], ['sales', 'sales_team.group_sale_manager'], ['dispatcher', 'fieldservice.group_fsm_dispatcher']])('Office plus %s keeps the full bar', async (_n, group) => {
    held = ['account.group_account_manager', group];
    const { result } = await renderHook(() => useOfficeOnly());
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current).toBe(false);
  });

  it('Look as office gives it, signed out too', async () => {
    mockSignedIn = false;
    setRolePreview('office');
    const { result } = await renderHook(() => useOfficeOnly());
    await waitFor(() => expect(result.current).toBe(true));
  });
});

describe('Office Home', () => {
  it('shows the overdue dollars and Do next, read from Odoo, and no search or page list', async () => {
    held = ['account.group_account_manager'];
    await render(<OfficeHome client={mockClient as never} now={() => Date.UTC(2026, 10, 27)} />);
    expect(await screen.findByTestId('tile-overdue')).toHaveTextContent(/\$2,?150/);
    expect(await screen.findByTestId('row-account.move-70')).toBeTruthy();
    expect(screen.queryByTestId('office-search')).toBeNull();
    expect(screen.queryByTestId('office-money')).toBeNull();
  });

  it('draws nothing for someone without Office access', async () => {
    held = [];
    await render(<OfficeHome client={mockClient as never} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('office-home')).toBeNull();
  });
});
