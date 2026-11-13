import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { daySummary, dayText, DAY_CLOSE_STORAGE_KEY, parseClosedDays } from '../lib/endOfDay';
import { Invoice } from '../lib/invoices';
import { createJob, Job, JOBS_STORAGE_KEY } from '../lib/jobs';
import { OdooClient, OdooError } from '../lib/odoo';
import { browseProducts, createProduct, findProductByCode, likeExact, searchProducts, NoTruckError, PartialSyncError, truckFor, receivePurchaseOrder, sendPurchaseOrder, setTruckQty, syncTruck } from '../lib/odooStock';
import { matchItem, pickList, springSize } from '../lib/pickList';
import { DEFAULT_PRICE_SHEET, PriceSheet } from '../lib/prices';
import { Appointment } from '../lib/schedule';
import { phoneScoreData, scorecard, tierIn } from '../lib/scorecard';
import { findByCode, onOrder, orders, parseStock, STOCK_STORAGE_KEY, StockItem, StockStore, usedTotals } from '../lib/stock';
import { StockProvider, useStock } from '../lib/useStock';
import { ProductPicker } from '../components/ProductPicker';
import { renderApp } from '../testing/renderApp';

const DAY = 86_400_000;
const item = (id: string, extra: Partial<StockItem> = {}): StockItem => ({ id, name: id, sku: '', category: 'parts', onHand: 0, min: 1, par: 3, supplier: '', costCents: 0, updatedAt: 1, ...extra });

type Call = { model: string; method: string; args: unknown[]; kw: Record<string, unknown> };

