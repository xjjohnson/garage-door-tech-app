import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OdooClient } from '../lib/odoo';
import {
  applyCounts,
  countReason,
  departmentAccess,
  isBigDifference,
  receiveInto,
  transferStock,
  transferOrigin,
} from '../lib/odooWarehouse';
import {
  confirmAndSend,
  costWentUp,
  draftForVendor,
  editPurchaseLine,
  marginPercent,
  poGroup,
  priceAtSameMargin,
  pricelistRules,
  ruleText,
  savePriceRule,
  suggestFromUse,
  suggestQty,
  toOrder,
} from '../lib/odooPurchasing';

type Call = { model: string; method: string; args: unknown[]; kw: Record<string, unknown> };
type Handler = (args: unknown[], kw: Record<string, unknown>, calls: Call[]) => unknown;

/** A fake Odoo: a handler per "model.method"; anything else throws, so a stray call fails the test. */
function fake(handlers: Record<string, Handler>, uid = 5) {
  const calls: Call[] = [];
  const client = {
    session: { uid, name: 'Sam', kind: 'oca' },
    call: async (model: string, method: string, args: unknown[] = [], kw: Record<string, unknown> = {}) => {
      calls.push({ model, method, args, kw });
      const h = handlers[`${model}.${method}`];
      if (!h) throw new Error(`unexpected ${model}.${method}`);
      return h(args, kw, calls);
    },
  } as unknown as OdooClient;
  return { client, calls };
}

const groups = (held: string[]): Handler => (args) => held.includes(args[1] as string);

beforeEach(() => AsyncStorage.clear());

describe('who sees which area', () => {
  it('shows everything to the owner', async () => {
    const f = fake({ 'res.users.has_group': groups(['base.group_system']) });
    expect(await departmentAccess(f.client)).toEqual({ warehouse: true, purchasing: true, pricing: true, dispatch: true, office: true, sales: true, owner: true, tech: true });
  });

  it('lets the warehouse manager buy too, but not edit cost and prices', async () => {
    const wh = await departmentAccess(fake({ 'res.users.has_group': groups(['stock.group_stock_manager']) }).client);
    expect(wh).toMatchObject({ warehouse: true, purchasing: true, pricing: false, owner: false });
    const buyer = await departmentAccess(fake({ 'res.users.has_group': groups(['purchase.group_purchase_user']) }).client);
    expect(buyer).toMatchObject({ warehouse: false, purchasing: true, pricing: false });
    // One person can hold both.
    const both = await departmentAccess(fake({ 'res.users.has_group': groups(['stock.group_stock_manager', 'purchase.group_purchase_user']) }).client);
    expect(both).toMatchObject({ warehouse: true, purchasing: true });
  });

  it('opens Dispatch for a Field Service dispatcher and not for the other roles', async () => {
    const d = await departmentAccess(fake({ 'res.users.has_group': groups(['fieldservice.group_fsm_dispatcher']) }).client);
    expect(d).toMatchObject({ dispatch: true, warehouse: false, purchasing: false, owner: false });
    const wh = await departmentAccess(fake({ 'res.users.has_group': groups(['stock.group_stock_manager']) }).client);
    expect(wh.dispatch).toBe(false);
  });

  it('lets only a purchase manager who is also a sales manager change cost and pricelists', async () => {
    const half = await departmentAccess(fake({ 'res.users.has_group': groups(['purchase.group_purchase_manager']) }).client);
    expect(half).toMatchObject({ purchasing: true, pricing: false });
    const full = await departmentAccess(fake({ 'res.users.has_group': groups(['purchase.group_purchase_manager', 'sales_team.group_sale_manager']) }).client);
    expect(full.pricing).toBe(true);
  });

  it('a dispatcher is not a tech, though Odoo gives them the Field Service User group', async () => {
    const d = await departmentAccess(fake({ 'res.users.has_group': groups(['fieldservice.group_fsm_dispatcher', 'fieldservice.group_fsm_user']) }).client);
    expect(d).toMatchObject({ dispatch: true, tech: false });
    const t = await departmentAccess(fake({ 'res.users.has_group': groups(['fieldservice.group_fsm_user']) }).client);
    expect(t).toMatchObject({ dispatch: false, tech: true });
  });

  it('shows nothing when Odoo cannot answer', async () => {
    const r = await departmentAccess(fake({}).client);
    expect(r).toEqual({ warehouse: false, purchasing: false, pricing: false, dispatch: false, office: false, sales: false, owner: false, tech: false });
  });
});

