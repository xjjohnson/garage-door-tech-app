import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PricelistEditor } from '../components/PricelistEditor';
import { PurchasingScreen } from '../screens/PurchasingScreen';
import { WarehouseScreen } from '../screens/WarehouseScreen';

type Call = [string, string, unknown[], Record<string, unknown>?];
const calls: Call[] = [];
let held: string[] = [];
let poState = 'draft';

const mockClient = {
  session: { kind: 'oca', uid: 5, name: 'Sam' },
  call: async (model: string, method: string, args: unknown[] = [], kw: Record<string, unknown> = {}) => {
    calls.push([model, method, args, kw]);
    const k = `${model}.${method}`;
    switch (k) {
      case 'res.users.has_group':
        return held.includes(args[1] as string);
      case 'stock.location.search_read':
        return [{ id: 7, name: 'Stock', complete_name: 'WH/Stock' }, { id: 8, name: 'Truck 1', complete_name: 'WH/Truck 1' }];
      case 'stock.quant.fields_get':
        return { last_count_date: {} };
      case 'stock.quant.search_read':
        // Count: what Odoo has. setTruckQty also reads quants by product.
        return (args[0] as unknown[][]).some((d) => d[0] === 'product_id') ? [{ id: 31, quantity: 20, location_id: [7, 'WH/Stock'] }] : [{ product_id: [1, 'Torsion spring'], quantity: 20, last_count_date: '2026-11-10 12:00:00' }];
      case 'stock.warehouse.orderpoint.search_read':
        return [{ product_id: [1, 'Torsion spring'], product_min_qty: 5, product_max_qty: 10 }];
      case 'product.product.read':
        return [{ id: 1, name: 'Torsion spring', default_code: 'TS1', barcode: '123', standard_price: 20, categ_id: [2, 'All / Springs'] }];
      case 'stock.quant.write':
      case 'stock.quant.action_apply_inventory':
        return true;
      case 'purchase.order.search_read':
        return [{ id: 60, name: 'P00060', partner_id: [50, 'Door Supply'], state: poState, amount_total: 40, date_planned: '2026-11-20 12:00:00' }];
      case 'purchase.order.read':
        return [{ id: 60, name: 'P00060', partner_id: [50, 'Door Supply'], state: poState, amount_total: 40, date_planned: '2026-11-20 12:00:00', origin: '', order_line: [900] }];
      case 'purchase.order.line.read':
        return [{ id: 900, product_id: [1, 'Torsion spring'], name: 'Torsion spring', product_qty: 2, qty_received: 0, price_unit: 20 }];
      case 'res.partner.read':
        return [{ email: 'orders@doorsupply.test' }];
      case 'purchase.order.button_confirm':
        poState = 'purchase';
        return true;
      case 'purchase.order.action_rfq_send':
        return { context: {} };
      case 'mail.compose.message.create':
        return 3;
      case 'mail.compose.message.action_send_mail':
        return true;
      case 'product.pricelist.search_count':
      case 'product.pricelist.item.search_count':
        throw new Error('Pricelists are off');
      default:
        throw new Error(`unexpected ${k}`);
    }
  },
};
jest.mock('../lib/useOdoo', () => ({ useOdoo: () => ({ status: 'signedIn', client: mockClient }) }));

beforeEach(() => {
  calls.length = 0;
  held = [];
  poState = 'draft';
});

describe('Warehouse area', () => {
  it('is closed to someone without the Inventory manager group', async () => {
    held = ['purchase.group_purchase_user'];
    await render(<WarehouseScreen />);
    expect(await screen.findByTestId('warehouse-no-access')).toBeTruthy();
    expect(calls.some((c) => c[1] === 'write')).toBe(false);
  });

  it('counts a place, asks for a note on a big difference, then applies it with the reason', async () => {
    held = ['stock.group_stock_manager'];
    await render(<WarehouseScreen />);
    await fireEvent.press(await screen.findByTestId('warehouse-tabs').then(() => screen.getByText('Count')));
    await fireEvent.changeText(await screen.findByTestId('count-input-1'), '5');
    expect(await screen.findByTestId('count-note-1')).toBeTruthy();
    // No note yet: the apply button is held back, and nothing has reached Odoo.
    await waitFor(() => expect(screen.getByTestId('count-review')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('count-apply'));
    expect(calls.some((c) => c[0] === 'stock.quant' && c[1] === 'write')).toBe(false);
    await fireEvent.changeText(screen.getByTestId('count-note-1'), 'Box was returned');
    await fireEvent.press(screen.getByTestId('count-apply'));
    await waitFor(() => expect(calls.some((c) => c[0] === 'stock.quant' && c[1] === 'write')).toBe(true));
    const w = calls.find((c) => c[0] === 'stock.quant' && c[1] === 'write')!;
    expect(w[2]).toEqual([[31], { inventory_quantity: 5 }]);
    expect(JSON.stringify(w[3])).toContain('Box was returned');
  });
});

describe('Purchasing area', () => {
  it('is closed to someone without the Purchase group', async () => {
    held = ['stock.group_stock_manager'];
    await render(<PurchasingScreen />);
    expect(await screen.findByTestId('purchasing-no-access')).toBeTruthy();
  });

  it('shows the order first and confirms and emails only after the second press', async () => {
    held = ['purchase.group_purchase_user'];
    await render(<PurchasingScreen />);
    await fireEvent.press(await screen.findByText('Purchase orders'));
    await fireEvent.press(await screen.findByTestId('po-open-60'));
    await fireEvent.press(await screen.findByTestId('po-confirm'));
    // The order is shown with its total, and nothing has been confirmed yet.
    expect(await screen.findByTestId('po-sure')).toBeTruthy();
    expect(calls.some((c) => c[1] === 'button_confirm')).toBe(false);
    await fireEvent.press(screen.getByTestId('po-send'));
    await waitFor(() => expect(calls.some((c) => c[1] === 'button_confirm')).toBe(true));
    await waitFor(() => expect(screen.getByTestId('po-message').props.children).toMatch(/emailed to Door Supply/));
  });

  it('keeps cost and pricelists read-only without the pricing groups', async () => {
    held = ['purchase.group_purchase_user'];
    await render(<PricelistEditor client={mockClient as never} canEdit={false} />);
    // The pricelist option is off in this fake Odoo: the editor says where to tick it and writes nothing.
    expect(await screen.findByTestId('pricelist-off')).toBeTruthy();
    expect(calls.some((c) => c[1] === 'write' || c[1] === 'create')).toBe(false);
  });
});
