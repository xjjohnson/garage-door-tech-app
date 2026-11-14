/**
 * Truck stock: what's on the truck, when to reorder, and an order to send each
 * supplier. Kept free of React so it can be tested directly. An item keeps
 * what an inventory system keeps for a product (name, part number, on hand,
 * reorder point, cost, vendor), so a later Odoo sync can map it.
 */
import { emailLink } from './customers';
import { textLink } from './followups';

export const STOCK_STORAGE_KEY = 'stock/v1';

export type StockCategory = 'springs' | 'parts' | 'openers' | 'other';
export const STOCK_CATEGORIES: StockCategory[] = ['springs', 'parts', 'openers', 'other'];
export const CATEGORY_LABEL: Record<StockCategory, string> = { springs: 'Springs', parts: 'Parts', openers: 'Openers and remotes', other: 'Other' };

export interface StockItem {
  id: string;
  name: string;
  /** The supplier's part number, if known. */
  sku: string;
  category: StockCategory;
  onHand: number;
  /** Reorder when on hand falls to this. */
  min: number;
  /** Order back up to this. */
  par: number;
  supplier: string;
  /** What one costs, in cents; 0 when not entered. */
  costCents: number;
  updatedAt: number;
  /** The product's barcode (Odoo's Barcode field), for scanning. */
  barcode?: string;
  /** The Odoo product (product.product) this item is, once linked. */
  odooId?: number;
  /** On hand as Odoo last had it for the truck, so a sync sends only what changed on the phone since. */
  syncedOnHand?: number;
  /** Reorder point and fill-to as Odoo's replenishment rule last had them; a different min or par on the phone is sent. Unset on items from before this was kept: they're taken as matching, so nothing old is written to Odoo. */
  syncedMin?: number;
  syncedPar?: number;
  /** The supplier as Odoo last had it on the product; a different one on the phone is added to the product's vendors. */
  syncedSupplier?: string;
}

export interface Supplier {
  name: string;
  phone: string;
  email: string;
  /** The vendor's contact (res.partner) in Odoo. */
  odooId?: number;
}

/** A part taken off the truck for a job. */
export interface PartUse {
  id: string;
  itemId: string;
  /** What it was called then, so the list reads right if the item is renamed or removed. */
  name: string;
  qty: number;
  jobId?: string;
  at: number;
  /** How many actually came off the truck count, when it had fewer than `qty` (so undo doesn't add more than was taken). */
  off?: number;
  /** When the use was noted on the job's order in Odoo. */
  sentAt?: number;
}

/** A purchase order sent to a supplier through Odoo. */
export interface PurchaseOrder {
  id: string;
  supplier: string;
  /** Odoo's purchase.order id and number ("P00012"). */
  odooId: number;
  name: string;
  lines: { itemId: string; qty: number }[];
  at: number;
  /** Whether Odoo emailed it to the supplier. */
  emailed: boolean;
  /** Still a draft in Odoo: not confirmed yet, so nothing is on its way. Confirmed by a person in Odoo. */
  draft?: boolean;
  receivedAt?: number;
  /** A part ordered for a job (not truck restock): it goes on that job when it comes in. */
  jobId?: string;
  /** Picked up at the supplier's counter rather than delivered. */
  pickup?: boolean;
}

/** The truck's Inventory location in Odoo. */
export interface TruckLink {
  locationId: number;
  name: string;
  syncedAt: number;
  /** The Odoo user this truck is for; another user signing in on the phone gets their own truck. */
  uid?: number;
  /** True when the tech picked it by hand (not matched by name). */
  chosen?: boolean;
}

export interface StockStore {
  items: StockItem[];
  suppliers: Supplier[];
  /** Parts used on jobs, newest last. */
  used?: PartUse[];
  purchases?: PurchaseOrder[];
  truck?: TruckLink;
}

/** The Inventory location used when none is named for the tech. */
export const DEFAULT_TRUCK = 'Truck 1';

/**
 * Moves the phone to another truck's location. Linked items start from 0 as
 * if Odoo had none (so nothing on the phone is sent to the new truck), and
 * the next sync brings in what Odoo has there. Phone-only items are kept.
 */
export function switchTruck(store: StockStore, truck: TruckLink, now: number): StockStore {
  return { ...store, truck: { ...truck, syncedAt: 0 }, items: store.items.map((i) => (i.odooId !== undefined ? { ...i, onHand: 0, syncedOnHand: 0, syncedMin: undefined, syncedPar: undefined, updatedAt: now } : i)) };
}