describe('counting', () => {
  it('asks for a note on a big difference only', () => {
    expect(isBigDifference(10, 10)).toBe(false);
    expect(isBigDifference(10, 8)).toBe(false); // 2 of 10 is 20%, not over
    expect(isBigDifference(10, 7)).toBe(true); // 30%
    expect(isBigDifference(100, 90)).toBe(true); // over 5 units
    expect(isBigDifference(0, 3)).toBe(false);
  });

  it('names the adjustment so the history says why', () => {
    const t = Date.UTC(2026, 10, 20, 15);
    expect(countReason('Sam', t)).toBe('Cycle count, Nov 20, by Sam');
    expect(countReason('Sam', t, ' dropped a box ')).toBe('Cycle count, Nov 20, by Sam: dropped a box');
  });

  it('applies reviewed counts, refuses a big one with no note, and keeps going after a failure', async () => {
    const quants: Record<number, { id: number; qty: number }> = { 1: { id: 11, qty: 10 }, 2: { id: 12, qty: 20 }, 3: { id: 13, qty: 10 }, 4: { id: 14, qty: 5 } };
    const { client, calls } = fake({
      'stock.quant.search_read': (a) => {
        const pid = ((a[0] as unknown[][]).find((d) => d[0] === 'product_id') as [string, string, number])[2];
        return [{ id: quants[pid].id, quantity: quants[pid].qty, location_id: [7, 'Truck'] }];
      },
      'stock.quant.write': (a, kw) => {
        if ((a[0] as number[])[0] === 13) throw new Error('Odoo said no');
        expect(kw.context).toMatchObject({ inventory_mode: true, inventory_name: expect.stringContaining('Cycle count') });
        return true;
      },
      'stock.quant.action_apply_inventory': () => true,
    });
    const r = await applyCounts(
      client,
      7,
      [
        { productId: 1, name: 'Springs', expected: 10, counted: 10 }, // unchanged: skipped
        { productId: 2, name: 'Rollers', expected: 20, counted: 19 }, // small
        { productId: 3, name: 'Cables', expected: 10, counted: 9 }, // Odoo refuses
        { productId: 4, name: 'Openers', expected: 5, counted: 0 }, // 100%: needs a note
      ],
      'Sam',
      Date.UTC(2026, 10, 20),
    );
    expect(r.applied.map((a) => a.name)).toEqual(['Rollers']);
    expect(r.problems.map((p) => [p.name, p.why])).toEqual([['Cables', 'Odoo said no'], ['Openers', 'A big difference needs a note first.']]);
    // The big one reached Odoo only with a note.
    const again = await applyCounts(client, 7, [{ productId: 4, name: 'Openers', expected: 5, counted: 0, note: 'Opener box was returned' }], 'Sam', Date.UTC(2026, 10, 20));
    expect(again.applied).toHaveLength(1);
    expect(calls.some((c) => c.method === 'write' && JSON.stringify(c.kw).includes('Opener box was returned'))).toBe(true);
  });
});

