/**
 * The price book: every product Odoo can sell, kept on the phone so it opens
 * with no signal, grouped by Odoo's product categories. Favorites are each
 * tech's own (kept per Odoo login), and "Frequently used" is what was sold
 * most on recent Odoo orders. Kept free of React so it can be tested directly.
 */

export const PRICE_BOOK_STORAGE_KEY = 'price-book/v1';
export const PRICE_BOOK_FAVORITES_KEY = 'price-book-favorites/v1';

/** Labor and other services, or parts and materials. */
export type ItemKind = 'service' | 'material';

export interface PriceBookItem {
  /** Odoo product.product id. */
  id: number;
  name: string;
  /** Internal reference, if any. */
  code: string;
  /** Sales price in cents. */
  cents: number;
  kind: ItemKind;
  /** Odoo's category path without the root, e.g. ["Openers", "Genie Operators"]. Empty when uncategorised. */
  category: string[];
  /** The sales description, if any. */
  description: string;
}

export interface PriceBook {
  items: PriceBookItem[];
  /** Product ids sold most on recent Odoo orders, most first. */
  frequent: number[];
  /** When it was last fetched from Odoo, ms. 0 = never. */
  fetchedAt: number;
}

export const EMPTY_PRICE_BOOK: PriceBook = { items: [], frequent: [], fetchedAt: 0 };

/** Favorite product ids per tech, keyed by techKey(). */
export type Favorites = Record<string, number[]>;

/** One tech's key for favorites: the Odoo server and user, or "phone" when not signed in. */
export function techKey(session: { url: string; db: string; uid: number } | null | undefined): string {
  return session ? `${session.url}|${session.db}|${session.uid}` : 'phone';
}

/**
 * "All / Saleable / Openers" → ["Openers"]: drops the root category every
 * product shares (Odoo's "All", and "Saleable" under it when everything is in it).
 */
export function categoryPaths(names: string[]): string[][] {
  const split = names.map((n) =>
    n
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean),
  );
  // Drop the leading parts every path shares, while some path still goes deeper.
  let drop = 0;
  const nonEmpty = split.filter((p) => p.length > 0);
  for (;;) {
    const first = nonEmpty[0]?.[drop];
    if (first === undefined) break;
    if (!nonEmpty.every((p) => p[drop] === first)) break;
    if (!nonEmpty.some((p) => p.length > drop + 1)) break;
    drop++;
  }
  return split.map((p) => p.slice(drop));
}

/** Search text: lower case, words. */
function words(s: string): string[] {
  return s.toLowerCase().split(/\s+/).filter(Boolean);
}

/** Items whose name, code, category or description has every word typed. */
export function searchItems(items: PriceBookItem[], query: string): PriceBookItem[] {
  const ws = words(query);
  if (ws.length === 0) return [];
  return items.filter((i) => {
    const hay = `${i.name} ${i.code} ${i.category.join(' ')} ${i.description}`.toLowerCase();
    return ws.every((w) => hay.includes(w));
  });
}

/** What sits at one level of the category tree: the sub-categories, then the items right in it. */
export function categoryLevel(items: PriceBookItem[], path: string[]): { folders: { name: string; count: number }[]; items: PriceBookItem[] } {
  const inside = items.filter((i) => path.every((p, n) => i.category[n] === p));
  const counts = new Map<string, number>();
  const here: PriceBookItem[] = [];
  for (const i of inside) {
    const next = i.category[path.length];
    if (next === undefined) here.push(i);
    else counts.set(next, (counts.get(next) ?? 0) + 1);
  }
  const folders = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  return { folders, items: sortByName(here) };
}

export function sortByName(items: PriceBookItem[]): PriceBookItem[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

/** The items for these ids, in that order, skipping ones no longer in the book. */
export function itemsByIds(items: PriceBookItem[], ids: number[]): PriceBookItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return ids.flatMap((id) => {
    const i = byId.get(id);
    return i ? [i] : [];
  });
}

