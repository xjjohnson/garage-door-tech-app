import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { barFor, SALES_ONLY_HREFS, SECTIONS } from '../lib/sections';
import { setRolePreview } from '../lib/devFlags';
import { requestNote, requestParts, requestTitle } from '../lib/odooPartsRequests';
import { useSalesOnly } from '../lib/useDepartments';
import { renderHook } from '@testing-library/react-native';
import { RequestPartsScreen } from '../screens/RequestPartsScreen';
import { SalesHome, SalesInvoices, SalesQuotes } from '../screens/SalesDesk';

type Call = [string, string, unknown[], Record<string, unknown>?];
const calls: Call[] = [];
let held: string[] = [];
let mockSignedIn = true;

const mockClient = {
  session: { kind: 'oca', uid: 5, name: 'Sam', fields: [] },
  listJobs: async (filter: string, search = '') => {
    calls.push(['fsm.order', `listJobs:${filter}:${search}`, []]);
    return [
      { id: 501, name: 'FSM/501', customer: 'Maria Lopez', customerId: 9, phone: '', address: '3 Cedar Way', stage: 'In progress', notes: '', assignees: [] },
      { id: 502, name: 'FSM/502', customer: '', phone: '', address: '', stage: 'New', notes: '', assignees: [] },
    ];
  },
  call: async (model: string, method: string, args: unknown[] = [], kw: Record<string, unknown> = {}) => {
    calls.push([model, method, args, kw]);
    const k = `${model}.${method}`;
    switch (k) {
      case 'res.users.has_group':
        return held.includes(args[1] as string);
      case 'sale.order.search_read':
        return [{ id: 80, name: 'S0080', partner_id: [9, 'Maria Lopez'], amount_total: 1420, write_date: '2020-01-01 12:00:00', date_order: '2020-01-01 12:00:00', client_order_ref: false }];
      case 'account.move.search_read':
        return [{ id: 70, name: 'INV/70', partner_id: [9, 'Pine Ridge'], amount_residual: 2150, invoice_date_due: '2020-01-01', ref: false }];
      case 'res.partner.read':
        return [{ id: 9, phone: '(555) 010-0100', email: 'a@test.test' }];
      case 'res.partner.name_search':
        return [[9, 'Maria Lopez']];
      case 'product.product.search':
        return [31];
      case 'product.product.read':
        return [{ id: 31, name: 'Torsion spring .243', default_code: 'TS243', barcode: false, standard_price: 20 }];
      case 'ir.model.search':
        return [4];
      case 'mail.activity.create':
        return 99;
      case 'mail.activity.search':
      case 'mail.activity.search_read':
      case 'mail.activity.search_count':
      case 'sale.order.search_count':
      case 'account.move.search_count':
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
  calls.length = 0;
  held = [];
  mockSignedIn = true;
  setRolePreview(null);
});
const wrote = (m: string) => calls.some((c) => c[1] === m);

describe('the sales-only bar', () => {
  const hrefs = (k: Parameters<typeof barFor>[0]) => barFor(k).map((id) => SECTIONS.find((s) => s.id === id)?.href);

  it('is Home, Quotes, Invoices, Customers and More', () => {
    expect(hrefs('sales')).toEqual(['/', '/quotes', '/sales-invoices', '/customers', '/tools']);
    expect(SALES_ONLY_HREFS).toEqual(['/quotes', '/sales-invoices']);
  });

  it('leaves every other bar as it was', () => {
    expect(hrefs('tech')).toEqual(['/', '/jobs', '/tools']);
    expect(hrefs('dispatcher')).toEqual(['/', '/jobs', '/needs', '/week', '/tools']);
    expect(hrefs('other')).toEqual(['/', '/jobs', '/customers', '/sales', '/tools']);
  });

  it('a person whose only role is Sales gets it', async () => {
    held = ['sales_team.group_sale_manager'];
    const { result } = await renderHook(() => useSalesOnly());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it.each([['owner', 'fieldservice.group_fsm_manager'], ['office', 'account.group_account_manager'], ['dispatcher', 'fieldservice.group_fsm_dispatcher']])('Sales plus %s keeps the full bar', async (_n, group) => {
    held = ['sales_team.group_sale_manager', group];
    const { result } = await renderHook(() => useSalesOnly());
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current).toBe(false);
  });

  it('Look as sales gives it, signed out too', async () => {
    mockSignedIn = false;
    setRolePreview('sales');
    const { result } = await renderHook(() => useSalesOnly());
    await waitFor(() => expect(result.current).toBe(true));
  });
});

describe('Sales desk screens', () => {
  it('Home shows the open, quiet and won numbers and the two buttons', async () => {
    await render(<SalesHome now={() => Date.UTC(2026, 10, 27)} />);
    expect(await screen.findByTestId('sales-kpi-open')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('sales-kpi-open')).toHaveTextContent(/\$/));
    expect(screen.getByTestId('sales-new-job')).toBeTruthy();
    expect(screen.getByTestId('sales-request-parts')).toBeTruthy();
    expect(wrote('write') || wrote('create')).toBe(false);
  });

  it('Quotes is a table; tapping a row opens its buttons, and Mark lost writes nothing until a reason is picked', async () => {
    await render(<SalesQuotes now={() => Date.UTC(2026, 10, 27)} />);
    await fireEvent.press(await screen.findByTestId('row-sale.order-80-toggle'));
    await fireEvent.press(await screen.findByTestId('row-sale.order-80-mark-lost'));
    expect(await screen.findByTestId('lost-panel')).toBeTruthy();
    expect(wrote('action_cancel') || wrote('message_post')).toBe(false);
  });

  it('Invoices lists what is owed and opens the payment panel without recording anything', async () => {
    await render(<SalesInvoices now={() => Date.UTC(2026, 10, 27)} />);
    await fireEvent.press(await screen.findByTestId('row-account.move-70-toggle'));
    await fireEvent.press(await screen.findByTestId('row-account.move-70-record-payment'));
    expect(await screen.findByTestId('pay-panel')).toBeTruthy();
    expect(wrote('action_create_payments')).toBe(false);
  });

  it('signed out, each screen says to sign in', async () => {
    mockSignedIn = false;
    await render(<SalesQuotes />);
    expect(screen.getByTestId('sales-desk-signin')).toBeTruthy();
  });
});

describe('Request parts', () => {
  it('titles and notes list the parts and the needed-by date', () => {
    const parts = [{ name: 'Torsion spring', qty: 2 }, { name: 'Roller', qty: 10 }];
    expect(requestTitle(parts)).toBe('Parts request: 2 x Torsion spring + 1 more');
    expect(requestNote(parts, ' any brand ', 'Mon, Nov 30')).toBe('2 x Torsion spring\n10 x Roller\nNeeded by Mon, Nov 30\nany brand');
  });

  it('needs a customer and a part before anything is written', async () => {
    await expect(requestParts(mockClient as never, 0, [{ name: 'Roller', qty: 1 }], Date.now(), '')).rejects.toThrow('customer');
    await expect(requestParts(mockClient as never, 9, [{ name: 'Roller', qty: 0 }], Date.now(), '')).rejects.toThrow('part');
    expect(wrote('create')).toBe(false);
  });

  it('saves one to-do on the customer, and only when Send is pressed', async () => {
    await render(<RequestPartsScreen now={() => Date.UTC(2026, 10, 27)} />);
    await fireEvent.press(await screen.findByTestId('parts-no-job'));
    await fireEvent.changeText(screen.getByTestId('parts-customer-search'), 'Maria');
    await fireEvent.press(await screen.findByTestId('parts-customer-9'));
    await fireEvent.changeText(screen.getByTestId('parts-search'), 'Torsion');
    await fireEvent.press(await screen.findByTestId('parts-pick-31'));
    expect(wrote('create')).toBe(false);
    await fireEvent.press(screen.getByTestId('parts-send'));
    await waitFor(() => expect(wrote('create')).toBe(true));
    const made = calls.find((c) => c[0] === 'mail.activity' && c[1] === 'create');
    expect(JSON.stringify(made)).toContain('Parts request: 1 x Torsion spring .243');
    expect(JSON.stringify(made)).toContain('"res_id":9');
    expect(await screen.findByTestId('parts-sent')).toBeTruthy();
  });

  it('opens on the open jobs, and picking one fills the customer and names the job in the request', async () => {
    await render(<RequestPartsScreen now={() => Date.UTC(2026, 10, 27)} />);
    expect(await screen.findByTestId('parts-job-501')).toHaveTextContent(/Maria Lopez.*3 Cedar Way.*In progress/);
    expect(calls.some((c) => c[1] === 'listJobs:open:')).toBe(true); // open jobs only, listed before anything is typed
    await fireEvent.press(screen.getByTestId('parts-job-501'));
    expect(screen.getByTestId('parts-customer')).toHaveTextContent(/FSM\/501.*Maria Lopez/);
    await fireEvent.changeText(screen.getByTestId('parts-search'), 'Torsion');
    await fireEvent.press(await screen.findByTestId('parts-pick-31'));
    await fireEvent.press(screen.getByTestId('parts-send'));
    await waitFor(() => expect(wrote('create')).toBe(true));
    const made = JSON.stringify(calls.find((c) => c[0] === 'mail.activity' && c[1] === 'create'));
    expect(made).toContain('"res_id":9');
    expect(made).toContain('For job FSM/501 (3 Cedar Way)');
  });

  it('a job with no customer in Odoo falls back to picking the customer', async () => {
    await render(<RequestPartsScreen />);
    await fireEvent.press(await screen.findByTestId('parts-job-502'));
    expect(await screen.findByTestId('parts-customer-search')).toBeTruthy();
  });
});