/** A pretend Odoo 19 with Inventory and Purchase: a Truck 1 location (id 7) and a few products. */
function fakeStockOdoo() {
  const calls: Call[] = [];
  const products = [
    { id: 11, name: 'Nylon rollers (10)', default_code: 'ROL-10', barcode: '0123456789012', standard_price: 18.5, product_tmpl_id: [111, 'Rollers'] },
    { id: 12, name: '.250 x 2" x 30" torsion spring', default_code: 'SPR-250-30', barcode: '', standard_price: 24, product_tmpl_id: [112, 'Spring'] },
    { id: 13, name: 'Safety sensors (pair)', default_code: '', barcode: '777', standard_price: 0, product_tmpl_id: [113, 'Sensors'], categ_id: [5, 'All / Openers'] },
    { id: 14, name: 'Roller replacement labor', default_code: 'LAB-ROL', barcode: '', standard_price: 0, product_tmpl_id: [114, 'Labor'], type: 'service' },
  ];
  const failOn: { writes?: number } = {};
  /** Templates Odoo keeps no stock of: a consumable (Track Inventory off) or a service. */
  const untracked: Record<number, 'consu' | 'service'> = {};
  const tmplOf = (pid: number) => (products.find((p) => p.id === pid)?.product_tmpl_id[0] as number) ?? 0;
  const locations = [
    { id: 7, name: 'Truck 1', complete_name: 'WH/Truck 1' },
    { id: 8, name: 'Truck - Sam Ortiz', complete_name: 'WH/Truck - Sam Ortiz' },
  ];
  const quants: { id: number; product: number; qty: number; pending?: number; loc?: number }[] = [{ id: 1, product: 11, qty: 5 }];
  const pickings: Record<number, { state: string; dest: number; lines: { product: number; qty: number }[] }> = {};
  let nextId = 100;
  const call = async (model: string, method: string, args: unknown[] = [], kw: Record<string, unknown> = {}) => {
    calls.push({ model, method, args, kw });
    const key = `${model}.${method}`;
    const pname = (id: number) => products.find((p) => p.id === id)!.name;
    switch (key) {
      case 'stock.location.search_read':
        return locations;
      case 'stock.quant.search_read': {
        const d = args[0] as unknown[][];
        const pid = d.find((x) => x[0] === 'product_id')?.[2];
        const loc = d.find((x) => x[0] === 'location_id')?.[2];
        // Location 9 is a shelf inside Truck 1 (7).
        const inLoc = (q: { loc?: number }) => loc === undefined || (q.loc ?? 7) === loc || (q.loc === 9 && loc === 7);
        if (pid !== undefined && failOn.writes !== undefined && failOn.writes-- === 0) throw new Error('Network request failed');
        return quants.filter((q) => (pid === undefined || q.product === pid) && inLoc(q)).map((q) => ({ id: q.id, product_id: [q.product, pname(q.product)], location_id: [q.loc ?? 7, 'Truck'], quantity: q.qty }));
      }
      case 'stock.warehouse.orderpoint.search_read':
        return [{ id: 1, product_id: [11, pname(11)], product_min_qty: 2, product_max_qty: 6 }];
      case 'product.product.read':
        return (args[0] as number[]).map((id) => products.find((p) => p.id === id)).filter(Boolean);
      case 'product.supplierinfo.search_read':
        return [{ id: 1, partner_id: [55, 'DDM Garage Doors'], product_tmpl_id: [111, 'Rollers'], product_id: false, product_code: 'D-ROL', price: 17 }];
      case 'product.product.search': {
        const d = JSON.stringify(args[0]);
        // Browsing goods to add to the truck.
        const dom = args[0] as unknown[];
        const goods = (p: { type?: string }) => !(dom[0] as unknown[])?.[0] || (dom[0] as unknown[])[0] !== 'type' || p.type !== 'service';
        // A typed search (adding a part, or one not on the truck): goods whose name, reference or barcode match.
        const nameLike = dom.find((x) => Array.isArray(x) && x[0] === 'name' && x[1] === 'ilike') as unknown[] | undefined;
        if (nameLike) {
          const t = String(nameLike[2]).toLowerCase();
          return products.filter((p) => goods(p) && (p.name.toLowerCase().includes(t) || p.default_code.toLowerCase().includes(t) || p.barcode === t)).map((p) => p.id);
        }
        if ((dom[0] as unknown[])?.[0] === 'type') return products.filter(goods).map((p) => p.id);
        const hit = products.find((p) => (p.barcode && d.includes(`"${p.barcode}"`)) || (p.default_code && d.toLowerCase().includes(`"${p.default_code.toLowerCase()}"`)) || d.toLowerCase().includes(`"${p.name.toLowerCase().replace(/"/g, '\\"')}"`));
        return hit ? [hit.id] : [];
      }
      case 'stock.quant.write': {
        const q = quants.find((x) => x.id === (args[0] as number[])[0])!;
        q.pending = (args[1] as { inventory_quantity: number }).inventory_quantity;
        return true;
      }
      case 'stock.quant.create': {
        const v = args[0] as { product_id: number; inventory_quantity: number };
        if (untracked[tmplOf(v.product_id)]) throw new OdooError('Quants cannot be created for consumables or services.', 'server');
        const id = nextId++;
        quants.push({ id, product: v.product_id, qty: 0, pending: v.inventory_quantity, loc: (v as { location_id?: number }).location_id });
        return id;
      }
      case 'stock.quant.action_apply_inventory': {
        const q = quants.find((x) => x.id === (args[0] as number[])[0])!;
        q.qty = q.pending ?? q.qty;
        delete q.pending;
        return true;
      }
      case 'product.template.fields_get':
        return { type: {}, is_storable: {} };
      case 'product.template.read':
        return (args[0] as number[]).map((id) => ({ id, type: untracked[id] ?? 'consu', is_storable: !untracked[id] }));
      case 'product.product.create': {
        const v = args[0] as { name: string; default_code: string | false; barcode: string | false; standard_price?: number };
        const id = nextId++;
        products.push({ id, name: v.name, default_code: v.default_code || '', barcode: v.barcode || '', standard_price: v.standard_price ?? 0, product_tmpl_id: [id + 1000, v.name] });
        return id;
      }
      case 'res.partner.search':
        return [];
      case 'res.partner.create':
        return 56;
      case 'purchase.order.create': {
        const v = args[0] as { order_line: [number, number, { product_id: number; product_qty: number }][] };
        pickings[400] = { state: 'assigned', dest: 8, lines: v.order_line.map(([, , l]) => ({ product: l.product_id, qty: l.product_qty })) };
        return 300;
      }
      case 'purchase.order.button_confirm':
        return true;
      case 'purchase.order.read':
        return [{ id: 300, name: 'P00012', picking_ids: [400] }];
      case 'stock.picking.write':
        pickings[400].dest = (args[1] as { location_dest_id: number }).location_dest_id;
        return true;
      case 'purchase.order.action_rfq_send':
        return { type: 'ir.actions.act_window', context: { default_model: 'purchase.order', default_res_ids: [300], default_template_id: 9 } };
      case 'mail.compose.message.create':
        return 600;
      case 'mail.compose.message.action_send_mail':
        return true;
      case 'stock.picking.read':
        return [{ id: 400, state: pickings[400].state }];
      case 'stock.picking.button_validate': {
        const p = pickings[400];
        p.state = 'done';
        if (p.dest === 7)
          for (const l of p.lines) {
            const q = quants.find((x) => x.product === l.product);
            if (q) q.qty += l.qty;
            else quants.push({ id: nextId++, product: l.product, qty: l.qty });
          }
        return true;
      }
    }
    throw new Error(`fake Odoo has no ${key}`);
  };
  const session = { uid: 2, name: 'Justin Johnson', kind: 'oca', fields: [], apps: { products: true, sales: true, invoicing: true } };
  const client = { session, call } as unknown as OdooClient;
  return { client, calls, quants, pickings, failOn, session, locations, products, untracked };
}