/** Product ids by how often they were sold, most first (ties by first seen). */
export function rankFrequent(productIds: number[], limit = 8): number[] {
  const counts = new Map<number, number>();
  for (const id of productIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

export function toggleFavorite(favs: Favorites, key: string, id: number): Favorites {
  const mine = favs[key] ?? [];
  return { ...favs, [key]: mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id] };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function parseItem(v: unknown): PriceBookItem[] {
  if (!v || typeof v !== 'object') return [];
  const x = v as Record<string, unknown>;
  if (typeof x.id !== 'number' || typeof x.name !== 'string') return [];
  return [
    {
      id: x.id,
      name: x.name,
      code: str(x.code),
      cents: typeof x.cents === 'number' && x.cents > 0 ? Math.round(x.cents) : 0,
      kind: x.kind === 'service' ? 'service' : 'material',
      category: Array.isArray(x.category) ? x.category.filter((c): c is string => typeof c === 'string') : [],
      description: str(x.description),
    },
  ];
}

export function parsePriceBook(raw: string | null): PriceBook {
  try {
    const d = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    if (!d || typeof d !== 'object' || Array.isArray(d)) return EMPTY_PRICE_BOOK;
    return {
      items: Array.isArray(d.items) ? d.items.flatMap(parseItem) : [],
      frequent: Array.isArray(d.frequent) ? d.frequent.filter((n): n is number => typeof n === 'number') : [],
      fetchedAt: typeof d.fetchedAt === 'number' ? d.fetchedAt : 0,
    };
  } catch {
    return EMPTY_PRICE_BOOK;
  }
}

export function parseFavorites(raw: string | null): Favorites {
  try {
    const d = raw ? (JSON.parse(raw) as unknown) : null;
    if (!d || typeof d !== 'object' || Array.isArray(d)) return {};
    const out: Favorites = {};
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = v.filter((n): n is number => typeof n === 'number');
    }
    return out;
  } catch {
    return {};
  }
}

/** "Updated 3:05 pm" / "Updated Nov 10"; "Not loaded from Odoo yet" when never. */
export function fetchedLabel(at: number, now: number): string {
  if (!at) return 'Not loaded from Odoo yet';
  const d = new Date(at);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  if (sameDay) {
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    return `Updated ${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
  }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `Updated ${months[d.getMonth()]} ${d.getDate()}`;
}

/** The fields we read about a product, in the shape Odoo returns them. */
export function toItem(r: Record<string, unknown>, category: string[]): PriceBookItem {
  const price = typeof r.lst_price === 'number' ? r.lst_price : 0;
  return {
    id: r.id as number,
    name: str(r.name),
    code: str(r.default_code),
    cents: Math.max(0, Math.round(price * 100)),
    kind: r.type === 'service' ? 'service' : 'material',
    category,
    description: str(r.description_sale).trim(),
  };
}

/** Just what fetchPriceBook needs from the Odoo client, so tests can fake it. */
export interface PriceBookSource {
  session: { productFields: string[]; apps: { products: boolean; sales: boolean } };
  call: (model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) => Promise<unknown>;
}

/** Reads every product Odoo can sell (up to 2000) and what sold most on the last 500 order lines. */
export async function fetchPriceBook(client: PriceBookSource, now: number): Promise<PriceBook> {
  if (!client.session.apps.products) return { ...EMPTY_PRICE_BOOK, fetchedAt: now };
  const pf = client.session.productFields;
  const optional = ['default_code', 'categ_id', 'type', 'description_sale'].filter((f) => pf.includes(f));
  const domain = pf.includes('sale_ok') ? [['sale_ok', '=', true]] : [];
  const rows = (await client.call('product.product', 'search_read', [domain], { fields: ['name', 'lst_price', ...optional], limit: 2000, order: 'name asc' })) as Record<string, unknown>[];
  const names = rows.map((r) => (Array.isArray(r.categ_id) && typeof r.categ_id[1] === 'string' ? r.categ_id[1] : ''));
  const paths = categoryPaths(names);
  const items = rows.map((r, n) => toItem(r, paths[n]!));
  let frequent: number[] = [];
  if (client.session.apps.sales) {
    try {
      const lines = (await client.call('sale.order.line', 'search_read', [[['state', 'in', ['sale', 'done']], ['product_id', '!=', false]]], { fields: ['product_id'], limit: 500, order: 'id desc' })) as Record<string, unknown>[];
      const sold = lines.flatMap((l) => (Array.isArray(l.product_id) && typeof l.product_id[0] === 'number' ? [l.product_id[0]] : []));
      const known = new Set(items.map((i) => i.id));
      frequent = rankFrequent(sold.filter((id) => known.has(id)));
    } catch {
      // Frequently used is a nice-to-have; the book still loads without it.
    }
  }
  return { items, frequent, fetchedAt: now };
}

/**
 * The company's default sales tax in Odoo as a percent ("8.25"), for the
 * phone's own estimate while offline (Odoo applies the real tax). Undefined
 * when there is none, or it isn't a plain percent.
 */
export async function fetchSaleTaxPercent(client: PriceBookSource): Promise<string | undefined> {
  const [co] = (await client.call('res.company', 'search_read', [[]], { fields: ['account_sale_tax_id'], limit: 1 })) as Record<string, unknown>[];
  const ref = co?.account_sale_tax_id;
  const id = Array.isArray(ref) && typeof ref[0] === 'number' ? ref[0] : undefined;
  if (!id) return undefined;
  const [tax] = (await client.call('account.tax', 'read', [[id]], { fields: ['amount', 'amount_type'] })) as Record<string, unknown>[];
  if (tax?.amount_type !== 'percent' || typeof tax.amount !== 'number') return undefined;
  return String(Math.round(tax.amount * 10_000) / 10_000);
}
