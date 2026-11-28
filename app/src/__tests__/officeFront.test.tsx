import { fireEvent, render, screen } from '@testing-library/react-native';
import { OfficeAreaScreen } from '../screens/OfficeAreaScreen';

const calls: [string, string][] = [];
let attendance = true;
const NOW = new Date(2026, 10, 25, 11, 0, 0).getTime(); // Wednesday
const utc = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

const mockClient = {
  session: { kind: 'oca', uid: 5, name: 'Pat', fields: [] },
  call: async (model: string, method: string, args: unknown[] = []) => {
    calls.push([model, method]);
    const k = `${model}.${method}`;
    switch (k) {
      case 'res.users.has_group':
        return args[1] === 'account.group_account_manager';
      case 'account.move.search_read':
        return [{ id: 70, name: 'INV/70', partner_id: [9, 'Maria Lopez'], amount_residual: 150, invoice_date_due: '2020-01-01', ref: false }];
      case 'sale.order.search_read':
        return [{ id: 80, name: 'S0080', partner_id: [8, 'Ann Lee'], amount_total: 400, write_date: '2020-01-01 12:00:00', date_order: '2020-01-01 12:00:00', client_order_ref: false }];
      case 'res.partner.read':
        return [{ id: 9, phone: '', email: 'maria@test.test' }];
      case 'account.move.search_count':
      case 'sale.order.search_count':
      case 'mail.activity.search_count':
        return 0;
      case 'hr.attendance.search_count':
        if (!attendance) throw new Error('no access');
        return 1;
      case 'hr.employee.search_read':
        return [{ id: 1, name: 'Sam Ruiz', job_title: 'Tech' }, { id: 2, name: 'Jo Pena', job_title: '' }];
      case 'hr.attendance.search_read':
        return [{ employee_id: [1, 'Sam Ruiz'], check_in: utc(NOW - 3 * 3_600_000), check_out: false }];
      default:
        throw new Error(`unexpected ${k}`);
    }
  },
};
jest.mock('../lib/useOdoo', () => ({ useOdoo: () => ({ status: 'signedIn', client: mockClient }) }));
jest.mock('../lib/useInvoices', () => ({ useInvoices: () => ({ business: { name: 'Johnsons' } }) }));

beforeEach(() => {
  calls.length = 0;
  attendance = true;
});

describe('Office front page', () => {
  it('has Money, People and Customers tabs and no Setup tab', async () => {
    await render(<OfficeAreaScreen now={() => NOW} />);
    expect(await screen.findByText('Money')).toBeTruthy();
    expect(screen.getByText('People')).toBeTruthy();
    expect(screen.getByText('Customers')).toBeTruthy();
    expect(screen.queryByText('Setup')).toBeNull();
    expect(screen.queryByText('Terms and Conditions')).toBeNull();
  });

  it('shows dollar tiles and a Do next list with the main button first', async () => {
    await render(<OfficeAreaScreen now={() => NOW} />);
    expect(await screen.findByTestId('tile-overdue')).toHaveTextContent(/\$150/);
    expect(screen.getByTestId('tile-toinvoice')).toHaveTextContent(/\$400/);
    expect(await screen.findByTestId('row-account.move-70')).toBeTruthy();
    expect(screen.getByTestId('row-sale.order-80')).toBeTruthy();
    // Each row is one tight line; its buttons show when it is tapped.
    expect(screen.queryByTestId('row-account.move-70-record-payment')).toBeNull();
    await fireEvent.press(screen.getByTestId('row-account.move-70-toggle'));
    expect(await screen.findByTestId('row-account.move-70-record-payment')).toBeTruthy();
  });

  it('searches the lists by customer name', async () => {
    await render(<OfficeAreaScreen now={() => NOW} />);
    await screen.findByTestId('tile-overdue');
    await fireEvent.changeText(screen.getByTestId('office-search'), 'ann');
    expect(await screen.findByTestId('row-sale.order-80')).toBeTruthy();
    expect(screen.queryByTestId('row-account.move-70')).toBeNull();
  });

  it('opens the People tab: who is clocked in and the week\'s hours, reading only', async () => {
    await render(<OfficeAreaScreen now={() => NOW} />);
    await fireEvent.press(await screen.findByText('People'));
    expect(await screen.findByTestId('people-tile-in')).toHaveTextContent(/1 of 2/);
    expect(screen.getByTestId('person-1')).toHaveTextContent(/3.0 h/);
    expect(screen.getByTestId('person-2')).toHaveTextContent(/not clocked in/);
    await fireEvent.press(screen.getByTestId('people-open-timesheets'));
    expect(await screen.findByTestId('sheet-1')).toBeTruthy();
    expect(calls.some(([, m]) => ['write', 'create', 'unlink'].includes(m))).toBe(false);
  });

  it('says so when Odoo has no Attendances app for this login', async () => {
    attendance = false;
    await render(<OfficeAreaScreen now={() => NOW} />);
    await fireEvent.press(await screen.findByText('People'));
    expect(await screen.findByTestId('people-no-attendance')).toBeTruthy();
  });
});
