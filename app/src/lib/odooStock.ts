/**
 * Truck stock in Odoo Inventory. The truck is an Inventory location (Truck 1);
 * what's on it is Odoo's stock on hand there (stock.quant). The phone keeps its
 * own counts so it works offline, and a sync sends Odoo only what changed on
 * the phone since the last one (as an inventory adjustment), then takes
 * Odoo's numbers back, so a receipt or count done in Odoo isn't lost.
 *
 * Reorder points come from Odoo's replenishment rules on the truck location
 * (stock.warehouse.orderpoint, min and max), suppliers from the product's
 * vendors (product.supplierinfo), and orders go to suppliers as purchase
 * orders (purchase.order) that Odoo emails. Kept free of React; the client is
 * passed in, so tests use a fake server.
 */
import type { OdooClient } from './odoo';
import { DEFAULT_TRUCK, guessCategory, StockItem, StockStore, Supplier, TruckLink } from './stock';

/** A product as truck stock needs it. */
export interface StockProduct {
  id: number;
  name: string;
  code: string;
  barcode: string;
  /** Odoo's cost, cents. */
  costCents: number;
  /** The first vendor on the product, if any. */
  vendor?: { id: number; name: string; code: string; priceCents: number };
}

/** One product on the truck in Odoo. */
export interface TruckLine extends StockProduct {
  qty: number;
  /** From a replenishment rule on the truck, if there is one. */
  min?: number;
  max?: number;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const many2one = (v: unknown): [number, string] | undefined => (Array.isArray(v) && typeof v[0] === 'number' ? [v[0], str(v[1])] : undefined);
const cents = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) : 0);
const INVENTORY = { inventory_mode: true };

/** Text for an exact, case-blind =ilike match: % and _ in it are taken literally, not as wildcards. */
export const likeExact = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Whether this Odoo has Inventory and this user can read stock. */
export async function hasInventory(client: OdooClient): Promise<boolean> {
  try {
    await client.call('stock.quant', 'fields_get', [], { attributes: ['type'] });
    return true;
  } catch {
    return false;
  }
}

/** The truck's location, by name ("Truck 1" or "WH/Truck 1"). */
export async function findTruck(client: OdooClient, name = DEFAULT_TRUCK): Promise<TruckLink | null> {
  const n = name.trim() || DEFAULT_TRUCK;
  const rows = (await client.call('stock.location', 'search_read', [[['usage', '=', 'internal'], '|', ['name', '=ilike', likeExact(n)], ['complete_name', '=ilike', likeExact(n)]]], { fields: ['name', 'complete_name'], limit: 1 })) as Record<string, unknown>[];
  const r = rows[0];
  return r ? { locationId: r.id as number, name: str(r.complete_name) || str(r.name), syncedAt: 0 } : null;
}

/** Product details and first vendor for these products. */
export async function readProducts(client: OdooClient, ids: number[]): Promise<StockProduct[]> {
  if (ids.length === 0) return [];
  const rows = (await client.call('product.product', 'read', [ids], { fields: ['name', 'default_code', 'barcode', 'standard_price', 'product_tmpl_id'] })) as Record<string, unknown>[];
  const tmplIds = [...new Set(rows.map((r) => many2one(r.product_tmpl_id)?.[0]).filter((x): x is number => !!x))];
  let sellers: Record<string, unknown>[] = [];
  if (tmplIds.length) {
    try {
      sellers = (await client.call('product.supplierinfo', 'search_read', [[['product_tmpl_id', 'in', tmplIds]]], { fields: ['partner_id', 'product_tmpl_id', 'product_id', 'product_code', 'price'], order: 'sequence asc, id asc' })) as Record<string, unknown>[];
    } catch {
      // Purchase isn't installed or this user can't see vendors: no supplier.
    }
  }
  return rows.map((r) => {
    const tmpl = many2one(r.product_tmpl_id)?.[0];
    const s = sellers.find((x) => many2one(x.product_id)?.[0] === r.id) ?? sellers.find((x) => many2one(x.product_tmpl_id)?.[0] === tmpl && !many2one(x.product_id));
    const partner = s ? many2one(s.partner_id) : undefined;
    return {
      id: r.id as number,
      name: str(r.name),
      code: str(r.default_code),
      barcode: str(r.barcode),
      costCents: cents(r.standard_price),
      ...(partner ? { vendor: { id: partner[0], name: partner[1], code: str(s!.product_code), priceCents: cents(s!.price) } } : {}),
    };
  });
}