export const EMPTY_STOCK: StockStore = { items: [], suppliers: [] };

/** A starting list for a torsion spring truck; counts start at 0 for the tech to fill in. */
export const STARTER_ITEMS: Pick<StockItem, 'name' | 'category' | 'min' | 'par'>[] = [
  { name: '.243 x 1¾" x 30" torsion spring', category: 'springs', min: 2, par: 4 },
  { name: '.250 x 2" x 30" torsion spring', category: 'springs', min: 2, par: 4 },
  { name: '.262 x 2" x 32" torsion spring', category: 'springs', min: 2, par: 4 },
  { name: '.273 x 2" x 34" torsion spring', category: 'springs', min: 1, par: 2 },
  { name: 'Nylon rollers (10)', category: 'parts', min: 2, par: 4 },
  { name: 'Lift cables, 7 ft door (pair)', category: 'parts', min: 2, par: 4 },
  { name: 'Lift cables, 8 ft door (pair)', category: 'parts', min: 1, par: 2 },
  { name: 'Drums, residential (pair)', category: 'parts', min: 1, par: 2 },
  { name: 'Center bearing', category: 'parts', min: 1, par: 3 },
  { name: 'End bearings (pair)', category: 'parts', min: 1, par: 2 },
  { name: 'Bottom seal, 16 ft', category: 'parts', min: 1, par: 2 },
  { name: 'Hinges, #1', category: 'parts', min: 4, par: 10 },
  { name: 'Universal remote', category: 'openers', min: 2, par: 5 },
  { name: 'Safety sensors (pair)', category: 'openers', min: 1, par: 2 },
  { name: 'Wall button', category: 'openers', min: 1, par: 3 },
];

export function isLow(i: StockItem): boolean {
  return i.par > 0 && i.onHand <= i.min;
}

/** How many to order to get back up to the fill-to count, less any already on order. */
export function orderQty(i: StockItem, onOrder = 0): number {
  if (!isLow(i) || i.onHand + onOrder > i.min) return 0;
  return Math.max(1, i.par - i.onHand - onOrder);
}

/** How many of each item are on purchase orders not received yet. */
export function onOrder(purchases: PurchaseOrder[] = []): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of purchases) if (!p.receivedAt) for (const l of p.lines) m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.qty);
  return m;
}

/** Purchase orders still waiting for parts, oldest first. */
export function openPurchases(purchases: PurchaseOrder[] = []): PurchaseOrder[] {
  return purchases.filter((p) => !p.receivedAt).sort((a, b) => a.at - b.at);
}

export interface SupplierOrder {
  supplier: string;
  lines: { item: StockItem; qty: number }[];
  costCents: number;
}

/** Low items as one order per supplier, suppliers in name order, items with no supplier last. */
export function orders(items: StockItem[], ordered: Map<string, number> = new Map()): SupplierOrder[] {
  const by = new Map<string, SupplierOrder>();
  for (const item of items) {
    const qty = orderQty(item, ordered.get(item.id) ?? 0);
    if (qty === 0) continue;
    const key = item.supplier.trim();
    const o = by.get(key) ?? { supplier: key, lines: [], costCents: 0 };
    o.lines.push({ item, qty });
    o.costCents += qty * item.costCents;
    by.set(key, o);
  }
  return [...by.values()]
    .map((o) => ({ ...o, lines: o.lines.sort((a, b) => a.item.name.localeCompare(b.item.name)) }))
    .sort((a, b) => (a.supplier === '' ? 1 : b.supplier === '' ? -1 : a.supplier.localeCompare(b.supplier)));
}

export function orderText(o: SupplierOrder, businessName: string): string {
  const who = businessName.trim() || 'me';
  const lines = o.lines.map(({ item, qty }) => `${qty} x ${item.name}${item.sku ? ` (${item.sku})` : ''}`);
  return [`Hi, I'd like to order for ${who}:`, ...lines, 'Thanks!'].join('\n');
}

export function findSupplier(suppliers: Supplier[], name: string): Supplier | undefined {
  const k = name.trim().toLowerCase();
  return k ? suppliers.find((s) => s.name.trim().toLowerCase() === k) : undefined;
}