describe('transfers', () => {
  const handlers = (state: { made: number; done: boolean; existing: number[] }): Record<string, Handler> => ({
    'stock.move.fields_get': () => ({ quantity: {}, product_uom: {}, name: {} }),
    'stock.picking.search': () => state.existing,
    'stock.location.read': () => [{ warehouse_id: [1, 'WH'] }],
    'stock.picking.type.search': () => [3],
    'product.product.read': () => [{ id: 11, uom_id: [1, 'Units'] }],
    'stock.picking.create': (a) => {
      state.made++;
      state.existing = [900];
      expect((a[0] as { origin: string }).origin).toBe(transferOrigin('k1'));
      return 900;
    },
    'stock.picking.read': () => [{ state: state.done ? 'done' : 'draft', name: 'WH/INT/1' }],
    'stock.picking.action_confirm': () => true,
    'stock.picking.action_assign': () => true,
    'stock.move.search_read': () => [{ id: 5, product_id: [11, 'Spring'] }],
    'stock.move.write': (a) => {
      expect(a[1]).toEqual({ quantity: 3 });
      return true;
    },
    'stock.picking.button_validate': () => {
      state.done = true;
      return true;
    },
  });

  it('moves parts as a validated internal transfer', async () => {
    const { client } = fake(handlers({ made: 0, done: false, existing: [] }));
    const r = await transferStock(client, 7, 8, [{ productId: 11, name: 'Spring', qty: 3 }], 'k1');
    expect(r).toEqual({ pickingId: 900, name: 'WH/INT/1', done: true });
  });

  it('does not move the parts twice when the same press is retried', async () => {
    const state = { made: 0, done: false, existing: [] as number[] };
    const { client } = fake(handlers(state));
    await transferStock(client, 7, 8, [{ productId: 11, name: 'Spring', qty: 3 }], 'k1');
    const second = await transferStock(client, 7, 8, [{ productId: 11, name: 'Spring', qty: 3 }], 'k1');
    expect(state.made).toBe(1);
    expect(second.done).toBe(true);
  });

  it('refuses a transfer to the same place or with nothing', async () => {
    const { client } = fake({});
    await expect(transferStock(client, 7, 7, [{ productId: 1, name: 'x', qty: 1 }], 'k')).rejects.toThrow(/different/);
    await expect(transferStock(client, 7, 8, [{ productId: 1, name: 'x', qty: 0 }], 'k')).rejects.toThrow(/Nothing/);
  });
});

describe('receiving', () => {
  it('sets what came and leaves the rest as a backorder', async () => {
    const writes: unknown[] = [];
    const { client, calls } = fake({
      'stock.move.fields_get': () => ({ quantity: {} }),
      'stock.move.read': () => [{ id: 1, product_uom_qty: 5 }, { id: 2, product_uom_qty: 2 }],
      'stock.move.write': (a) => writes.push(a),
      'stock.picking.button_validate': () => true,
    });
    const r = await receiveInto(client, 40, [{ moveId: 1, qty: 3 }, { moveId: 2, qty: 2 }]);
    expect(r).toEqual({ done: true, short: 1 });
    expect(writes).toEqual([[[1], { quantity: 3 }], [[2], { quantity: 2 }]]);
    // Odoo makes the backorder; the app does not cancel or force the rest.
    expect(calls.find((c) => c.method === 'button_validate')!.kw.context).toMatchObject({ skip_backorder: true });
  });

  it('says so when Odoo asks a question instead of finishing', async () => {
    const { client } = fake({
      'stock.move.fields_get': () => ({ quantity: {} }),
      'stock.move.read': () => [{ id: 1, product_uom_qty: 1 }],
      'stock.move.write': () => true,
      'stock.picking.button_validate': () => ({ type: 'ir.actions.act_window' }),
    });
    expect((await receiveInto(client, 40, [{ moveId: 1, qty: 1 }])).done).toBe(false);
  });
});