/** What Odoo says is on the truck, with its reorder rules and vendors. */
export async function readTruck(client: OdooClient, locationId: number): Promise<TruckLine[]> {
  const quants = (await client.call('stock.quant', 'search_read', [[['location_id', 'child_of', locationId]]], { fields: ['product_id', 'quantity'] })) as Record<string, unknown>[];
  let rules: Record<string, unknown>[] = [];
  try {
    rules = (await client.call('stock.warehouse.orderpoint', 'search_read', [[['location_id', '=', locationId]]], { fields: ['product_id', 'product_min_qty', 'product_max_qty'] })) as Record<string, unknown>[];
  } catch {
    // No replenishment rules readable: the phone's own reorder numbers stay.
  }
  const qty = new Map<number, number>();
  for (const q of quants) {
    const p = many2one(q.product_id)?.[0];
    if (p) qty.set(p, (qty.get(p) ?? 0) + (typeof q.quantity === 'number' ? q.quantity : 0));
  }
  const rule = new Map<number, { min: number; max: number }>();
  for (const r of rules) {
    const p = many2one(r.product_id)?.[0];
    if (p) rule.set(p, { min: Number(r.product_min_qty) || 0, max: Number(r.product_max_qty) || 0 });
  }
  const ids = [...new Set([...qty.keys(), ...rule.keys()])];
  const products = await readProducts(client, ids);
  return products.map((p) => ({ ...p, qty: Math.max(0, Math.round(qty.get(p.id) ?? 0)), ...(rule.has(p.id) ? rule.get(p.id) : {}) }));
}

/** The product with this barcode or internal reference, for a scan. */
export async function findProductByCode(client: OdooClient, code: string): Promise<StockProduct | null> {
  const c = code.trim();
  if (!c) return null;
  const ids = (await client.call('product.product', 'search', [['|', ['barcode', '=', c], ['default_code', '=ilike', likeExact(c)]]], { limit: 1 })) as number[];
  if (!ids[0]) return null;
  return (await readProducts(client, [ids[0]]))[0] ?? null;
}

/** The product for an item that isn't linked yet: by barcode, part number, then exact name. */
async function matchProduct(client: OdooClient, i: StockItem): Promise<number | undefined> {
  const tries: unknown[][] = [];
  if (i.barcode) tries.push([['barcode', '=', i.barcode]]);
  if (i.sku) tries.push([['default_code', '=ilike', likeExact(i.sku)]]);
  tries.push([['name', '=ilike', likeExact(i.name)]]);
  for (const domain of tries) {
    const ids = (await client.call('product.product', 'search', [domain], { limit: 1 })) as number[];
    if (ids[0]) return ids[0];
  }
  return undefined;
}

/**
 * Sets how many of a product are on the truck, the way Odoo's Physical
 * Inventory does. The truck can hold a product in more than one quant (lots,
 * packages, shelves under the truck); only the difference is applied, added
 * to the first one or taken from them in turn, so the total comes out right.
 */
export async function setTruckQty(client: OdooClient, locationId: number, productId: number, qty: number): Promise<void> {
  const rows = (await client.call('stock.quant', 'search_read', [[['product_id', '=', productId], ['location_id', 'child_of', locationId]]], { fields: ['quantity', 'location_id'], context: INVENTORY })) as Record<string, unknown>[];
  const quants = rows
    .map((r) => ({ id: r.id as number, qty: typeof r.quantity === 'number' ? r.quantity : 0, here: many2one(r.location_id)?.[0] === locationId }))
    .sort((a, b) => Number(b.here) - Number(a.here) || a.id - b.id);
  let diff = qty - quants.reduce((n, q) => n + q.qty, 0);
  if (diff === 0) return;
  const set = async (id: number, to: number) => {
    await client.call('stock.quant', 'write', [[id], { inventory_quantity: to }], { context: INVENTORY });
    await client.call('stock.quant', 'action_apply_inventory', [[id]], { context: INVENTORY });
  };
  if (diff > 0) {
    if (quants[0]) return set(quants[0].id, quants[0].qty + diff);
    const id = (await client.call('stock.quant', 'create', [{ product_id: productId, location_id: locationId, inventory_quantity: qty }], { context: INVENTORY })) as number;
    await client.call('stock.quant', 'action_apply_inventory', [[id]], { context: INVENTORY });
    return;
  }
  for (const q of quants) {
    if (diff === 0) break;
    const take = Math.min(q.qty, -diff);
    if (take <= 0) continue;
    await set(q.id, q.qty - take);
    diff += take;
  }
}

/** A sync that stopped partway (lost signal): `store` has every count Odoo took before it stopped, so none is sent twice. */
export class PartialSyncError extends Error {
  constructor(
    message: string,
    readonly store: StockStore,
    readonly sent: number,
  ) {
    super(message);
  }
}

