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
}

export interface Supplier {
  name: string;
  phone: string;
  email: string;
}

export interface StockStore {
  items: StockItem[];
  suppliers: Supplier[];
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

/** How many to order to get back up to the fill-to count. */
export function orderQty(i: StockItem): number {
  return isLow(i) ? Math.max(1, i.par - i.onHand) : 0;
}

export interface SupplierOrder {
  supplier: string;
  lines: { item: StockItem; qty: number }[];
  costCents: number;
}

/** Low items as one order per supplier, suppliers in name order, items with no supplier last. */
export function orders(items: StockItem[]): SupplierOrder[] {
  const by = new Map<string, SupplierOrder>();
  for (const item of items) {
    const qty = orderQty(item);
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
export function receive(items: StockItem[], o: SupplierOrder, now: number): StockItem[] {
  const add = new Map(o.lines.map((l) => [l.item.id, l.qty]));
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
      },
    ];
  });
  const suppliers = (Array.isArray(d.suppliers) ? d.suppliers : []).flatMap((x): Supplier[] => {
    if (!x || typeof x !== 'object') return [];
    const s = x as Record<string, unknown>;
    return typeof s.name === 'string' && s.name.trim() ? [{ name: s.name, phone: s0(s.phone), email: s0(s.email) }] : [];
  });
  return { items, suppliers };
}

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
    else suppliers[at] = { ...suppliers[at], phone: suppliers[at].phone || s.phone, email: suppliers[at].email || s.email };
  }
  return { items: [...byId.values()], suppliers };
}
