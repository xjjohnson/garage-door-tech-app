import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render } from '@testing-library/react-native';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { createJob, Job, JOBS_STORAGE_KEY } from '../lib/jobs';
import { JOBS_SINCE_KEY } from '../lib/odooJobs';
import { setMovesAvailable } from '../lib/partMovesGate';
import { STOCK_STORAGE_KEY, StockStore } from '../lib/stock';
import { JobsProvider } from '../lib/useJobs';
import { resetJobsSince } from '../lib/useJobsSince';
import { StockProvider, useStock } from '../lib/useStock';
import type { OdooClient } from '../lib/odoo';

const settle = async (n = 6) => {
  for (let k = 0; k < n; k++) await act(async () => undefined);
};

const job = (id: string, odooJob?: Job['odooJob']): Job => ({ ...createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Pat Smith', address: '1 Oak St', phone: '555', notes: '' }, { title: '' }, 1000, id), ...(odooJob ? { odooJob } : {}) });

async function mount(jobs: Job[], store: StockStore) {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));
  await AsyncStorage.setItem(JOBS_SINCE_KEY, '500');
  await AsyncStorage.setItem(STOCK_STORAGE_KEY, JSON.stringify(store));
  resetJobsSince();
  const api: { current: ReturnType<typeof useStock> | null } = { current: null };
  function Grab() {
    api.current = useStock();
    return null;
  }
  await render(
    <JobsProvider>
      <StockProvider>
        <Grab />
      </StockProvider>
    </JobsProvider>,
  );
  await settle();
  return () => api.current!;
}

const start: StockStore = {
  items: [{ id: 'i1', name: 'Rollers', category: 'parts', sku: '', onHand: 5, min: 1, par: 5, supplier: '', costCents: 0, updatedAt: 1, odooId: 11, syncedOnHand: 5 }],
  suppliers: [],
  truck: { locationId: 7, name: 'WH/Truck 1', syncedAt: 1, uid: 2 },
};

function fakeClient(opts: { installed?: boolean } = {}) {
  const calls: string[] = [];
  const state = { qty: 5, picking: 0, origins: [] as string[] };
  const call = async (model: string, method: string, args: unknown[] = []) => {
    const k = `${model}.${method}`;
    calls.push(k);
    switch (k) {
      case 'stock.move.fields_get':
        return { quantity: {}, ...(opts.installed === false ? {} : { fsm_order_id: {} }) };
      case 'stock.picking.fields_get':
        return opts.installed === false ? {} : { fsm_order_id: {} };
      case 'fsm.order.fields_get':
        return { location_id: {} };
      case 'fsm.order.read':
        return [{ id: 500, location_id: false }];
      case 'stock.location.search':
        return [20];
      case 'stock.location.read':
        return [{ id: 7 }];
      case 'stock.picking.type.search':
        return [3];
      case 'stock.picking.search':
        return state.origins.includes((args[0] as unknown[][])[0][2] as string) ? [900] : [];
      case 'stock.picking.create':
        state.origins.push((args[0] as { origin: string }).origin);
        return 900;
      case 'stock.picking.read':
        return [{ id: 900, state: 'draft' }];
      case 'stock.picking.action_confirm':
      case 'stock.picking.action_assign':
      case 'stock.move.write':
        return true;
      case 'stock.move.search':
        return [1];
      case 'stock.picking.button_validate':
        state.qty -= 2;
        return true;
      case 'stock.quant.search_read':
        return [{ id: 1, product_id: [11, 'Rollers'], location_id: [7, 'Truck'], quantity: state.qty }];
      case 'stock.warehouse.orderpoint.search_read':
      case 'product.supplierinfo.search_read':
        return [];
      case 'product.product.read':
        return [{ id: 11, name: 'Rollers', default_code: '', barcode: '', standard_price: 0, product_tmpl_id: [111, 'Rollers'] }];
      case 'stock.quant.write':
      case 'stock.quant.action_apply_inventory':
        state.qty -= 0;
        calls.push('ADJUSTED');
        return true;
      default:
        throw new Error(`unexpected ${k}`);
    }
  };
  return { client: { call, session: { kind: 'oca', uid: 2, name: 'Sam' } } as unknown as OdooClient, calls, state };
}

describe('job parts as stock moves, through the stock provider', () => {
  afterEach(() => setMovesAvailable(false));

  it('takes a part off the truck once: a stock move, and no count adjustment from the sync', async () => {
    setMovesAvailable(true);
    const o = fakeClient();
    const stock = await mount([job('j1', { model: 'fsm.order', id: 500, name: 'FSM/1' })], start);
    await act(async () => stock().takeParts('i1', 2, 'j1'));
    await act(async () => stock().takeParts('i1', 0, 'j1'));
    expect(stock().used?.[0]).toMatchObject({ move: true, qty: 2 });
    // A truck sync before the move is recorded sends nothing and keeps the phone's 3.
    await act(async () => {
      await stock().sync(o.client);
    });
    expect(o.calls).not.toContain('ADJUSTED');
    expect(stock().items[0]).toMatchObject({ onHand: 3, syncedOnHand: 5 });
    // Record the move: Odoo drops to 3, the use is sent, and a sync after sends nothing either.
    await act(async () => {
      expect(await stock().recordMoves(o.client)).toBe(1);
    });
    expect(o.state.qty).toBe(3);
    expect(stock().used?.[0].sentAt).toBeGreaterThan(0);
    expect(stock().items[0]).toMatchObject({ onHand: 3, syncedOnHand: 3 });
    await act(async () => {
      await stock().sync(o.client);
    });
    expect(o.calls).not.toContain('ADJUSTED');
    expect(stock().items[0]).toMatchObject({ onHand: 3, syncedOnHand: 3 });
    // Recording again changes nothing.
    await act(async () => {
      expect(await stock().recordMoves(o.client)).toBe(0);
    });
    expect(o.state.qty).toBe(3);
  });

  it('keeps the old count and note path for a job that is not in Odoo yet, and for an Odoo without the app', async () => {
    setMovesAvailable(true);
    const stock = await mount([job('j1')], start);
    await act(async () => stock().takeParts('i1', 1, 'j1'));
    expect(stock().used?.[0].move).toBeUndefined();

    setMovesAvailable(false);
    const stock2 = await mount([job('j2', { model: 'fsm.order', id: 501, name: 'FSM/2' })], start);
    await act(async () => stock2().takeParts('i1', 1, 'j2'));
    expect(stock2().used?.[0].move).toBeUndefined();
  });

  it('gives pending moves back to the count sync when Odoo turns out not to have the app', async () => {
    setMovesAvailable(true);
    const o = fakeClient({ installed: false });
    const stock = await mount([job('j1', { model: 'fsm.order', id: 500, name: 'FSM/1' })], start);
    await act(async () => stock().takeParts('i1', 2, 'j1'));
    await act(async () => {
      expect(await stock().recordMoves(o.client)).toBe(0);
    });
    expect(stock().used?.[0].move).toBeUndefined();
  });
});