export interface SyncResult {
  store: StockStore;
  /** Counts the phone sent to Odoo. */
  sent: number;
  /** Items Odoo had that weren't on the phone yet. */
  added: number;
  /** Phone items linked to an Odoo product this time. */
  linked: number;
  /** Phone items with no Odoo product (they stay on the phone only). */
  phoneOnly: string[];
}

/**
 * Two-way truck sync. Phone changes go to Odoo as a difference on top of what
 * Odoo has now (so a receipt done in Odoo meanwhile still counts); then every
 * linked item takes Odoo's number. Products Odoo has on the truck that the
 * phone doesn't are added. An item linked for the first time sends the
 * phone's count when Odoo has none of it there.
 */
export async function syncTruck(client: OdooClient, store: StockStore, now: number, truckName = DEFAULT_TRUCK, newId: () => string = () => `i-${now.toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`): Promise<SyncResult> {
  const truck = store.truck ?? (await findTruck(client, truckName));
  if (!truck) throw new Error(`There's no Inventory location called "${truckName}" in Odoo. Make one in Inventory › Configuration › Locations.`);
  let lines = await readTruck(client, truck.locationId);
  const odoo = new Map(lines.map((l) => [l.id, l]));
  let sent = 0;
  let linked = 0;
  const phoneOnly: string[] = [];
  const items: StockItem[] = [];
  for (const item of store.items) {
    let i = item;
    if (i.odooId === undefined) {
      const pid = await matchProduct(client, i);
      if (!pid) {
        phoneOnly.push(i.name);
        items.push(i);
        continue;
      }
      i = { ...i, odooId: pid };
      linked++;
    }
    const have = odoo.get(i.odooId!)?.qty;
    let target: number | undefined;
    if (i.syncedOnHand === undefined) target = have === undefined || have === 0 ? i.onHand : undefined;
    else if (i.onHand !== i.syncedOnHand) target = Math.max(0, (have ?? 0) + i.onHand - i.syncedOnHand);
    if (target !== undefined && target !== (have ?? 0)) {
      try {
        await setTruckQty(client, truck.locationId, i.odooId!, target);
      } catch (e) {
        // Keep what Odoo already took: those items now match Odoo, the rest are untouched.
        const done = new Map(items.map((x) => [x.id, x]));
        const partial = store.items.map((x) => done.get(x.id) ?? x);
        const why = e instanceof Error ? e.message : String(e);
        throw new PartialSyncError(`The sync stopped after ${sent} count${sent === 1 ? '' : 's'}: ${why}`, { ...store, items: partial, truck }, sent);
      }
      sent++;
      i = { ...i, onHand: target, syncedOnHand: target };
    }
    items.push(i);
  }
  if (sent > 0) {
    lines = await readTruck(client, truck.locationId);
  } else {
    // Products linked this time that Odoo has nothing of on the truck still need their details.
    const missing = items.filter((i) => i.odooId !== undefined && !odoo.has(i.odooId)).map((i) => i.odooId!);
    if (missing.length) lines = [...lines, ...(await readProducts(client, missing)).map((p) => ({ ...p, qty: 0 }))];
  }
  const fresh = new Map(lines.map((l) => [l.id, l]));
  for (const i of items) if (i.odooId !== undefined && !fresh.has(i.odooId)) fresh.set(i.odooId, { id: i.odooId, name: i.name, code: i.sku, barcode: i.barcode ?? '', costCents: i.costCents, qty: 0 });

  const suppliers: Supplier[] = [...store.suppliers];
  const vendorName = (v: NonNullable<StockProduct['vendor']>) => {
    const at = suppliers.findIndex((s) => s.odooId === v.id || s.name.trim().toLowerCase() === v.name.trim().toLowerCase());
    if (at < 0) suppliers.push({ name: v.name, phone: '', email: '', odooId: v.id });
    else if (!suppliers[at].odooId) suppliers[at] = { ...suppliers[at], odooId: v.id };
    return at < 0 ? v.name : suppliers[at].name;
  };

  const out = items.map((i): StockItem => {
    const l = i.odooId !== undefined ? fresh.get(i.odooId) : undefined;
    if (!l) return i;
    return {
      ...i,
      onHand: l.qty,
      syncedOnHand: l.qty,
      ...(l.code ? { sku: l.code } : {}),
      ...(l.barcode ? { barcode: l.barcode } : {}),
      ...(l.costCents > 0 ? { costCents: l.costCents } : l.vendor && l.vendor.priceCents > 0 ? { costCents: l.vendor.priceCents } : {}),
      ...(l.min !== undefined && l.max !== undefined ? { min: Math.round(l.min), par: Math.round(l.max) } : {}),
      ...(l.vendor ? { supplier: vendorName(l.vendor) } : {}),
      updatedAt: now,
    };
  });
  const known = new Set(out.map((i) => i.odooId).filter((x) => x !== undefined));
  let added = 0;
  for (const l of lines) {
    if (known.has(l.id) || (l.qty <= 0 && l.min === undefined)) continue;
    added++;
    out.push({
      id: newId(),
      name: l.name,
      sku: l.code,
      category: guessCategory(l.name),
      onHand: l.qty,
      syncedOnHand: l.qty,
      min: l.min !== undefined ? Math.round(l.min) : 1,
      par: l.max !== undefined ? Math.round(l.max) : Math.max(2, l.qty),
      supplier: l.vendor ? vendorName(l.vendor) : '',
      costCents: l.costCents || l.vendor?.priceCents || 0,
      ...(l.barcode ? { barcode: l.barcode } : {}),
      odooId: l.id,
      updatedAt: now,
    });
  }
  return { store: { ...store, items: out, suppliers, truck: { ...truck, syncedAt: now } }, sent, added, linked, phoneOnly };
}

