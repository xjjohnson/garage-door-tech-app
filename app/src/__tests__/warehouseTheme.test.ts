import type { OdooClient } from '../lib/odoo';
import { handOver, HANDOVER_NOTE, listPlaces, partOnOrder, readyForTech, stockTable } from '../lib/odooWarehouse';
import { truckForTech, waitText } from '../components/ReadyForTech';
import { shortPlace } from '../components/StockTable';

type Call = { model: string; method: string; args: unknown[]; kw: Record<string, unknown> };
type Handler = (args: unknown[], kw: Record<string, unknown>) => unknown;

function fake(handlers: Record<string, Handler>) {
  const calls: Call[] = [];
  const client = {
    session: { uid: 5, name: 'Sam', kind: 'oca' },
    call: async (model: string, method: string, args: unknown[] = [], kw: Record<string, unknown> = {}) => {
      calls.push({ model, method, args, kw });
      const h = handlers[`${model}.${method}`];
      if (!h) throw new Error(`unexpected ${model}.${method}`);
      return h(args, kw);
    },
  } as unknown as OdooClient;
  return { client, calls };
}

const LOCS = [
  { id: 7, name: 'Stock', complete_name: 'WH/Stock' },
  { id: 8, name: 'Mike', complete_name: 'WH/Truck - Mike' },
];

const base = (extra: Record<string, Handler> = {}): Record<string, Handler> => ({
  'stock.location.search_read': () => LOCS,
  'purchase.order.search_read': () => [{ id: 60, name: 'P00060', partner_id: [50, 'Door Supply'], origin: 'Job FSM/001', picking_ids: [70] }],
  'stock.picking.read': () => [{ id: 70, state: 'done', location_dest_id: [7, 'WH/Stock'], date_done: '2026-11-25 12:00:00' }],
  'stock.move.search_read': () => [{ picking_id: [70, 'WH/IN/70'], product_id: [1, 'Torsion spring'], quantity: 2, product_uom_qty: 2 }],
  'mail.message.search_count': () => 0,
  'fsm.order.search_read': () => [{ name: 'FSM/001', person_id: [9, 'Mike Smith'] }],
  ...extra,
});

describe('Ready for a tech', () => {
  it('lists received job orders still at the warehouse, with the tech Odoo names', async () => {
    const { client } = fake(base());
    const list = await readyForTech(client);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ poId: 60, name: 'P00060', job: 'FSM/001', tech: 'Mike Smith', placeId: 7 });
    expect(list[0]!.lines).toEqual([{ productId: 1, name: 'Torsion spring', qty: 2 }]);
  });

  it('leaves out orders already on a truck, not yet received, or already handed over', async () => {
    expect(await readyForTech(fake(base({ 'stock.picking.read': () => [{ id: 70, state: 'done', location_dest_id: [8, 'WH/Truck - Mike'] }] })).client)).toEqual([]);
    expect(await readyForTech(fake(base({ 'stock.picking.read': () => [{ id: 70, state: 'assigned', location_dest_id: [7, 'WH/Stock'] }] })).client)).toEqual([]);
    expect(await readyForTech(fake(base({ 'mail.message.search_count': () => 1 })).client)).toEqual([]);
  });

  it('shows nothing, not an error, when Odoo has no Field Service orders to name a tech', async () => {
    const list = await readyForTech(fake(base({ 'fsm.order.search_read': () => { throw new Error('no fsm'); } })).client);
    expect(list[0]).toMatchObject({ tech: '' });
  });

  it('moves the parts to the truck as one Odoo transfer and notes it on the order', async () => {
    const { client, calls } = fake(
      base({
        'stock.move.fields_get': () => ({ quantity: {}, name: {} }),
        'stock.picking.search': () => [],
        'stock.location.read': () => [{ warehouse_id: [1, 'WH'] }],
        'stock.picking.type.search': () => [3],
        'product.product.read': () => [{ id: 1, uom_id: [1, 'Units'] }],
        'stock.picking.create': () => 90,
        'stock.picking.action_confirm': () => true,
        'stock.picking.action_assign': () => true,
        'stock.move.write': () => true,
        'stock.picking.button_validate': () => true,
        'purchase.order.message_post': () => 1,
      }),
    );
    // read of the new picking: not done yet, then validate
    const orig = (client as unknown as { call: OdooClient['call'] }).call;
    (client as unknown as { call: OdooClient['call'] }).call = (async (m: string, me: string, a: unknown[] = [], k: Record<string, unknown> = {}) => (m === 'stock.picking' && me === 'read' && (a[0] as number[])[0] === 90 ? [{ state: 'draft', name: 'WH/INT/90' }] : orig(m, me, a, k))) as OdooClient['call'];
    const [order] = await readyForTech(client);
    const r = await handOver(client, order!, { id: 8, name: 'WH/Truck - Mike', truck: true });
    expect(r.done).toBe(true);
    const created = calls.find((c) => c.model === 'stock.picking' && c.method === 'create')!;
    expect(JSON.stringify(created.args)).toContain('"location_dest_id":8');
    const note = calls.find((c) => c.model === 'purchase.order' && c.method === 'message_post')!;
    expect(JSON.stringify(note.kw)).toContain(HANDOVER_NOTE);
  });

  it('picks the truck by the tech\'s name, and asks when it cannot tell', () => {
    const trucks = [{ id: 8, name: 'WH/Truck - Mike', truck: true }, { id: 9, name: 'WH/Truck - Dan', truck: true }];
    expect(truckForTech('Mike Smith', trucks)?.id).toBe(8);
    expect(truckForTech('', trucks)).toBeUndefined();
    expect(truckForTech('Pat Jones', trucks)).toBeUndefined();
  });

  it('says how long it has waited', () => {
    const now = Date.parse('2026-11-27T12:00:00Z');
    expect(waitText(now - 3 * 86_400_000, now)).toEqual({ text: 'Waiting 3 days', late: true });
    expect(waitText(now - 3_600_000, now)).toEqual({ text: 'Ready', late: false });
  });
});