describe('truck stock with Odoo Inventory (plain logic)', () => {
  it('links phone items, sends phone changes as a difference, and takes Odoo numbers back', async () => {
    const o = fakeStockOdoo();
    // Phone: rollers by name (5 in Odoo), a spring with a count Odoo doesn't have, a part typed in that Odoo doesn't have, and an old sample.
    const sample = item('t', { name: '.243 x 1¾" x 30" torsion spring', category: 'springs', onHand: 2 });
    const store: StockStore = { items: [item('r', { name: 'Nylon rollers (10)', onHand: 3 }), item('s', { name: 'Spring', sku: 'SPR-250-30', onHand: 4 }), item('x', { name: 'Shop rags', onHand: 9 }), sample], suppliers: [] };
    let n = 0;
    const first = await syncTruck(o.client, store, 1000, () => `new${++n}`);
    expect(first.linked).toBe(2);
    expect(first.removed).toEqual([sample.name]);
    // The typed-in part is made in Odoo and its count goes up as new stock.
    expect(first.created).toEqual(['Shop rags']);
    expect(first.sent).toBe(1);
    expect(first.store.items.find((i) => i.id === 'x')).toMatchObject({ odooId: 100, onHand: 9, syncedOnHand: 9 });
    // Odoo is the record: a first link sends nothing and takes Odoo's count (no spring on the truck there).
    expect(first.store.items.map((i) => i.id)).toEqual(['r', 's', 'x']);
    expect(first.store.items.find((i) => i.id === 's')).toMatchObject({ odooId: 12, onHand: 0, syncedOnHand: 0 });
    const r = first.store.items.find((i) => i.id === 'r')!;
    expect(r).toMatchObject({ odooId: 11, onHand: 5, syncedOnHand: 5, min: 2, par: 6, sku: 'ROL-10', barcode: '0123456789012', costCents: 1850, supplier: 'DDM Garage Doors' });
    expect(first.store.suppliers).toEqual([{ name: 'DDM Garage Doors', phone: '', email: '', odooId: 55 }]);
    expect(first.store.truck).toEqual({ locationId: 7, name: 'WH/Truck 1', syncedAt: 1000, uid: 2 });

    // Two rollers used on the phone while someone in Odoo added 3 (a receipt): 5 + 3 - 2 = 6.
    o.quants.find((q) => q.product === 11)!.qty = 8;
    const used = { ...first.store, items: first.store.items.map((i) => (i.id === 'r' ? { ...i, onHand: 3 } : i)) };
    const second = await syncTruck(o.client, used, 2000);
    expect(second.sent).toBe(1);
    expect(o.quants.find((q) => q.product === 11)?.qty).toBe(6);
    expect(second.store.items.find((i) => i.id === 'r')).toMatchObject({ onHand: 6, syncedOnHand: 6 });
    // The inventory adjustment is applied the way Odoo's Physical Inventory does it.
    const apply = o.calls.filter((c) => c.method === 'action_apply_inventory');
    expect(apply.every((c) => (c.kw.context as { inventory_mode?: boolean }).inventory_mode)).toBe(true);

    // A product Odoo puts on the truck shows up on the phone.
    o.quants.push({ id: 50, product: 13, qty: 2 });
    const third = await syncTruck(o.client, second.store, 3000, () => 'new-sensors');
    expect(third.added).toBe(1);
    expect(third.store.items.find((i) => i.id === 'new-sensors')).toMatchObject({ name: 'Safety sensors (pair)', category: 'openers', onHand: 2, odooId: 13, barcode: '777' });
  });

  it("gives each tech their own truck: by name, else Truck 1, else they pick", async () => {
    const t = (id: number, name: string) => ({ locationId: id, name, syncedAt: 0 });
    const trucks = [t(7, 'WH/Truck 1'), t(8, 'WH/Truck - Sam Ortiz'), t(9, "WH/Justin's truck")];
    expect(truckFor(trucks, 'Sam Ortiz')?.locationId).toBe(8);
    expect(truckFor(trucks, 'Justin Johnson')?.locationId).toBe(9);
    expect(truckFor(trucks, 'Pat Lee')?.locationId).toBe(7);
    expect(truckFor([t(8, 'WH/Truck - Sam Ortiz'), t(10, 'WH/Van')], 'Pat Lee')).toBeNull();

    // Sam signs in on a phone that synced Justin's truck: Sam's own truck is used, with Odoo's counts, and nothing of Justin's is sent to it.
    const o = fakeStockOdoo();
    o.quants.push({ id: 60, product: 12, qty: 2, loc: 8 });
    const justin = (await syncTruck(o.client, { items: [item('s', { name: 'Spring', sku: 'SPR-250-30', onHand: 4 })], suppliers: [] }, 1000)).store;
    expect(justin.truck).toMatchObject({ locationId: 7, uid: 2 });
    o.session.uid = 3;
    o.session.name = 'Sam Ortiz';
    const sentBefore = o.calls.filter((c) => c.method === 'action_apply_inventory').length;
    const sam = await syncTruck(o.client, justin, 2000);
    expect(sam.store.truck).toMatchObject({ locationId: 8, uid: 3 });
    expect(o.calls.filter((c) => c.method === 'action_apply_inventory').length).toBe(sentBefore);
    expect(sam.store.items.find((i) => i.id === 's')).toMatchObject({ onHand: 2, syncedOnHand: 2 });
    expect(o.quants.filter((q) => q.product === 12 && (q.loc ?? 7) === 7).map((q) => q.qty)).toEqual([]);

    // Nobody's truck and no Truck 1: the sync asks them to pick.
    o.locations.splice(0, 2, { id: 10, name: 'Van', complete_name: 'WH/Van' }, { id: 11, name: 'Shop', complete_name: 'WH/Shop' });
    o.session.uid = 4;
    o.session.name = 'Pat Lee';
    await expect(syncTruck(o.client, sam.store, 3000)).rejects.toBeInstanceOf(NoTruckError);
  });

  it('keeps the counts Odoo took when a sync stops partway, so none is sent twice', async () => {
    const o = fakeStockOdoo();
    o.quants.push({ id: 2, product: 12, qty: 10 });
    const store: StockStore = {
      items: [item('r', { odooId: 11, onHand: 3, syncedOnHand: 5 }), item('s', { odooId: 12, onHand: 7, syncedOnHand: 10 })],
      suppliers: [],
      truck: { locationId: 7, name: 'Truck 1', syncedAt: 1 },
    };
    o.failOn.writes = 1; // The first count goes through, the second loses signal.
    const err = await syncTruck(o.client, store, 2000).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PartialSyncError);
    const partial = (err as PartialSyncError).store;
    expect(o.quants.find((q) => q.product === 11)?.qty).toBe(3);
    expect(partial.items.find((i) => i.id === 'r')).toMatchObject({ onHand: 3, syncedOnHand: 3 });
    expect(partial.items.find((i) => i.id === 's')).toMatchObject({ onHand: 7, syncedOnHand: 10 });
    // Signal's back: rollers aren't sent again, the spring's -3 goes up once.
    const again = await syncTruck(o.client, partial, 3000);
    expect(again.sent).toBe(1);
    expect(o.quants.find((q) => q.product === 11)?.qty).toBe(3);
    expect(o.quants.find((q) => q.product === 12)?.qty).toBe(7);
  });

  it('spreads a count over several quants of one product, and matches names literally', async () => {
    const o = fakeStockOdoo();
    o.quants.push({ id: 3, product: 11, qty: 4, loc: 9 });
    // 5 + 4 = 9 on the truck; set it to 2: take 5 from the first, 2 from the shelf.
    await setTruckQty(o.client, 7, 11, 2);
    expect(o.quants.filter((q) => q.product === 11).map((q) => q.qty)).toEqual([0, 2]);
    await setTruckQty(o.client, 7, 11, 6);
    expect(o.quants.filter((q) => q.product === 11).reduce((n, q) => n + q.qty, 0)).toBe(6);
    expect(likeExact('50% off_x')).toBe('50\\% off\\_x');
  });

  it('finds a product by barcode, and sends, emails and receives a purchase order onto the truck', async () => {
    const o = fakeStockOdoo();
    expect(await findProductByCode(o.client, '0123456789012')).toMatchObject({ id: 11, name: 'Nylon rollers (10)', vendor: { id: 55, name: 'DDM Garage Doors' } });
    expect(await findProductByCode(o.client, 'nope')).toBeNull();

    const po = await sendPurchaseOrder(o.client, { name: 'ABC Supply', phone: '', email: 'x@abc.test' }, [{ productId: 12, name: 'Spring', qty: 3, priceCents: 2400 }], { locationId: 7, name: 'Truck 1', syncedAt: 0 }, 'Truck 1');
    expect(po).toEqual({ odooId: 300, name: 'P00012', vendorId: 56, emailed: true });
    const create = o.calls.find((c) => c.model === 'purchase.order' && c.method === 'create')!;
    expect(create.args[0]).toEqual({ partner_id: 56, origin: 'Truck 1', order_line: [[0, 0, { product_id: 12, name: 'Spring', product_qty: 3, price_unit: 24 }]] });
    expect(o.calls.find((c) => c.model === 'mail.compose.message' && c.method === 'action_send_mail')?.kw.context).toMatchObject({ default_template_id: 9 });
    expect(o.pickings[400].dest).toBe(7);

    expect(await receivePurchaseOrder(o.client, 300)).toBe(true);
    expect(o.quants.find((q) => q.product === 12)?.qty).toBe(3);
  });

  it("asks for Track Inventory on a consumable, and one part Odoo refuses doesn't stop the rest", async () => {
    const o = fakeStockOdoo();
    const truck = { locationId: 7, name: 'Truck 1', syncedAt: 1, uid: 2 };
    // Sensors (template 113) are a consumable in Odoo: that part waits with the phone's count, and the rollers still go.
    o.untracked[113] = 'consu';
    const r = await syncTruck(o.client, { items: [item('e', { name: 'Genie belt', odooId: 13, onHand: 2, syncedOnHand: 0 }), item('r', { odooId: 11, onHand: 4, syncedOnHand: 5 })], suppliers: [], truck }, 20);
    expect(r.sent).toBe(1);
    expect(o.quants.find((q) => q.product === 11)?.qty).toBe(4);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0].why).toMatch(/isn't tracked in Odoo\. In Odoo open the product and tick Track Inventory, then sync\./);
    expect(r.store.items.find((i) => i.id === 'e')).toMatchObject({ onHand: 2, syncedOnHand: 0 });
    expect(r.store.items.find((i) => i.id === 'r')).toMatchObject({ onHand: 4, syncedOnHand: 4 });
    // The app never changes the product itself.
    expect(o.calls.some((c) => c.model === 'product.template' && c.method === 'write')).toBe(false);

    // Once the owner ticks Track Inventory in Odoo, the next sync sends it.
    delete o.untracked[113];
    const next = await syncTruck(o.client, r.store, 30);
    expect(next.problems).toEqual([]);
    expect(o.quants.find((q) => q.product === 13)?.qty).toBe(2);
  });

  it('lists Odoo products to pick for the truck, with their category, or the ones matching what is typed', async () => {
    const o = fakeStockOdoo();
    const all = await browseProducts(o.client, '');
    expect(all.map((p) => p.id)).toEqual([11, 12, 13]);
    expect(o.calls.find((c) => c.method === 'search')?.args[0]).toEqual([['type', '!=', 'service']]);
    expect(all.find((p) => p.id === 13)).toMatchObject({ category: 'Openers', barcode: '777' });
    // Typing "rol" matches the rollers and the roller labor; the labor is a service, so it isn't offered.
    expect((await browseProducts(o.client, 'rol')).map((p) => p.id)).toEqual([11]);
    expect(o.calls.filter((c) => c.method === 'search').pop()?.args[0]).toEqual([['type', '!=', 'service'], '|', '|', ['name', 'ilike', 'rol'], ['default_code', 'ilike', 'rol'], ['barcode', '=', 'rol']]);
  });

  it('makes a new stocked product, finds products by what is typed, and keeps one item per product', async () => {
    const o = fakeStockOdoo();
    expect((await searchProducts(o.client, 'roller')).map((p) => p.id)).toEqual([11]);
    expect(await searchProducts(o.client, '  ')).toEqual([]);
    const id = await createProduct(o.client, { name: ' Bottom seal 16ft ', sku: 'SEAL-16', costCents: 2250 });
    expect(o.calls.find((c) => c.method === 'create' && c.model === 'product.product')?.args[0]).toEqual({ name: 'Bottom seal 16ft', default_code: 'SEAL-16', barcode: false, standard_price: 22.5, sale_ok: true, purchase_ok: true, type: 'consu', is_storable: true });
    expect((await searchProducts(o.client, 'seal')).map((p) => p.id)).toEqual([id]);

    // Two phone items for one Odoo product (an old sample and the Odoo one) would show two counts: the second goes.
    const r = await syncTruck(o.client, { items: [item('a', { odooId: 11, onHand: 5, syncedOnHand: 5 }), item('b', { name: 'Nylon rollers (10)', onHand: 6 })], suppliers: [], truck: { locationId: 7, name: 'Truck 1', syncedAt: 1 } }, 10);
    expect(r.store.items.map((i) => [i.id, i.onHand])).toEqual([['a', 5]]);
    expect(r.removed).toEqual(['Nylon rollers (10)']);

    // A second item's unsent change (2 used) isn't lost: it's folded into the one kept and sent.
    const sent = await syncTruck(o.client, { items: [item('a', { odooId: 11, onHand: 5, syncedOnHand: 5 }), item('c', { odooId: 11, onHand: 3, syncedOnHand: 5 })], suppliers: [], truck: { locationId: 7, name: 'Truck 1', syncedAt: 1 } }, 20);
    expect(sent.store.items.map((i) => [i.id, i.onHand])).toEqual([['a', 3]]);
    expect(o.quants.find((q) => q.product === 11)?.qty).toBe(3);
  });

  it('leaves items already on order off the next order, and adds up parts used', () => {
    const items = [item('a', { onHand: 0, supplier: 'DDM' }), item('b', { onHand: 0, supplier: 'DDM' })];
    const ordered = onOrder([{ id: 'p', supplier: 'DDM', odooId: 1, name: 'P1', lines: [{ itemId: 'a', qty: 3 }], at: 1, emailed: true }]);
    expect(orders(items, ordered)[0].lines.map((l) => l.item.id)).toEqual(['b']);
    expect(usedTotals([{ id: '1', itemId: 'a', name: 'A', qty: 1, at: 10, jobId: 'j' }, { id: '2', itemId: 'a', name: 'A', qty: 2, at: 20 }, { id: '3', itemId: 'b', name: 'B', qty: 1, at: 5 }], { from: 8 })).toEqual([{ itemId: 'a', name: 'A', qty: 3 }]);
    expect(findByCode([item('a', { barcode: '123' }), item('b', { sku: 'ABC' })], 'abc')?.id).toBe('b');
    const round = parseStock(JSON.stringify({ items: [item('a', { barcode: '1', odooId: 4, syncedOnHand: 2 })], suppliers: [{ name: 'DDM', odooId: 55 }], used: [{ id: 'u', itemId: 'a', name: 'A', qty: 1, at: 3 }], truck: { locationId: 7, name: 'T', syncedAt: 1 } }));
    expect(round.items[0]).toMatchObject({ barcode: '1', odooId: 4, syncedOnHand: 2 });
    expect(round.suppliers[0].odooId).toBe(55);
    expect(round.used).toHaveLength(1);
    expect(round.truck?.locationId).toBe(7);
  });
});

