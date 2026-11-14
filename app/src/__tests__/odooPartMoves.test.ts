import type { OdooClient } from '../lib/odoo';
import { moveOrigin, partMovesSupport, recordPartMoves } from '../lib/odooPartMoves';
import { syncTruck } from '../lib/odooStock';
import { holdBack, PartUse, StockItem, StockStore, unsyncedItems, parseStock } from '../lib/stock';

type Call = { model: string; method: string; args: unknown[]; kw: Record<string, unknown> };

/** A fake Odoo with Field Service Stock: pickings with moves, a truck quant, and the fields_get answers. */
function fake({ installed = true, wizard = false, kind = 'oca' as 'oca' | 'task' } = {}) {
  const calls: Call[] = [];
  const pickings: Record<number, { origin: string; state: string; moves: { product: number; qty: number }[]; order: number }> = {};
  let next = 900;
  const quants = [{ id: 1, product: 11, qty: 5 }];
  const call = async (model: string, method: string, args: unknown[] = [], kw: Record<string, unknown> = {}) => {
    calls.push({ model, method, args, kw });
    const k = `${model}.${method}`;
    switch (k) {
      case 'stock.move.fields_get':
        return { quantity: {}, product_uom: {}, ...(installed ? { fsm_order_id: {} } : {}) };
      case 'stock.picking.fields_get':
        return installed ? { fsm_order_id: {} } : {};
      case 'fsm.order.fields_get':
        return { location_id: {} };
      case 'fsm.order.read':
        return [{ id: 500, location_id: [60, 'House'] }];
      case 'fsm.location.fields_get':
        return { inventory_location_id: {} };
      case 'fsm.location.read':
        return [{ id: 60, inventory_location_id: [70, 'Site 60'] }];
      case 'stock.location.read':
        return [{ id: 7, warehouse_id: [1, 'WH'] }];
      case 'stock.picking.type.search':
        return [3];
      case 'product.product.read':
        return [{ id: 11, uom_id: [1, 'Units'] }];
      case 'stock.picking.search': {
        const origin = (args[0] as unknown[][]).find((d) => d[0] === 'origin')?.[2];
        return Object.entries(pickings).filter(([, p]) => p.origin === origin && p.state !== 'cancel').map(([id]) => Number(id));
      }
      case 'stock.picking.create': {
        const v = args[0] as { origin: string; fsm_order_id: number; move_ids: [number, number, { product_id: number; product_uom_qty: number }][] };
        const id = next++;
        pickings[id] = { origin: v.origin, state: 'draft', order: v.fsm_order_id, moves: v.move_ids.map((m) => ({ product: m[2].product_id, qty: m[2].product_uom_qty })) };
        return id;
      }
      case 'stock.picking.read':
        return [{ id: (args[0] as number[])[0], state: pickings[(args[0] as number[])[0]].state }];
      case 'stock.picking.action_confirm':
        pickings[(args[0] as number[])[0]].state = 'confirmed';
        return true;
      case 'stock.picking.action_assign':
        return true;
      case 'stock.move.search':
        return [1];
      case 'stock.move.write':
        return true;
      case 'stock.picking.button_validate': {
        if (wizard) return { type: 'ir.actions.act_window', res_model: 'stock.backorder.confirmation' };
        const p = pickings[(args[0] as number[])[0]];
        p.state = 'done';
        for (const m of p.moves) quants[0].qty -= m.qty;
        return true;
      }
      case 'fsm.order.message_post':
        return true;
      default:
        throw new Error(`unexpected ${k}`);
    }
  };
  const client = { call, session: { kind, uid: 2, name: 'Sam' } } as unknown as OdooClient;
  return { client, calls, pickings, quants };
}

const use = (over: Partial<PartUse> = {}): PartUse => ({ id: 'u1', itemId: 'i1', name: 'Rollers', qty: 2, at: 1000, jobId: 'j1', move: true, ...over });