describe('Stock table', () => {
  it('puts every part with each place side by side, under-minimum parts first', async () => {
    const { client } = fake({
      'stock.location.search_read': () => LOCS,
      'stock.quant.fields_get': () => ({}),
      'stock.quant.search_read': (args) => {
        const at = ((args[0] as unknown[][]).find((d) => d[0] === 'location_id') as unknown[])[2];
        return at === 7 ? [{ product_id: [1, 'Torsion spring'], quantity: 3 }, { product_id: [2, 'Roller'], quantity: 24 }] : [{ product_id: [1, 'Torsion spring'], quantity: 2 }];
      },
      'stock.warehouse.orderpoint.search_read': (args) => ((args[0] as unknown[][])[0]![2] === 7 ? [{ product_id: [1, 'Torsion spring'], product_min_qty: 4, product_max_qty: 8 }] : []),
      'product.product.read': () => [{ id: 1, name: 'Torsion spring', default_code: 'TS1', barcode: '', standard_price: 20 }, { id: 2, name: 'Roller', default_code: 'R1', barcode: '', standard_price: 2 }],
    });
    const rows = await stockTable(client, await listPlaces(client));
    expect(rows.map((r) => r.name)).toEqual(['Torsion spring', 'Roller']);
    expect(rows[0]).toMatchObject({ qty: { 7: 3, 8: 2 }, min: 4, low: true });
    expect(rows[1]).toMatchObject({ qty: { 7: 24 }, min: 0, low: false });
  });

  it('names columns short', () => {
    expect(shortPlace({ id: 7, name: 'WH/Stock', truck: false })).toBe('Shop');
    expect(shortPlace({ id: 8, name: 'WH/Truck - Mike', truck: true })).toBe('Mike');
  });

  it('reads what is still coming on open orders for one part', async () => {
    const { client } = fake({ 'purchase.order.line.search_read': () => [{ order_id: [60, 'P00060'], partner_id: [50, 'Door Supply'], product_qty: 6, qty_received: 4, date_planned: '2026-11-29 12:00:00' }, { order_id: [61, 'P00061'], partner_id: [50, 'Door Supply'], product_qty: 2, qty_received: 2 }] });
    const rows = await partOnOrder(client, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'P00060', qty: 2 });
  });
});