const MATCH = { mode: 'match' as const, form: { ...DEFAULT_MATCH_FORM, twentyCoil: '4 1/2', length: '24' } };
const SHEET: PriceSheet = { ...DEFAULT_PRICE_SHEET, spring: { good: '60', better: '85', best: '120' }, serviceCall: '89', addOns: DEFAULT_PRICE_SHEET.addOns.map((a) => (a.id === 'rollers' ? { ...a, price: '40' } : a)) };

describe("tomorrow's pick list", () => {
  it('reads spring sizes written either way', () => {
    expect(springSize('2 springs, .243 × 1 3/4" × 30"')).toBe(springSize('.243 x 1¾" x 30" torsion spring'));
    expect(matchItem({ label: 'Nylon rollers (set)', cents: 1, taxable: true, key: 'addOn.rollers' }, [item('r', { name: 'Nylon rollers (set)' })], SHEET)?.id).toBe('r');
  });

  it("lists the picked option's parts for tomorrow's visits, short ones first", () => {
    const now = new Date(2026, 10, 12, 17).getTime();
    const job = { ...createJob(MATCH, { customer: 'Ortega', address: '1 Elm', phone: '', notes: '' }, { title: 'x' }, now, 'j1'), accepted: { tier: 'best' as const, total: 1, at: now } };
    const other = createJob(MATCH, { customer: 'Lee', address: '', phone: '', notes: '' }, { title: 'x' }, now, 'j2');
    const at = new Date(2026, 10, 13, 9).getTime();
    const appt = (id: string, jobId: string, name: string): Appointment => ({ id, start: at, minutes: 60, jobId, name, address: '', phone: '', what: '', status: 'booked', createdAt: 0, updatedAt: 0 });
    const list = pickList([appt('a1', 'j1', 'Ortega'), appt('a2', 'j2', 'Lee')], [job, other], [item('rol', { name: 'Nylon rollers (set)', onHand: 3 })], SHEET, now);
    expect(list.visits).toBe(2);
    expect(list.unknown).toEqual(['Lee']);
    expect(list.onTruck.map((n) => n.label)).toEqual(['Nylon rollers (set)']);
    // The spring isn't on the truck; best also includes end bearings and lift cables, which aren't either.
    expect(list.short.map((n) => [n.label.replace(/,.*/, ''), n.have])).toEqual(expect.arrayContaining([['End bearings (pair)', 0], ['Lift cables (pair)', 0]]));
    expect(list.short.some((n) => /spring/.test(n.label) && n.forWho.includes('Ortega'))).toBe(true);
    expect(list.short.some((n) => /Tune-up/.test(n.label))).toBe(false);
  });
});

