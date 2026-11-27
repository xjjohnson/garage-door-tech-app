import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { OfficeAreaScreen } from '../screens/OfficeAreaScreen';
import { SalesAreaScreen } from '../screens/SalesAreaScreen';

type Call = [string, string, unknown[], Record<string, unknown>?];
const calls: Call[] = [];
let held: string[] = [];

const mockClient = {
  session: { kind: 'oca', uid: 5, name: 'Pat', fields: [] },
  call: async (model: string, method: string, args: unknown[] = [], kw: Record<string, unknown> = {}) => {
    calls.push([model, method, args, kw]);
    const k = `${model}.${method}`;
    switch (k) {
      case 'res.users.has_group':
        return held.includes(args[1] as string);
      case 'account.move.search_read':
        return [{ id: 70, name: 'INV/70', partner_id: [9, 'Maria Lopez'], amount_residual: 150, invoice_date_due: '2020-01-01', ref: false }];
      case 'sale.order.search_read':
        return [{ id: 80, name: 'S0080', partner_id: [9, 'Maria Lopez'], amount_total: 400, write_date: '2020-01-01 12:00:00', date_order: '2020-01-01 12:00:00', client_order_ref: false }];
      case 'res.partner.read':
        return [{ id: 9, phone: '(555) 010-0100', email: 'maria@test.test' }];
      case 'account.journal.search':
        return [3];
      case 'account.payment.register.create':
        return 11;
      case 'account.payment.register.action_create_payments':
      case 'sale.order.message_post':
      case 'sale.order.action_cancel':
        return true;
      case 'account.move.search_count':
      case 'sale.order.search_count':
      case 'mail.activity.search_count':
        return 0;
      default:
        throw new Error(`unexpected ${k}`);
    }
  },
};
jest.mock('../lib/useOdoo', () => ({ useOdoo: () => ({ status: 'signedIn', client: mockClient }) }));

jest.mock('../lib/useInvoices', () => ({ useInvoices: () => ({ business: { name: 'Johnsons' } }) }));

beforeEach(() => {
  calls.length = 0;
  held = [];
});
const wrote = (m: string) => calls.some((c) => c[1] === m);

describe('Office area', () => {
  it('is closed to someone without the Billing Administrator group', async () => {
    held = ['sales_team.group_sale_manager'];
    await render(<OfficeAreaScreen />);
    expect(await screen.findByTestId('office-no-access')).toBeTruthy();
    expect(wrote('write') || wrote('create')).toBe(false);
  });

  it('lists a late invoice and records the payment only on the second press', async () => {
    held = ['account.group_account_manager'];
    await render(<OfficeAreaScreen initial="overdue" />);
    await fireEvent.press(await screen.findByTestId('row-account.move-70-toggle'));
    await fireEvent.press(await screen.findByTestId('row-account.move-70-record-payment'));
    expect(await screen.findByTestId('pay-panel')).toBeTruthy();
    expect(wrote('action_create_payments')).toBe(false);
    await fireEvent.press(screen.getByTestId('pay-record'));
    await waitFor(() => expect(wrote('action_create_payments')).toBe(true));
  });

  it('shows who an email goes to and sends nothing until Send is pressed', async () => {
    held = ['account.group_account_manager'];
    await render(<OfficeAreaScreen initial="overdue" />);
    await fireEvent.press(await screen.findByTestId('row-account.move-70-toggle'));
    await fireEvent.press(await screen.findByTestId('row-account.move-70-email-again'));
    expect(await screen.findByTestId('email-panel')).toBeTruthy();
    expect(calls.some((c) => c[1] === 'action_send_mail' || c[1] === 'message_post')).toBe(false);
  });
});

describe('Sales area', () => {
  it('is closed to someone without the Sales Administrator group', async () => {
    held = ['account.group_account_manager'];
    await render(<SalesAreaScreen />);
    expect(await screen.findByTestId('sales-no-access')).toBeTruthy();
  });

  it('marks a quiet quote lost only after a reason is picked', async () => {
    held = ['sales_team.group_sale_manager'];
    await render(<SalesAreaScreen initial="quiet" />);
    await fireEvent.press(await screen.findByTestId('row-sale.order-80-mark-lost'));
    expect(await screen.findByTestId('lost-panel')).toBeTruthy();
    expect(wrote('action_cancel')).toBe(false);
    await fireEvent.press(screen.getByTestId('lost-too-expensive'));
    await waitFor(() => expect(wrote('action_cancel')).toBe(true));
    expect(JSON.stringify(calls.find((c) => c[1] === 'message_post'))).toContain('Too expensive');
  });
});