describe('parts used as stock moves', () => {
  it('only offers moves when Field Service Stock is installed on an OCA order Odoo', async () => {
    expect(await partMovesSupport(fake().client)).toEqual({ ok: true });
    expect((await partMovesSupport(fake({ installed: false }).client)).ok).toBe(false);
    expect((await partMovesSupport(fake({ kind: 'task' }).client)).ok).toBe(false);
  });

  it('makes one validated delivery from the truck to the site on the job order', async () => {
    const o = fake();
    const r = await recordPartMoves(o.client, { id: 500 }, 7, [{ use: use(), productId: 11 }]);
    expect(r).toEqual({ done: ['u1'], problems: [] });
    const create = o.calls.find((c) => c.method === 'create')!.args[0] as Record<string, unknown>;
    expect(create).toMatchObject({ location_id: 7, location_dest_id: 70, fsm_order_id: 500, origin: moveOrigin('u1'), picking_type_id: 3 });
    expect(o.quants[0].qty).toBe(3);
    expect(o.calls.some((c) => c.method === 'button_validate')).toBe(true);
  });

  it('never makes a second delivery for the same use after a retry', async () => {
    const o = fake();
    await recordPartMoves(o.client, { id: 500 }, 7, [{ use: use(), productId: 11 }]);
    await recordPartMoves(o.client, { id: 500 }, 7, [{ use: use(), productId: 11 }]);
    expect(o.calls.filter((c) => c.method === 'create')).toHaveLength(1);
    expect(o.quants[0].qty).toBe(3);
  });

  it('keeps a use pending when Odoo wants a person to finish the delivery', async () => {
    const o = fake({ wizard: true });
    const r = await recordPartMoves(o.client, { id: 500 }, 7, [{ use: use(), productId: 11 }]);
    expect(r.done).toEqual([]);
    expect(r.problems[0]).toMatchObject({ useId: 'u1' });
    expect(o.quants[0].qty).toBe(5);
  });

  it('moves only what came off the count, and notes the rest', async () => {
    const o = fake();
    const r = await recordPartMoves(o.client, { id: 500 }, 7, [{ use: use({ qty: 3, off: 1 }), productId: 11 }]);
    expect(r.done).toEqual(['u1']);
    expect(o.quants[0].qty).toBe(4);
    expect(o.calls.find((c) => c.method === 'message_post')?.kw.body).toContain('2 × Rollers');
  });
});

describe('truck count sync with unsent moves', () => {
  const item = (over: Partial<StockItem> = {}): StockItem => ({ id: 'i1', name: 'Rollers', category: 'parts', sku: '', onHand: 3, min: 1, par: 5, supplier: '', costCents: 0, updatedAt: 0, odooId: 11, syncedOnHand: 5, ...over });
  const store = (used: PartUse[], items = [item()]): StockStore => ({ items, suppliers: [], used, truck: { locationId: 7, name: 'WH/Truck 1', syncedAt: 0, uid: 2 } });

  /** Odoo reports 5 on the truck; counts any inventory adjustment the sync sends. */
  function stockOdoo() {
    const writes: unknown[] = [];
    const call = async (model: string, method: string, args: unknown[] = []) => {
      switch (`${model}.${method}`) {
        case 'stock.quant.search_read':
          return [{ id: 1, product_id: [11, 'Rollers'], location_id: [7, 'Truck'], quantity: 5 }];
        case 'stock.warehouse.orderpoint.search_read':
          return [];
        case 'product.product.read':
          return [{ id: 11, name: 'Rollers', default_code: '', barcode: '', standard_price: 0, product_tmpl_id: [111, 'Rollers'] }];
        case 'product.supplierinfo.search_read':
          return [];
        case 'stock.quant.write':
          writes.push(args[1]);
          return true;
        case 'stock.quant.action_apply_inventory':
          return true;
        default:
          throw new Error(`unexpected ${model}.${method}`);
      }
    };
    return { client: { call, session: { uid: 2, name: 'Sam' } } as unknown as OdooClient, writes };
  }

  it('does not send a count for a use that Odoo takes off with a move', async () => {
    const o = stockOdoo();
    const s = store([use()]);
    expect(holdBack(s.used).get('i1')).toBe(2);
    expect(unsyncedItems(s)).toEqual([]);
    const r = await syncTruck(o.client, s, 5000);
    expect(r.sent).toBe(0);
    expect(o.writes).toEqual([]);
    // Odoo still has 5; the phone keeps showing 3 until the move is recorded.
    expect(r.store.items[0]).toMatchObject({ onHand: 3, syncedOnHand: 5 });
  });

  it('still sends a count for an older use (no move), as before', async () => {
    const o = stockOdoo();
    const r = await syncTruck(o.client, store([use({ move: undefined })]), 5000);
    expect(r.sent).toBe(1);
  });

  it('does not count a sent move twice', async () => {
    // After the move: Odoo has 3, and the phone marked the use sent and took its own "as Odoo had it" down to 3.
    const o = stockOdoo();
    const s = store([use({ sentAt: 2000 })], [item({ onHand: 3, syncedOnHand: 3 })]);
    const r = await syncTruck(o.client, s, 5000);
    expect(r.sent).toBe(0);
  });

  it('reads the move flag back from saved data', () => {
    const saved = JSON.stringify({ items: [item()], suppliers: [], used: [use()] });
    expect(parseStock(JSON.parse(saved))?.used?.[0]).toMatchObject({ move: true });
  });
});