const inv = (id: string, at: number, total: number, payments: Invoice['payments'] = []): Invoice =>
  ({ id, number: id, jobId: 'j', billTo: '', address: '', tier: 'good', lines: [], subtotal: total, tax: 0, total, payments, createdAt: at, updatedAt: at }) as Invoice;

describe('end of day (plain logic)', () => {
  it('adds up jobs, money by method, owed, hours and miles for today only', () => {
    const now = new Date(2026, 10, 12, 18).getTime();
    const morning = new Date(2026, 10, 12, 8).getTime();
    const done = { ...createJob(MATCH, { customer: 'A', address: '', phone: '', notes: '' }, { title: '' }, morning, 'a'), steps: { arrivedAt: morning, workDoneAt: morning + 3600_000 } } as Job;
    const open = { ...createJob(MATCH, { customer: 'B', address: '', phone: '', notes: '' }, { title: '' }, morning, 'b'), steps: { arrivedAt: morning + 7200_000 } } as Job;
    const old = createJob(MATCH, { customer: 'C', address: '', phone: '', notes: '' }, { title: '' }, morning - 3 * DAY, 'c');
    const invoices = [
      inv('1', morning, 50000, [
        { id: 'p1', method: 'cash', amount: 20000, at: morning, reference: '' },
        { id: 'p2', method: 'check', amount: 10000, at: morning, reference: '101' },
      ]),
      inv('2', morning, 30000, [{ id: 'p3', method: 'zelle', amount: 30000, at: morning, reference: '' }]),
      inv('3', morning - DAY, 9999, [{ id: 'p4', method: 'cash', amount: 9999, at: morning - DAY, reference: '' }]),
    ];
    const shifts = [{ id: 's', start: morning, end: morning + 7.5 * 3600_000, odoStart: 1000, odoEnd: 1064, note: '', updatedAt: 0 }];
    const s = daySummary({ jobs: [done, open, old], invoices, shifts, appointments: [], stock: { items: [item('x', { onHand: 0 })], suppliers: [], used: [{ id: 'u', itemId: 'x', name: 'X', qty: 2, at: morning }] } }, now);
    expect(s).toMatchObject({ jobs: 2, jobsDone: 1, billed: 80000, checks: 1, taken: 60000, owed: 20000, ms: 7.5 * 3600_000, miles: 64, toOrder: 1, partsUsed: 2, onClock: false });
    expect(s.byMethod).toEqual({ cash: 20000, check: 10000, cashapp: 0, venmo: 0, zelle: 30000 });
    const text = dayText(s, 'Johnsons');
    expect(text).toMatch(/Jobs: 1 of 2 done/);
    expect(text).toMatch(/To deposit: \$300(\.00)?/);
    expect(text).toMatch(/Miles: 64/);
  });
});