/** A text and an email to send the order, where the supplier has them. */
export function orderLinks(o: SupplierOrder, suppliers: Supplier[], businessName: string): { sms?: string; email?: string } {
  const s = findSupplier(suppliers, o.supplier);
  const body = orderText(o, businessName);
  const mail = s ? emailLink(s.email) : undefined;
  return {
    sms: s ? textLink(s.phone, body) : undefined,
    email: mail ? `${mail}?subject=${encodeURIComponent(`Order for ${businessName.trim() || 'my truck'}`)}&body=${encodeURIComponent(body)}` : undefined,
  };
}

/** Supplier names used on items, plus saved ones, without repeats. */
export function supplierNames(store: StockStore): string[] {
  const seen = new Map<string, string>();
  for (const n of [...store.suppliers.map((s) => s.name), ...store.items.map((i) => i.supplier)]) {
    const t = n.trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Adds an order's quantities to on hand. */
export function receive(items: StockItem[], o: { lines: { item?: StockItem; itemId?: string; qty: number }[] }, now: number): StockItem[] {
  const add = new Map(o.lines.map((l) => [l.item?.id ?? l.itemId ?? '', l.qty]));
  return items.map((i) => (add.has(i.id) ? { ...i, onHand: i.onHand + add.get(i.id)!, updatedAt: now } : i));
}

const n0 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
const s0 = (v: unknown) => (typeof v === 'string' ? v : '');

export function parseStock(raw: string | null | unknown): StockStore {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return EMPTY_STOCK;
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return EMPTY_STOCK;
  const d = data as Record<string, unknown>;
  const items = (Array.isArray(d.items) ? d.items : []).flatMap((x): StockItem[] => {
    if (!x || typeof x !== 'object') return [];
    const i = x as Record<string, unknown>;
    if (typeof i.id !== 'string' || typeof i.name !== 'string') return [];
    return [
      {
        id: i.id,
        name: i.name,
        sku: s0(i.sku),
        category: STOCK_CATEGORIES.includes(i.category as StockCategory) ? (i.category as StockCategory) : 'other',
        onHand: n0(i.onHand),
        min: n0(i.min),
        par: n0(i.par),
        supplier: s0(i.supplier),
        costCents: n0(i.costCents),
        updatedAt: n0(i.updatedAt),
        ...(typeof i.barcode === 'string' && i.barcode ? { barcode: i.barcode } : {}),
        ...(id(i.odooId) ? { odooId: id(i.odooId) } : {}),
        ...(typeof i.syncedOnHand === 'number' && i.syncedOnHand >= 0 ? { syncedOnHand: n0(i.syncedOnHand) } : {}),
        ...(typeof i.syncedMin === 'number' ? { syncedMin: n0(i.syncedMin) } : {}),
        ...(typeof i.syncedPar === 'number' ? { syncedPar: n0(i.syncedPar) } : {}),
        ...(typeof i.syncedSupplier === 'string' ? { syncedSupplier: i.syncedSupplier } : {}),
      },
    ];
  });
  const suppliers = (Array.isArray(d.suppliers) ? d.suppliers : []).flatMap((x): Supplier[] => {
    if (!x || typeof x !== 'object') return [];
    const s = x as Record<string, unknown>;
    return typeof s.name === 'string' && s.name.trim() ? [{ name: s.name, phone: s0(s.phone), email: s0(s.email), ...(id(s.odooId) ? { odooId: id(s.odooId) } : {}) }] : [];
  });
  const used = (Array.isArray(d.used) ? d.used : []).flatMap((x): PartUse[] => {
    if (!x || typeof x !== 'object') return [];
    const u = x as Record<string, unknown>;
    if (typeof u.id !== 'string' || typeof u.itemId !== 'string' || typeof u.at !== 'number') return [];
    return [{ id: u.id, itemId: u.itemId, name: s0(u.name), qty: n0(u.qty) || 1, at: u.at, ...(typeof u.jobId === 'string' ? { jobId: u.jobId } : {}), ...(typeof u.off === 'number' && u.off >= 0 ? { off: n0(u.off) } : {}), ...(typeof u.sentAt === 'number' ? { sentAt: u.sentAt } : {}) }];
  });
  const purchases = (Array.isArray(d.purchases) ? d.purchases : []).flatMap((x): PurchaseOrder[] => {
    if (!x || typeof x !== 'object') return [];
    const p = x as Record<string, unknown>;
    if (typeof p.id !== 'string' || !id(p.odooId) || typeof p.at !== 'number') return [];
    const lines = (Array.isArray(p.lines) ? p.lines : []).flatMap((l) => (l && typeof l === 'object' && typeof (l as { itemId?: unknown }).itemId === 'string' ? [{ itemId: (l as { itemId: string }).itemId, qty: n0((l as { qty?: unknown }).qty) }] : []));
    return [{ id: p.id, supplier: s0(p.supplier), odooId: id(p.odooId)!, name: s0(p.name), lines, at: p.at, emailed: p.emailed === true, ...(typeof p.receivedAt === 'number' ? { receivedAt: p.receivedAt } : {}), ...(typeof p.jobId === 'string' ? { jobId: p.jobId } : {}), ...(p.pickup === true ? { pickup: true } : {}) }];
  });
  const t = d.truck as Record<string, unknown> | undefined;
  const truck = t && typeof t === 'object' && id(t.locationId) ? { locationId: id(t.locationId)!, name: s0(t.name), syncedAt: n0(t.syncedAt), ...(id(t.uid) ? { uid: id(t.uid) } : {}), ...(t.chosen === true ? { chosen: true } : {}) } : undefined;
  return { items, suppliers, ...(used.length ? { used } : {}), ...(purchases.length ? { purchases } : {}), ...(truck ? { truck } : {}) };
}

const id = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined);

/** A backup's stock together with the phone's: the item changed last wins; suppliers are matched by name. */
export function mergeStock(current: StockStore, incoming: StockStore): StockStore {
  const byId = new Map(current.items.map((i) => [i.id, i]));
  for (const i of incoming.items) {
    const mine = byId.get(i.id);
    if (!mine || i.updatedAt > mine.updatedAt) byId.set(i.id, i);
  }
  const suppliers = [...current.suppliers];
  for (const s of incoming.suppliers) {
    const at = suppliers.findIndex((x) => x.name.trim().toLowerCase() === s.name.trim().toLowerCase());
    if (at < 0) suppliers.push(s);
    else suppliers[at] = { ...suppliers[at], phone: suppliers[at].phone || s.phone, email: suppliers[at].email || s.email, ...(suppliers[at].odooId || s.odooId ? { odooId: suppliers[at].odooId ?? s.odooId } : {}) };
  }
  const union = <T extends { id: string }>(a: T[] = [], b: T[] = []) => {
    const m = new Map(a.map((x) => [x.id, x]));
    for (const x of b) if (!m.has(x.id)) m.set(x.id, x);
    return [...m.values()];
  };
  const used = union(current.used, incoming.used).sort((a, b) => a.at - b.at);
  const purchases = union(current.purchases, incoming.purchases);
  const truck = current.truck ?? incoming.truck;
  return { items: [...byId.values()], suppliers, ...(used.length ? { used } : {}), ...(purchases.length ? { purchases } : {}), ...(truck ? { truck } : {}) };
}

/** The item a scanned code is: its barcode, else its part number. */
export function findByCode(items: StockItem[], code: string): StockItem | undefined {
  const k = code.trim().toLowerCase();
  if (!k) return undefined;
  return items.find((i) => (i.barcode ?? '').trim().toLowerCase() === k) ?? items.find((i) => i.sku.trim().toLowerCase() === k);
}

/** Parts used in a stretch of time (or on one job), added up by item, most used first. */
export function usedTotals(used: PartUse[] = [], filter: { from?: number; to?: number; jobId?: string }): { itemId: string; name: string; qty: number }[] {
  const m = new Map<string, { itemId: string; name: string; qty: number }>();
  for (const u of used) {
    if (filter.jobId !== undefined && u.jobId !== filter.jobId) continue;
    if (filter.from !== undefined && u.at < filter.from) continue;
    if (filter.to !== undefined && u.at >= filter.to) continue;
    const row = m.get(u.itemId) ?? { itemId: u.itemId, name: u.name, qty: 0 };
    row.qty += u.qty;
    m.set(u.itemId, row);
  }
  return [...m.values()].filter((r) => r.qty > 0).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}

/** Items whose count changed on the phone since Odoo last had it (or that Odoo doesn't have yet). */
export function unsyncedItems(store: StockStore): StockItem[] {
  if (!store.truck) return [];
  return store.items.filter((i) => i.odooId !== undefined && i.onHand !== (i.syncedOnHand ?? -1));
}

/** A guess at the category from a product name, for parts that come from Odoo. */
export function guessCategory(name: string): StockCategory {
  const n = name.toLowerCase();
  if (/spring/.test(n)) return 'springs';
  if (/opener|remote|sensor|keypad|button|transmitter|operator/.test(n)) return 'openers';
  return 'parts';
}
