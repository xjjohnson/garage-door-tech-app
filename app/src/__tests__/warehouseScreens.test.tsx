import { fireEvent, render, screen } from '@testing-library/react-native';
import { WarehouseHome } from '../components/WarehouseHome';
import { WarehouseScreen } from '../screens/WarehouseScreen';

const mockClient = {
  session: { kind: 'oca', uid: 5, name: 'Sam' },
  call: async (model: string, method: string, args: unknown[] = []) => {
    const k = `${model}.${method}`;
    switch (k) {
      case 'res.users.has_group':
        return args[1] === 'stock.group_stock_manager' || args[1] === 'purchase.group_purchase_user';
      case 'stock.location.search_read':
        return [{ id: 7, name: 'Stock', complete_name: 'WH/Stock' }, { id: 8, name: 'Mike', complete_name: 'WH/Truck - Mike' }];
      case 'stock.quant.fields_get':
        return { last_count_date: {} };
      case 'stock.quant.search_read':
        return [{ product_id: [1, 'Torsion spring'], quantity: 3 }];
      case 'stock.warehouse.orderpoint.search_read':
        return [{ product_id: [1, 'Torsion spring'], product_min_qty: 4, product_max_qty: 8 }];
      case 'product.product.read':
        return [{ id: 1, name: 'Torsion spring', default_code: 'TS1', barcode: '', standard_price: 20 }];
      case 'purchase.order.search_read':
        return [{ id: 60, name: 'P00060', partner_id: [50, 'Door Supply'], origin: 'Job FSM/001', picking_ids: [70] }];
      case 'stock.picking.read':
        return [{ id: 70, state: 'done', location_dest_id: [7, 'WH/Stock'], date_done: '2026-11-25 12:00:00' }];
      case 'stock.picking.search_read':
        return [];
      case 'stock.move.search_read':
        return [{ picking_id: [70, 'IN/70'], product_id: [1, 'Torsion spring'], quantity: 2, product_uom_qty: 2 }];
      case 'mail.message.search_count':
        return 0;
      case 'fsm.order.search_read':
        return [{ name: 'FSM/001', person_id: [9, 'Mike Smith'] }];
      case 'stock.warehouse.orderpoint.search_count':
        return 0;
      case 'purchase.order.line.search_read':
        return [];
      default:
        throw new Error(`unexpected ${k}`);
    }
  },
};
jest.mock('../lib/useOdoo', () => ({ useOdoo: () => ({ status: 'signedIn', client: mockClient }) }));

describe('Warehouse theme screens', () => {
  it('lists Stock, Ready for a tech and Orders in the Warehouse menu for a warehouse manager', async () => {
    await render(<WarehouseScreen />);
    expect(await screen.findByTestId('warehouse-tab-stock')).toBeTruthy();
    expect(screen.getByTestId('warehouse-tab-ready')).toBeTruthy();
    expect(screen.getByTestId('warehouse-tab-orders')).toBeTruthy();
  });

  it('opens the stock table with the part under minimum in it, then its page', async () => {
    await render(<WarehouseScreen />);
    fireEvent.press(await screen.findByTestId('warehouse-tab-stock'));
    fireEvent.press(await screen.findByTestId('stock-row-1'));
    expect(await screen.findByTestId('part-page')).toBeTruthy();
    expect(screen.getByTestId('part-order')).toBeTruthy();
  });

  it('puts To order, Purchase orders and Receive on one Orders screen', async () => {
    await render(<WarehouseScreen />);
    fireEvent.press(await screen.findByTestId('warehouse-tab-orders'));
    expect(await screen.findByTestId('warehouse-orders')).toBeTruthy();
    expect(screen.getByTestId('orders-hub')).toBeTruthy();
  });

  it('shows the count tiles and the job parts to hand over on Home', async () => {
    await render(<WarehouseHome now={() => Date.parse('2026-11-27T12:00:00Z')} />);
    expect(await screen.findByTestId('whome-tiles')).toBeTruthy();
    expect(await screen.findByTestId('ready-60')).toBeTruthy();
    expect(screen.getByTestId('ready-hand-60')).toBeTruthy();
  });
});