describe('tech scorecard (plain logic)', () => {
  it('works out quotes won, ticket, callbacks and Better or Best per tech', () => {
    const t0 = new Date(2026, 10, 1).getTime();
    const p = { start: t0, end: t0 + 30 * DAY };
    const s = scorecard(
      {
        visits: [
          { tech: 'Justin', place: 'l:1', at: t0 - 10 * DAY },
          { tech: 'Sam', place: 'l:1', at: t0 + 2 * DAY },
          { tech: 'Sam', place: 'l:2', at: t0 + 3 * DAY },
          { tech: 'Justin', place: 'l:2', at: t0 + 50 * DAY },
        ],
        quotes: [
          { tech: 'Justin', at: t0 + DAY, won: true, tier: 'best' },
          { tech: 'Justin', at: t0 + DAY, won: true, tier: 'good' },
          { tech: 'Justin', at: t0 + DAY, won: false },
          { tech: 'Sam', at: t0 + DAY, won: true },
        ],
        tickets: [
          { tech: 'Justin', at: t0 + DAY, cents: 40000 },
          { tech: 'Justin', at: t0 + DAY, cents: 50000 },
        ],
      },
      p,
    );
    const j = s.find((x) => x.tech === 'Justin')!;
    // The job at place 1 twelve days after Justin's counts as his callback.
    expect(j).toMatchObject({ quotes: 3, won: 2, averageTicket: 45000, callbacks: 1, betterBest: 0.5 });
    expect(j.winRate).toBeCloseTo(2 / 3);
    expect(s.find((x) => x.tech === 'Sam')).toMatchObject({ jobs: 2, callbacks: 0, averageTicket: null, betterBest: null });
    expect(tierIn('Better · 12 Elm St')).toBe('better');
    const phone = phoneScoreData([{ ...createJob(MATCH, { customer: 'A', address: '1 Elm', phone: '', notes: '' }, { title: '' }, t0, 'a'), accepted: { tier: 'better', total: 1, at: t0 } }], [], 'Me');
    expect(scorecard(phone, p)[0]).toMatchObject({ tech: 'Me', won: 1, betterBest: 1 });
  });
});