/** The supplier's contact in Odoo: the one linked, else one by that name, else a new vendor. */
export async function vendorFor(client: OdooClient, s: Supplier): Promise<number> {
  if (s.odooId) return s.odooId;
  const found = (await client.call('res.partner', 'search', [[['name', '=ilike', s.name.trim()]]], { limit: 1 })) as number[];
  if (found[0]) return found[0];
  return (await client.call('res.partner', 'create', [{ name: s.name.trim(), email: s.email || false, phone: s.phone || false, supplier_rank: 1 }])) as number;
}

export interface SentPurchase {
  odooId: number;
  name: string;
  vendorId: number;
  emailed: boolean;
}

/**
 * Makes a purchase order for the supplier, confirms it, points its receipt
 * at the truck when it can, and has Odoo email it (the "Send PO by email"
 * button). If the email can't go, the order is still made; the phone can
 * text or email it instead.
 */
export async function sendPurchaseOrder(client: OdooClient, supplier: Supplier, lines: { productId: number; name: string; qty: number; priceCents: number }[], truck?: TruckLink, ref = ''): Promise<SentPurchase> {
  if (lines.length === 0) throw new Error('Nothing on this order is linked to an Odoo product yet. Sync the truck first.');
  const vendorId = await vendorFor(client, supplier);
  const order_line = lines.map((l) => [0, 0, { product_id: l.productId, name: l.name, product_qty: l.qty, ...(l.priceCents > 0 ? { price_unit: l.priceCents / 100 } : {}) }]);
  const id = (await client.call('purchase.order', 'create', [{ partner_id: vendorId, origin: ref || false, order_line }])) as number;
  await client.call('purchase.order', 'button_confirm', [[id]]);
  const [row] = (await client.call('purchase.order', 'read', [[id]], { fields: ['name', 'picking_ids'] })) as { name?: string; picking_ids?: number[] }[];
  if (truck && row?.picking_ids?.length) {
    try {
      await client.call('stock.picking', 'write', [row.picking_ids, { location_dest_id: truck.locationId }]);
    } catch {
      // The receipt stays at the warehouse; it can be moved to the truck in Odoo.
    }
  }
  let emailed = false;
  try {
    const action = (await client.call('purchase.order', 'action_rfq_send', [[id]])) as { context?: Record<string, unknown> } | null;
    const context = action?.context ?? {};
    const wizard = (await client.call('mail.compose.message', 'create', [{}], { context })) as number;
    await client.call('mail.compose.message', 'action_send_mail', [[wizard]], { context });
    emailed = true;
  } catch {
    // Odoo couldn't email it (no email on the vendor, or outgoing mail isn't set up).
  }
  return { odooId: id, name: row?.name ?? `#${id}`, vendorId, emailed };
}

/**
 * Marks the order's receipt done in Odoo (the Validate button), so the parts
 * land on the truck there. False when Odoo wants a person to finish it
 * (a backorder question), which is then done in Odoo.
 */
export async function receivePurchaseOrder(client: OdooClient, purchaseId: number): Promise<boolean> {
  const [row] = (await client.call('purchase.order', 'read', [[purchaseId]], { fields: ['picking_ids'] })) as { picking_ids?: number[] }[];
  const ids = row?.picking_ids ?? [];
  if (ids.length === 0) return false;
  const pickings = (await client.call('stock.picking', 'read', [ids], { fields: ['state'] })) as { id: number; state?: string }[];
  let ok = true;
  for (const p of pickings) {
    if (p.state === 'done' || p.state === 'cancel') continue;
    const r = await client.call('stock.picking', 'button_validate', [[p.id]]);
    if (r && typeof r === 'object') ok = false;
  }
  return ok;
}