describe('to order', () => {
  it('works out the order, groups by vendor, and does not order what is already on order', async () => {
    const { client } = fake({
      'stock.warehouse.orderpoint.search_read': () => [
        { product_id: [1, 'Spring'], location_id: [7, 'WH'], product_min_qty: 4, product_max_qty: 10 },
        { product_id: [1, 'Spring'], location_id: [8, 'Truck'], product_min_qty: 2, product_max_qty: 4 },
        { product_id: [2, 'Roller'], location_id: [7, 'WH'], product_min_qty: 5, product_max_qty: 10 },
        { product_id: [3, 'Cable'], location_id: [7, 'WH'], product_min_qty: 1, product_max_qty: 2 },
      ],
      'stock.quant.search_read': () => [
        { product_id: [1, 'Spring'], quantity: 3 },
        { product_id: [2, 'Roller'], quantity: 1 },
        { product_id: [3, 'Cable'], quantity: 5 },
      ],
      'purchase.order.line.search_read': () => [{ product_id: [2, 'Roller'], product_qty: 10, qty_received: 4 }],
      'product.product.read': () => [
        { id: 1, product_tmpl_id: [101, 'Spring'], standard_price: 20 },
        { id: 2, product_tmpl_id: [102, 'Roller'], standard_price: 3 },
        { id: 3, product_tmpl_id: [103, 'Cable'], standard_price: 1 },
      ],
      'product.supplierinfo.search_read': () => [{ id: 1, product_tmpl_id: [101, 'Spring'], partner_id: [50, 'Door Supply'], price: 18, min_qty: 0, product_code: 'S1', delay: 3 }],
    });
    const groups = await toOrder(client);
    // Spring: have 3, minimum 6 (4+2), maximum 14: order 11. Roller: have 1 + 6 coming = 7 >= 5, nothing. Cable fine.
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ vendorId: 50, vendor: 'Door Supply' });
    expect(groups[0].lines).toEqual([{ productId: 1, name: 'Spring', onHand: 3, min: 6, max: 14, onOrder: 0, qty: 11, priceCents: 1800 }]);
    expect(groups[0].totalCents).toBe(19800);
  });

  it('suggests nothing when stock plus orders reach the minimum', () => {
    expect(suggestQty({ onHand: 2, min: 4, max: 10, onOrder: 2 })).toBe(0);
    expect(suggestQty({ onHand: 1, min: 4, max: 10, onOrder: 0 })).toBe(9);
    expect(suggestQty({ onHand: 0, min: 3, max: 0, onOrder: 0 })).toBe(6);
  });

  it('makes a draft and adds to an open one for the same vendor instead of making a second', async () => {
    const created: unknown[] = [];
    const { client } = fake({
      'purchase.order.search': () => [],
      'purchase.order.create': (a) => {
        created.push(a[0]);
        return 60;
      },
      'purchase.order.read': () => [{ name: 'P00060' }],
    });
    const r = await draftForVendor(client, 50, [{ productId: 1, name: 'Spring', qty: 2, priceCents: 1800 }, { productId: 2, name: 'Roller', qty: 0, priceCents: 300 }]);
    expect(r).toEqual({ id: 60, name: 'P00060', reused: false });
    expect(JSON.stringify(created[0])).not.toContain('Roller');
    await expect(draftForVendor(client, 0, [{ productId: 1, name: 'x', qty: 1, priceCents: 0 }])).rejects.toThrow(/vendor/);
    const open = fake({
      'purchase.order.search': () => [61],
      'purchase.order.read': () => [{ name: 'P00061', order_line: [1] }],
      'purchase.order.line.read': () => [{ product_id: [1, 'Spring'] }],
      'purchase.order.write': () => true,
    });
    const again = await draftForVendor(open.client, 50, [{ productId: 1, name: 'Spring', qty: 2, priceCents: 0 }, { productId: 2, name: 'Roller', qty: 1, priceCents: 0 }]);
    expect(again.reused).toBe(true);
    const w = open.calls.find((c) => c.method === 'write')!;
    expect(JSON.stringify(w.args)).toContain('Roller');
    expect(JSON.stringify(w.args)).not.toContain('Spring');
  });
});

describe('purchase orders', () => {
  it('groups Odoo states the way a buyer thinks', () => {
    expect([poGroup('draft'), poGroup('sent'), poGroup('to approve'), poGroup('purchase'), poGroup('done'), poGroup('cancel')]).toEqual(['draft', 'sent', 'sent', 'receive', 'done', null]);
  });

  it('confirms and emails from the button, and says why when the email cannot go', async () => {
    let state = 'draft';
    const base: Record<string, Handler> = {
      'purchase.order.read': () => [{ state }],
      'purchase.order.button_confirm': () => {
        state = 'purchase';
        return true;
      },
    };
    const ok = fake({ ...base, 'purchase.order.action_rfq_send': () => ({ context: { a: 1 } }), 'mail.compose.message.create': () => 9, 'mail.compose.message.action_send_mail': () => true });
    expect(await confirmAndSend(ok.client, 3)).toEqual({ state: 'purchase', emailed: true });
    state = 'draft';
    const noMail = fake({ ...base, 'purchase.order.action_rfq_send': () => { throw new Error('no mail'); } });
    const r = await confirmAndSend(noMail.client, 3);
    expect(r.emailed).toBe(false);
    expect(r.why).toMatch(/confirmed/);
  });

  it('stops for a manager when Odoo wants an approval', async () => {
    const { client, calls } = fake({
      'purchase.order.read': () => [{ state: 'to approve' }],
      'purchase.order.button_confirm': () => true,
    });
    const r = await confirmAndSend(client, 3);
    expect(r).toMatchObject({ state: 'to approve', emailed: false });
    expect(calls.some((c) => c.model === 'mail.compose.message')).toBe(false);
  });

  it('only changes lines on a draft', async () => {
    const { client } = fake({ 'purchase.order.read': () => [{ state: 'purchase' }] });
    await expect(editPurchaseLine(client, 1, { id: 2, qty: 3, priceCents: 100 })).rejects.toThrow(/draft/);
  });
});