describe('job part orders and adding parts signed in (StockProvider)', () => {
  const settle = async (n = 5) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };
  async function mount(start: StockStore) {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(STOCK_STORAGE_KEY, JSON.stringify(start));
    const api: { current: ReturnType<typeof useStock> | null } = { current: null };
    function Grab() {
      api.current = useStock();
      return null;
    }
    await render(
      <StockProvider>
        <Grab />
      </StockProvider>,
    );
    await settle();
    return () => api.current!;
  }

  it('orders a part that is not on the truck for a job, and puts it on the job when it comes in', async () => {
    const o = fakeStockOdoo();
    const stock = await mount({ items: [], suppliers: [], truck: { locationId: 7, name: 'WH/Truck 1', syncedAt: 1, uid: 2 } });
    const [spring] = await searchProducts(o.client, 'torsion');
    let po!: Awaited<ReturnType<ReturnType<typeof stock>['orderForJob']>>;
    await act(async () => {
      po = await stock().orderForJob(o.client, { product: spring, qty: 2, supplier: 'ABC Supply', pickup: true, jobId: 'j1', jobName: 'Ortega' });
    });
    expect(po).toMatchObject({ name: 'P00012', jobId: 'j1', pickup: true, lines: [{ qty: 2 }] });
    expect(o.calls.find((c) => c.model === 'purchase.order' && c.method === 'create')?.args[0]).toMatchObject({ origin: 'WH/Truck 1 · Pickup · Job: Ortega' });
    // Listed on the truck at 0 with no reorder, so it never lands on a restock order.
    expect(stock().items).toEqual([expect.objectContaining({ odooId: 12, onHand: 0, syncedOnHand: 0, min: 0, par: 0 })]);

    await act(async () => {
      expect(await stock().receiveOrder(o.client, po.id)).toBe(true);
    });
    await settle();
    // Received onto the truck in Odoo, then taken off it for the job.
    expect(stock().used).toEqual([expect.objectContaining({ jobId: 'j1', qty: 2, itemId: po.lines[0].itemId })]);
    expect(stock().items[0]).toMatchObject({ onHand: 0, syncedOnHand: 2 });
    await act(async () => {
      await stock().sync(o.client);
    });
    expect(o.quants.find((q) => q.product === 12)?.qty).toBe(0);
  });

  it('makes a new part in Odoo and sends its count, and an undo only puts back what came off', async () => {
    const o = fakeStockOdoo();
    const stock = await mount({ items: [item('r', { odooId: 11, name: 'Nylon rollers (10)', onHand: 0, syncedOnHand: 0 })], suppliers: [], truck: { locationId: 7, name: 'WH/Truck 1', syncedAt: 1, uid: 2 } });
    let id = '';
    await act(async () => {
      id = await stock().addToOdoo(o.client, { name: 'Bottom seal', sku: '', category: 'parts', onHand: 3, min: 1, par: 4, supplier: '', costCents: 0 });
    });
    expect(stock().items.find((i) => i.id === id)).toMatchObject({ odooId: 100, onHand: 3, syncedOnHand: 0 });
    await act(async () => {
      await stock().sync(o.client);
    });
    expect(o.quants.find((q) => q.product === 100)?.qty).toBe(3);

    // A part taken when the truck said 0, then undone, leaves the count at 0.
    await act(async () => stock().takeParts('r', 1, 'j1'));
    await settle();
    // The sync above made rollers 5 again (Odoo's number).
    expect(stock().items.find((i) => i.id === 'r')?.onHand).toBe(4);
    await act(async () => stock().update('r', { onHand: 0 }));
    await act(async () => stock().takeParts('r', 1, 'j1'));
    await settle();
    const zero = stock().used!.find((u) => u.off === 0)!;
    await act(async () => stock().undoUse(zero.id));
    await settle();
    expect(stock().items.find((i) => i.id === 'r')?.onHand).toBe(0);
  });
});

