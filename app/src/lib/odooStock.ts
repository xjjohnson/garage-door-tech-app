/**
 * Truck stock in Odoo Inventory. Each tech's truck is an Inventory location
 * ("Truck - <tech name>", found by the signed-in user's name, Truck 1 if
 * none, or picked by hand);
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
import { OdooClient, OdooError } from './odoo';
import { DEFAULT_TRUCK, guessCategory, STARTER_ITEMS, StockItem, StockStore, Supplier, switchTruck, TruckLink } from './stock';

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
  /** Odoo's product category, last part only ("Openers" for "All / Openers"). */
  category?: string;
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

/** Inventory locations a truck could be: ones with "truck" in the name, else every internal one. */
export async function listTrucks(client: OdooClient): Promise<TruckLink[]> {
  const read = async (domain: unknown[]) => (await client.call('stock.location', 'search_read', [domain], { fields: ['name', 'complete_name'], order: 'complete_name asc', limit: 200 })) as Record<string, unknown>[];
  let rows = await read([['usage', '=', 'internal'], ['name', 'ilike', 'truck']]);
  if (rows.length === 0) rows = await read([['usage', '=', 'internal']]);
  return rows.map((r) => ({ locationId: r.id as number, name: str(r.complete_name) || str(r.name), syncedAt: 0 }));
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Each tech has their own truck: the location whose name has the tech's
 * name in it ("Truck - Justin Johnson", "Justin's truck", "Truck Justin"),
 * full name first, then first name; else "Truck 1"; else the only truck
 * there is. Null when none fits, and the tech picks one.
 */
export function truckFor(trucks: TruckLink[], userName: string): TruckLink | null {
  const full = words(userName);
  const first = full.split(' ')[0] ?? '';
  const has = (t: TruckLink, w: string) => w.length >= 3 && ` ${words(t.name)} `.replace(/ s /g, ' ').includes(` ${w} `);
  const named = (w: string) => trucks.filter((t) => has(t, w));
  const byFull = named(full);
  if (byFull.length === 1) return byFull[0];
  const byFirst = named(first);
  if (byFirst.length === 1) return byFirst[0];
  const fallback = trucks.find((t) => words(t.name).endsWith(words(DEFAULT_TRUCK)));
  if (fallback) return fallback;
  return trucks.length === 1 ? trucks[0] : null;
}

/** The signed-in tech's truck in Odoo, or null with the choices when it can't tell. */
export async function myTruck(client: OdooClient): Promise<TruckLink | null> {
  const t = truckFor(await listTrucks(client), client.session.name);
  return t ? { ...t, uid: client.session.uid } : null;
}

/** Product details and first vendor for these products. */
export async function readProducts(client: OdooClient, ids: number[]): Promise<StockProduct[]> {
  if (ids.length === 0) return [];
  const rows = (await client.call('product.product', 'read', [ids], { fields: ['name', 'default_code', 'barcode', 'standard_price', 'product_tmpl_id', 'categ_id'] })) as Record<string, unknown>[];
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
    const categ = many2one(r.categ_id)?.[1];
    return {
      id: r.id as number,
      name: str(r.name),
      code: str(r.default_code),
      barcode: str(r.barcode),
      costCents: cents(r.standard_price),
      ...(categ ? { category: String(categ).split('/').pop()!.trim() } : {}),
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

/**
 * Sets the truck's replenishment rule for a product (stock.warehouse.orderpoint):
 * changes the one there, or makes it. A new rule is set to manual, so Odoo
 * only suggests the order and never buys on its own.
 */
export async function writeOrderpoint(client: OdooClient, locationId: number, productId: number, min: number, max: number): Promise<void> {
  const vals = { product_min_qty: min, product_max_qty: max };
  const [existing] = (await client.call('stock.warehouse.orderpoint', 'search', [[['product_id', '=', productId], ['location_id', '=', locationId]]], { limit: 1 })) as number[];
  if (existing) {
    await client.call('stock.warehouse.orderpoint', 'write', [[existing], vals]);
    return;
  }
  const fields = (await client.call('stock.warehouse.orderpoint', 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;
  await client.call('stock.warehouse.orderpoint', 'create', [{ product_id: productId, location_id: locationId, ...vals, ...('trigger' in fields ? { trigger: 'manual' } : {}) }]);
}

/**
 * Makes the supplier one of the product's vendors (product.supplierinfo), first
 * in line, unless they already are. The vendor contact is found or made.
 * Returns the contact's id.
 */
export async function writeSupplierInfo(client: OdooClient, supplier: Supplier, productId: number, priceCents: number): Promise<number> {
  const partner = await vendorFor(client, supplier);
  const [row] = (await client.call('product.product', 'read', [[productId]], { fields: ['product_tmpl_id'] })) as Record<string, unknown>[];
  const tmpl = many2one(row?.product_tmpl_id)?.[0];
  if (!tmpl) return partner;
  const [has] = (await client.call('product.supplierinfo', 'search', [[['product_tmpl_id', '=', tmpl], ['partner_id', '=', partner]]], { limit: 1 })) as number[];
  if (!has) await client.call('product.supplierinfo', 'create', [{ partner_id: partner, product_tmpl_id: tmpl, sequence: 0, ...(priceCents > 0 ? { price: priceCents / 100 } : {}) }]);
  return partner;
}

/** The product with this barcode or internal reference, for a scan. */
export async function findProductByCode(client: OdooClient, code: string): Promise<StockProduct | null> {
  const c = code.trim();
  if (!c) return null;
  const ids = (await client.call('product.product', 'search', [['|', ['barcode', '=', c], ['default_code', '=ilike', likeExact(c)]]], { limit: 1 })) as number[];
  if (!ids[0]) return null;
  return (await readProducts(client, [ids[0]]))[0] ?? null;
}

/** Products by name, internal reference or barcode, for adding a part. */
export async function searchProducts(client: OdooClient, q: string, limit = 20): Promise<StockProduct[]> {
  const t = q.trim();
  if (!t) return [];
  return findProducts(client, t, limit);
}

/**
 * The products to pick from when adding a part to the truck: those matching
 * what's typed (name, internal reference or barcode), or with nothing typed,
 * Odoo's goods (not services) by category and name to scroll through.
 */
export async function browseProducts(client: OdooClient, q: string, limit = 80): Promise<StockProduct[]> {
  const t = q.trim();
  if (t) return findProducts(client, t, limit);
  const ids = (await client.call('product.product', 'search', [[['type', '!=', 'service']]], { limit, order: 'categ_id asc, name asc' })) as number[];
  return readProducts(client, ids);
}

/** Goods matching what's typed; services (labor, trip charges) can't go on a truck. */
async function findProducts(client: OdooClient, t: string, limit: number): Promise<StockProduct[]> {
  const ids = (await client.call('product.product', 'search', [[['type', '!=', 'service'], '|', '|', ['name', 'ilike', t], ['default_code', 'ilike', t], ['barcode', '=', t]]], { limit, order: 'name asc' })) as number[];
  return readProducts(client, ids);
}

/**
 * Makes a new stocked product in Odoo for a part added on the phone. Odoo 18
 * and later mark it "Track inventory" (is_storable); older ones use the
 * Storable product type. Returns the product.product id.
 */
export async function createProduct(client: OdooClient, p: { name: string; sku?: string; barcode?: string; costCents?: number }): Promise<number> {
  const f = (await client.call('product.template', 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;
  const stocked = 'is_storable' in f ? { type: 'consu', is_storable: true } : { type: 'product' };
  return (await client.call('product.product', 'create', [
    { name: p.name.trim(), default_code: p.sku?.trim() || false, barcode: p.barcode?.trim() || false, ...(p.costCents ? { standard_price: p.costCents / 100 } : {}), sale_ok: true, purchase_ok: true, ...stocked },
  ])) as number;
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
/** A product Odoo doesn't track stock for (a consumable or a service), so it can't be counted on the truck. */
export class UntrackedError extends Error {
  constructor(readonly product: string) {
    super(`${product} isn't tracked in Odoo. In Odoo open the product and tick Track Inventory, then sync.`);
  }
}

/**
 * Checks that Odoo keeps stock of a product, so it can sit on the truck:
 * "Track inventory" (is_storable) on Odoo 18 and later, a Storable product on
 * older ones. The app doesn't change the product; the owner ticks it in Odoo.
 */
export async function ensureTracked(client: OdooClient, productId: number): Promise<void> {
  const [p] = (await client.call('product.product', 'read', [[productId]], { fields: ['product_tmpl_id', 'display_name'] })) as Record<string, unknown>[];
  const tmpl = many2one(p?.product_tmpl_id)?.[0];
  const name = String(p?.display_name || many2one(p?.product_tmpl_id)?.[1] || 'This part');
  if (!tmpl) throw new UntrackedError(name);
  const f = (await client.call('product.template', 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;
  const storable = 'is_storable' in f;
  const [t] = (await client.call('product.template', 'read', [[tmpl]], { fields: storable ? ['type', 'is_storable'] : ['type'] })) as Record<string, unknown>[];
  if (storable ? t?.is_storable === true : t?.type === 'product') return;
  throw new UntrackedError(name);
}

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
    // Odoo makes no quant for a consumable: say which part needs Track Inventory, instead of Odoo's error.
    await ensureTracked(client, productId);
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

/** No Inventory location is this tech's truck yet. */
export class NoTruckError extends Error {
  constructor(readonly tech: string) {
    super(`No truck in Odoo is yours yet. Make an Inventory location called "Truck - ${tech || 'your name'}" (Inventory › Configuration › Locations), or pick one with Change truck.`);
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
  /** Sample items with no Odoo product, and second items for one product, taken off the list: Odoo is the truck's record. */
  removed: string[];
  /** Parts typed in on the phone that Odoo didn't have: made there as new products. */
  created: string[];
  /** Items Odoo wouldn't take this time, with why. They keep the phone's count and are tried again at the next sync. */
  problems: { name: string; why: string }[];
}

/** Odoo said no to this one item (not a lost connection), so the rest of the sync can go on. */
const itemProblem = (e: unknown) => e instanceof UntrackedError || (e instanceof OdooError && e.kind === 'server');

const SAMPLE_NAMES = new Set(STARTER_ITEMS.map((s) => s.name.toLowerCase()));
/** Still one of the "Add common items" samples, untouched apart from the count. */
const isSample = (i: StockItem) => SAMPLE_NAMES.has(i.name.trim().toLowerCase()) && !i.sku.trim() && !i.barcode && !i.supplier.trim();

/**
 * Two-way truck sync, with Odoo as the record of what's on the truck. Phone
 * changes (parts used, counts, new items) go to Odoo as a difference on top
 * of what Odoo has now, so a receipt done in Odoo meanwhile still counts;
 * then every item takes Odoo's number. Products Odoo has on the truck that
 * the phone doesn't are added. A phone item that matches an Odoo product for
 * the first time takes Odoo's count (nothing is sent). A sample item with
 * no Odoo product is taken off the list; a part the tech typed in that Odoo
 * doesn't have is made there, and its count sent. Two phone items for one
 * product become one, keeping both items' unsent changes.
 */
export async function syncTruck(client: OdooClient, given: StockStore, now: number, newId: () => string = () => `i-${now.toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`): Promise<SyncResult> {
  let store = given;
  // The saved truck is this tech's; another tech signed in on the phone gets theirs.
  if (!store.truck || (store.truck.uid !== undefined && store.truck.uid !== client.session.uid)) {
    const mine = await myTruck(client);
    if (!mine) throw new NoTruckError(client.session.name);
    store = store.truck ? switchTruck(store, mine, now) : { ...store, truck: mine };
  }
  const truck = store.truck!;
  let lines = await readTruck(client, truck.locationId);
  const odoo = new Map(lines.map((l) => [l.id, l]));
  let sent = 0;
  let linked = 0;
  const removed: string[] = [];
  const created: string[] = [];
  const problems: { name: string; why: string }[] = [];
  /** Items left as they are this time: Odoo refused them. */
  const held = new Set<string>();
  const heldUnlinked: StockItem[] = [];
  // Link every phone item to its Odoo product first.
  const linkedItems: StockItem[] = [];
  for (const item of store.items) {
    let i = item;
    if (i.odooId === undefined) {
      const pid = await matchProduct(client, i);
      if (pid) {
        i = { ...i, odooId: pid };
        linked++;
      } else if (isSample(i)) {
        removed.push(i.name);
        continue;
      } else {
        // Typed in on the phone (signed out, or Odoo was unreachable): make it in Odoo, and its count goes up as new stock.
        let id: number;
        try {
          id = await createProduct(client, { name: i.name, sku: i.sku, barcode: i.barcode, costCents: i.costCents });
        } catch (e) {
          if (!itemProblem(e)) throw e;
          problems.push({ name: i.name, why: e instanceof Error ? e.message : String(e) });
          heldUnlinked.push(i);
          continue;
        }
        i = { ...i, odooId: id, syncedOnHand: 0 };
        created.push(i.name);
      }
    }
    linkedItems.push(i);
  }
  // Two phone items for one Odoo product would show two counts: keep the first, with the other's unsent change folded in.
  const merged: StockItem[] = [];
  for (const i of linkedItems) {
    const at = merged.findIndex((x) => x.odooId === i.odooId);
    if (at < 0) {
      merged.push(i);
      continue;
    }
    removed.push(i.name);
    const delta = i.syncedOnHand !== undefined ? i.onHand - i.syncedOnHand : 0;
    if (!delta) continue;
    const k = merged[at];
    const base = k.syncedOnHand ?? odoo.get(k.odooId!)?.qty ?? 0;
    const kOnHand = k.syncedOnHand === undefined ? base : k.onHand;
    merged[at] = { ...k, syncedOnHand: base, onHand: Math.max(0, kOnHand + delta) };
  }
  const items: StockItem[] = [];
  for (const item of merged) {
    let i = item;
    const have = odoo.get(i.odooId!)?.qty;
    let target: number | undefined;
    if (i.syncedOnHand !== undefined && i.onHand !== i.syncedOnHand) target = Math.max(0, (have ?? 0) + i.onHand - i.syncedOnHand);
    if (target !== undefined && target !== (have ?? 0)) {
      try {
        await setTruckQty(client, truck.locationId, i.odooId!, target);
      } catch (e) {
        if (itemProblem(e)) {
          // Just this item: it keeps the phone's count and goes again next time; the rest carry on.
          problems.push({ name: i.name, why: e instanceof UntrackedError ? e.message : `${i.name}: ${e instanceof Error ? e.message : String(e)}` });
          held.add(i.id);
          items.push(i);
          continue;
        }
        // Keep what Odoo already took: those items now match Odoo, the rest are untouched.
        const done = new Map(items.map((x) => [x.id, x]));
        // Linked, made and merged items keep that, so nothing is made or sent twice.
        const partial = [...merged.map((x) => done.get(x.id) ?? x), ...heldUnlinked];
        const why = e instanceof Error ? e.message : String(e);
        throw new PartialSyncError(`The sync stopped after ${sent} count${sent === 1 ? '' : 's'}: ${why}`, { ...store, items: partial, truck }, sent);
      }
      sent++;
      i = { ...i, onHand: target, syncedOnHand: target };
    }
    items.push(i);
  }
  // Reorder numbers and suppliers changed on the phone since Odoo last had them. Items from before this was
  // tracked (no synced value) are taken as matching, so nothing old is written to Odoo.
  const suppliers: Supplier[] = [...store.suppliers];
  const heldRule = new Set<string>();
  const heldSupplier = new Set<string>();
  for (const i of items) {
    if (i.odooId === undefined || held.has(i.id)) continue;
    if (i.syncedMin !== undefined && i.syncedPar !== undefined && (i.min !== i.syncedMin || i.par !== i.syncedPar)) {
      try {
        await writeOrderpoint(client, truck.locationId, i.odooId, i.min, i.par);
        sent++;
      } catch (e) {
        heldRule.add(i.id);
        problems.push({ name: i.name, why: `reorder numbers: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
    const want = i.supplier.trim();
    if (i.syncedSupplier !== undefined && want && want.toLowerCase() !== i.syncedSupplier.trim().toLowerCase()) {
      try {
        let at = suppliers.findIndex((x) => x.name.trim().toLowerCase() === want.toLowerCase());
        if (at < 0) at = suppliers.push({ name: want, phone: '', email: '' }) - 1;
        const partner = await writeSupplierInfo(client, suppliers[at], i.odooId, i.costCents);
        suppliers[at] = { ...suppliers[at], odooId: partner };
        sent++;
      } catch (e) {
        heldSupplier.add(i.id);
        problems.push({ name: i.name, why: `supplier: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
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

  const vendorName = (v: NonNullable<StockProduct['vendor']>) => {
    const at = suppliers.findIndex((s) => s.odooId === v.id || s.name.trim().toLowerCase() === v.name.trim().toLowerCase());
    if (at < 0) suppliers.push({ name: v.name, phone: '', email: '', odooId: v.id });
    else if (!suppliers[at].odooId) suppliers[at] = { ...suppliers[at], odooId: v.id };
    return at < 0 ? v.name : suppliers[at].name;
  };

  const out = items.map((i): StockItem => {
    const l = i.odooId !== undefined ? fresh.get(i.odooId) : undefined;
    if (!l) return i;
    if (held.has(i.id)) return { ...i, syncedOnHand: i.syncedOnHand ?? 0 };
    return {
      ...i,
      onHand: l.qty,
      syncedOnHand: l.qty,
      ...(l.code ? { sku: l.code } : {}),
      ...(l.barcode ? { barcode: l.barcode } : {}),
      ...(l.costCents > 0 ? { costCents: l.costCents } : l.vendor && l.vendor.priceCents > 0 ? { costCents: l.vendor.priceCents } : {}),
      ...(l.min !== undefined && l.max !== undefined && !heldRule.has(i.id) ? { min: Math.round(l.min), par: Math.round(l.max) } : {}),
      ...(l.vendor && !heldSupplier.has(i.id) ? { supplier: vendorName(l.vendor) } : {}),
      updatedAt: now,
    };
  }).map((i): StockItem => {
    if (i.odooId === undefined || !fresh.has(i.odooId) || held.has(i.id)) return i;
    // What Odoo has now counts as sent; an item Odoo refused keeps its old value, so the change goes again next time.
    return {
      ...i,
      ...(heldRule.has(i.id) ? {} : { syncedMin: i.min, syncedPar: i.par }),
      ...(heldSupplier.has(i.id) ? {} : { syncedSupplier: i.supplier }),
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
  return { store: { ...store, items: [...out, ...heldUnlinked], suppliers, truck: { ...truck, syncedAt: now } }, sent, added, linked, removed, created, problems };
}

/** The supplier's contact in Odoo: the one linked, else one by that name, else a new vendor. */
export async function vendorFor(client: OdooClient, s: Supplier): Promise<number> {
  if (s.odooId) return s.odooId;
  const found = (await client.call('res.partner', 'search', [[['name', '=ilike', s.name.trim()]]], { limit: 1 })) as number[];
  if (found[0]) return found[0];
  return (await client.call('res.partner', 'create', [{ name: s.name.trim(), email: s.email || false, phone: s.phone || false, supplier_rank: 1 }])) as number;
}

export interface DraftPurchase {
  odooId: number;
  name: string;
  vendorId: number;
  /** True when lines were added to a draft for this vendor that already existed. */
  reused: boolean;
}

/**
 * Makes a DRAFT purchase order (a request for quotation) for the supplier. It
 * is never confirmed or emailed: the owner reviews and confirms it in Odoo.
 * If a draft for the same vendor and source (the truck) is still open, products
 * that aren't on it yet are added to it instead of making a second one.
 */
export async function createPurchaseDraft(client: OdooClient, supplier: Supplier, lines: { productId: number; name: string; qty: number; priceCents: number }[], ref = ''): Promise<DraftPurchase> {
  if (lines.length === 0) throw new Error('Nothing on this order is linked to an Odoo product yet. Sync the truck first.');
  const vendorId = await vendorFor(client, supplier);
  const make = (l: { productId: number; name: string; qty: number; priceCents: number }) => [0, 0, { product_id: l.productId, name: l.name, product_qty: l.qty, ...(l.priceCents > 0 ? { price_unit: l.priceCents / 100 } : {}) }];
  const [existing] = (await client.call('purchase.order', 'search', [[['partner_id', '=', vendorId], ['state', '=', 'draft'], ['origin', '=', ref || false]]], { limit: 1, order: 'id desc' })) as number[];
  if (existing) {
    const [row] = (await client.call('purchase.order', 'read', [[existing]], { fields: ['name', 'order_line'] })) as { name?: string; order_line?: number[] }[];
    const have = row?.order_line?.length ? ((await client.call('purchase.order.line', 'read', [row.order_line], { fields: ['product_id'] })) as { product_id?: [number, string] | false }[]) : [];
    const on = new Set(have.map((h) => (h.product_id ? h.product_id[0] : 0)));
    const add = lines.filter((l) => !on.has(l.productId));
    if (add.length) await client.call('purchase.order', 'write', [[existing], { order_line: add.map(make) }]);
    return { odooId: existing, name: row?.name ?? `#${existing}`, vendorId, reused: true };
  }
  const id = (await client.call('purchase.order', 'create', [{ partner_id: vendorId, origin: ref || false, order_line: lines.map(make) }])) as number;
  const [row] = (await client.call('purchase.order', 'read', [[id]], { fields: ['name'] })) as { name?: string }[];
  return { odooId: id, name: row?.name ?? `#${id}`, vendorId, reused: false };
}

/** Where purchase orders are in Odoo ('draft', 'sent', 'purchase', 'done', 'cancel'). Ones Odoo no longer has are left out. */
export async function purchaseStates(client: OdooClient, ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (ids.length === 0) return out;
  // search_read, since reading an id Odoo has deleted raises an error.
  const rows = (await client.call('purchase.order', 'search_read', [[['id', 'in', ids]]], { fields: ['state'] })) as { id: number; state?: string }[];
  for (const r of rows) if (r.state) out.set(r.id, r.state);
  return out;
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
  // `ref` goes in the order's Source (origin): the truck, and for a job's part "Pickup" or "Delivery" and the job.
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
export async function receivePurchaseOrder(client: OdooClient, purchaseId: number, truckLocationId?: number): Promise<boolean> {
  const [row] = (await client.call('purchase.order', 'read', [[purchaseId]], { fields: ['picking_ids'] })) as { picking_ids?: number[] }[];
  const ids = row?.picking_ids ?? [];
  if (ids.length === 0) return false;
  const pickings = (await client.call('stock.picking', 'read', [ids], { fields: ['state'] })) as { id: number; state?: string }[];
  let ok = true;
  for (const p of pickings) {
    if (p.state === 'done' || p.state === 'cancel') continue;
    // An order confirmed in Odoo by hand has its receipt at the warehouse: point it at the truck first.
    if (truckLocationId) await client.call('stock.picking', 'write', [[p.id], { location_dest_id: truckLocationId }]).catch(() => undefined);
    const r = await client.call('stock.picking', 'button_validate', [[p.id]]);
    if (r && typeof r === 'object') ok = false;
  }
  return ok;
}

/**
 * Notes the parts used on a job in the job's order (its chatter), so Odoo
 * shows what came off the truck for it. One note per call.
 */
export async function postPartsUsed(client: OdooClient, ref: { model: string; id: number }, uses: { name: string; qty: number }[]): Promise<void> {
  const body = `Parts used from the truck (from the app): ${uses.map((u) => `${u.qty} × ${u.name}`).join(', ')}`;
  await client.call(ref.model, 'message_post', [[ref.id]], { body, message_type: 'comment', subtype_xmlid: 'mail.mt_note' });
}