describe('cost and price', () => {
  it('keeps the same margin at a new cost', () => {
    expect(marginPercent(600, 1000)).toBe(40);
    expect(priceAtSameMargin(600, 1000, 750)).toBe(1250);
    expect(priceAtSameMargin(600, 1000, 751)).toBe(1255);
  });

  it('lists parts whose last purchase cost more than the stored cost', async () => {
    const { client, calls } = fake({
      'purchase.order.line.search_read': () => [
        { product_id: [1, 'Spring'], price_unit: 12.5, date_order: '2026-11-10 12:00:00' },
        { product_id: [1, 'Spring'], price_unit: 9, date_order: '2026-10-10 12:00:00' },
        { product_id: [2, 'Roller'], price_unit: 2, date_order: '2026-11-01 12:00:00' },
      ],
      'product.product.read': () => [
        { id: 1, name: 'Spring', standard_price: 10, list_price: 20 },
        { id: 2, name: 'Roller', standard_price: 3, list_price: 6 },
      ],
    });
    const r = await costWentUp(client, Date.UTC(2026, 10, 17));
    expect(r.map((x) => [x.name, x.costCents, x.paidCents, x.suggestedPriceCents])).toEqual([['Spring', 1000, 1250, 2500]]);
    // Looking changes nothing.
    expect(calls.every((c) => c.method !== 'write')).toBe(true);
  });
});

describe('pricelists', () => {
  it('reads Odoo rules as fixed price, percent off or formula', async () => {
    const { client } = fake({
      'product.pricelist.item.search_read': () => [
        { id: 1, applied_on: '3_global', compute_price: 'percentage', percent_price: 10, min_quantity: 0 },
        { id: 2, applied_on: '1_product', product_tmpl_id: [5, 'Spring'], compute_price: 'fixed', fixed_price: 12.5, min_quantity: 3 },
        { id: 3, applied_on: '2_product_category', categ_id: [9, 'Openers'], compute_price: 'formula', min_quantity: 0 },
      ],
    });
    const rules = await pricelistRules(client, 1);
    expect(rules.map((r) => [r.scope, r.target, r.kind, ruleText(r)])).toEqual([
      ['all', 'Everything', 'percentage', '10% off'],
      ['product', 'Spring', 'fixed', '$12.50 each, from 3'],
      ['category', 'Openers', 'formula', 'A formula set in Odoo'],
    ]);
  });

  it('saves a rule to Odoo and refuses a bad one', async () => {
    const made: unknown[] = [];
    const { client } = fake({ 'product.pricelist.item.create': (a) => (made.push(a[0]), 70), 'product.pricelist.item.write': () => true });
    expect(await savePriceRule(client, 4, { scope: 'category', targetId: 9, kind: 'percentage', percent: 15, minQty: 2 })).toBe(70);
    expect(made[0]).toEqual({ pricelist_id: 4, applied_on: '2_product_category', compute_price: 'percentage', min_quantity: 2, percent_price: 15, categ_id: 9 });
    await expect(savePriceRule(client, 4, { scope: 'product', kind: 'fixed', fixedCents: 100 })).rejects.toThrow(/Pick/);
    await expect(savePriceRule(client, 4, { scope: 'all', kind: 'percentage', percent: 120 })).rejects.toThrow(/0 and 100/);
  });
});

describe('reorder levels from use', () => {
  it('suggests a minimum for about two weeks of use and a maximum of twice that', () => {
    const uses = [
      { orderId: 1, job: 'J1', site: '', at: 0, by: '', from: '', lines: [{ productId: 1, name: 'Roller', qty: 8 }, { productId: 2, name: 'Cable', qty: 1 }] },
      { orderId: 2, job: 'J2', site: '', at: 0, by: '', from: '', lines: [{ productId: 1, name: 'Roller', qty: 8 }] },
    ];
    const r = suggestFromUse(uses, 8);
    expect(r[0]).toMatchObject({ productId: 1, used: 16, perWeek: 2, min: 4, max: 8 });
    expect(r[1]).toMatchObject({ productId: 2, min: 1, max: 2 });
  });
});