describe('picking a part from Odoo', () => {
  it('shows Odoo products by category, searches as you type, and offers a new part last', async () => {
    jest.useFakeTimers();
    const p = (id: number, name: string, category: string, code = '') => ({ id, name, code, barcode: '', costCents: 0, category });
    const load = jest.fn(async (q: string) => (q ? [p(2, 'Genie 2028 belt', 'Openers', '2028-7FT-BELT')] : [p(1, '.250 spring', 'Springs'), p(2, 'Genie 2028 belt', 'Openers', '2028-7FT-BELT')]));
    const onPick = jest.fn();
    const onNew = jest.fn();
    await render(<ProductPicker visible load={load} onPick={onPick} onNew={onNew} onClose={() => undefined} onTruck={new Set([1])} />);
    await act(async () => undefined);
    expect(screen.getByText('SPRINGS')).toBeTruthy();
    expect(screen.getByText('OPENERS')).toBeTruthy();
    expect(screen.getByText('on the truck')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('product-picker-search'), 'genie');
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(load).toHaveBeenLastCalledWith('genie');
    expect(screen.getByText('MATCHES')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('product-pick-2'));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 2, code: '2028-7FT-BELT' }));
    await fireEvent.press(screen.getByTestId('product-picker-new'));
    expect(onNew).toHaveBeenCalledWith('genie');
    jest.useRealTimers();
  });
});

describe('truck, job parts, wrap-up and scorecard screens', () => {
  const settle = async (n = 5) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };

  it('counts an item by typing its barcode, and a job takes parts off the truck', async () => {
    await AsyncStorage.clear();
    const job = createJob(MATCH, { customer: 'Ortega', address: '', phone: '', notes: '' }, { title: 'x' }, Date.now(), 'j1');
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([job]));
    await AsyncStorage.setItem(STOCK_STORAGE_KEY, JSON.stringify({ items: [item('rol', { name: 'Nylon rollers', barcode: '0123', onHand: 4, min: 1, par: 6 })], suppliers: [] }));
    await renderApp('/stock');
    await settle();
    await fireEvent.press(screen.getByTestId('stock-scan'));
    await fireEvent.changeText(screen.getByTestId('scanner-typed'), '0123');
    await fireEvent.press(screen.getByTestId('scanner-use'));
    expect(screen.getByTestId('count-sheet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('count-plus'));
    await fireEvent.press(screen.getByTestId('count-save'));
    expect(screen.getByTestId('stock-count-rol')).toHaveTextContent('5');

    // An unknown code (not signed in to Odoo) opens a new item with the barcode filled in.
    await fireEvent.press(screen.getByTestId('stock-scan'));
    await fireEvent.changeText(screen.getByTestId('scanner-typed'), '999');
    await fireEvent.press(screen.getByTestId('scanner-use'));
    expect(screen.getByTestId('stock-field-barcode').props.value).toBe('999');
    await fireEvent.press(screen.getByTestId('stock-sheet-cancel'));

    await renderApp('/job/j1');
    await settle();
    await fireEvent.press(screen.getByTestId('job-parts-pick'));
    await fireEvent.press(screen.getByTestId('truck-pick-rol'));
    expect(screen.getByTestId('job-parts')).toHaveTextContent(/1 x Nylon rollers/);
    await fireEvent.press(screen.getByTestId('job-parts-scan'));
    await fireEvent.changeText(screen.getByTestId('scanner-typed'), '0123');
    await fireEvent.press(screen.getByTestId('scanner-use'));
    await settle(3);
    const saved = parseStock(await AsyncStorage.getItem(STOCK_STORAGE_KEY));
    expect(saved.items[0].onHand).toBe(3);
    expect(saved.used?.map((u) => [u.jobId, u.qty])).toEqual([
      ['j1', 1],
      ['j1', 1],
    ]);
    await fireEvent.press(screen.getByTestId(`job-part-undo-${saved.used![0].id}`));
    await settle(3);
    expect(parseStock(await AsyncStorage.getItem(STOCK_STORAGE_KEY)).items[0].onHand).toBe(4);
    // Ordering a part that isn't on the truck needs Odoo.
    await fireEvent.press(screen.getByTestId('job-parts-order'));
    expect(screen.getByTestId('job-parts-note')).toHaveTextContent(/Sign in to Odoo/);
  });

  it('wraps up the day from Today and closes it', async () => {
    await AsyncStorage.clear();
    const app = await renderApp('/');
    await settle();
    await fireEvent.press(screen.getByTestId('today-wrap-up'));
    expect(app.getPathname()).toBe('/end-of-day');
    expect(screen.getByTestId('eod-jobs')).toHaveTextContent(/no jobs today/);
    expect(screen.getByTestId('eod-pending')).toHaveTextContent(/Everything is in Odoo/);
    await fireEvent.press(screen.getByTestId('eod-close'));
    await settle(3);
    expect(screen.getByTestId('eod-closed')).toHaveTextContent(/Day closed at/);
    expect(parseClosedDays(await AsyncStorage.getItem(DAY_CLOSE_STORAGE_KEY))).toHaveLength(1);
  });

  it("shows this phone's scorecard when not signed in to Odoo", async () => {
    await AsyncStorage.clear();
    const now = Date.now();
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([{ ...createJob(MATCH, { customer: 'A', address: '1 Elm', phone: '', notes: '' }, { title: '' }, now, 'a'), accepted: { tier: 'best', total: 1, at: now } }]));
    await renderApp('/tools');
    await settle();
    await fireEvent.press(screen.getByTestId('tools-scorecard'));
    await settle();
    expect(screen.getByTestId('scorecard')).toHaveTextContent(/This phone only/);
    expect(screen.getByTestId('score-You')).toHaveTextContent(/100%/);
  });
});
