/**
 * The Purchasing area: what to order, purchase orders (edit, confirm, email,
 * cancel), vendors and their prices, cost and sell price with the "cost went
 * up" review, pricelists, and suggested reorder numbers from real use. Odoo
 * holds everything; the phone stores nothing new.
 *
 * Safety rules:
 * - Nothing here turns on a setting in Odoo (the Sales pricelists option
 *   included: the setup check says where to tick it).
 * - A purchase order is confirmed or emailed only by a button press that showed
 *   the order. Cost and price change one part at a time, never in bulk.
 * - Odoo's own permissions apply to every write.
 * Kept free of React; the client is passed in, so tests use a fake server.
 */
import { OdooClient } from './odoo';
import { emailPurchaseOrder } from './odooStock';
import { JobUse } from './odooWarehouse';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? v : 0);
const cents = (v: unknown) => Math.round(num(v) * 100);
const m2o = (v: unknown): [number, string] | undefined => (Array.isArray(v) && typeof v[0] === 'number' ? [v[0], str(v[1])] : undefined);
const odooMs = (v: unknown) => {
  if (typeof v !== 'string' || !v) return undefined;
  const t = Date.parse(v.includes('T') ? v : `${v.replace(' ', 'T')}Z`);
  return Number.isNaN(t) ? undefined : t;
};

// ---- To order ----

export interface OrderLine {
  productId: number;
  name: string;
  /** On hand across every location the rule covers. */
  onHand: number;
  min: number;
  max: number;
  /** Already on open purchase orders, not yet received. */
  onOrder: number;
  /** What to order now: up to max, less what is on hand and already on order. */
  qty: number;
  priceCents: number;
}

export interface VendorOrder {
  vendorId: number;
  vendor: string;
  lines: OrderLine[];
  totalCents: number;
}

/** How many to order: up to max (or twice min with no max), less on hand and on order. Zero when nothing is needed. */
export function suggestQty(l: { onHand: number; min: number; max: number; onOrder: number }): number {
  if (l.onHand + l.onOrder >= l.min) return 0;
  const up = l.max > l.min ? l.max : Math.max(l.min * 2, l.min + 1);
  return Math.max(0, Math.ceil(up - l.onHand - l.onOrder));
}

/**
 * Everything under minimum across the warehouse and every truck, counting what
 * is already on open purchase orders so nothing is ordered twice, grouped by the
 * product's first vendor (parts with no vendor come last under "No vendor yet").
 */
export async function toOrder(client: OdooClient): Promise<VendorOrder[]> {
  const rules = (await client.call('stock.warehouse.orderpoint', 'search_read', [[]], { fields: ['product_id', 'location_id', 'product_min_qty', 'product_max_qty'], limit: 2000 })) as Record<string, unknown>[];
  if (rules.length === 0) return [];
  const ids = [...new Set(rules.flatMap((r) => m2o(r.product_id)?.[0] ?? []))];
  const quants = (await client.call('stock.quant', 'search_read', [[['product_id', 'in', ids], ['location_id.usage', '=', 'internal']]], { fields: ['product_id', 'quantity'], limit: 10000 })) as Record<string, unknown>[];
  const have = new Map<number, number>();
  for (const q of quants) {
    const p = m2o(q.product_id)?.[0];
    if (p) have.set(p, (have.get(p) ?? 0) + num(q.quantity));
  }
  const open = (await client.call('purchase.order.line', 'search_read', [[['product_id', 'in', ids], ['order_id.state', 'in', ['draft', 'sent', 'to approve', 'purchase']]]], { fields: ['product_id', 'product_qty', 'qty_received'], limit: 5000 })) as Record<string, unknown>[];
  const coming = new Map<number, number>();
  for (const l of open) {
    const p = m2o(l.product_id)?.[0];
    if (p) coming.set(p, (coming.get(p) ?? 0) + Math.max(0, num(l.product_qty) - num(l.qty_received)));
  }
  // One line per product: the rules for it add up (warehouse and trucks).
  const per = new Map<number, { name: string; min: number; max: number }>();
  for (const r of rules) {
    const p = m2o(r.product_id);
    if (!p) continue;
    const cur = per.get(p[0]) ?? { name: p[1], min: 0, max: 0 };
    cur.min += num(r.product_min_qty);
    cur.max += num(r.product_max_qty);
    per.set(p[0], cur);
  }
  const prods = (await client.call('product.product', 'read', [[...per.keys()]], { fields: ['product_tmpl_id', 'standard_price'] })) as { id: number; product_tmpl_id?: unknown; standard_price?: number }[];
  const tmpl = new Map(prods.map((p) => [p.id, m2o(p.product_tmpl_id)?.[0] ?? 0]));
  const vendors = await vendorPrices(client, [...new Set(tmpl.values())].filter(Boolean));
  const groups = new Map<number, VendorOrder>();
  for (const [pid, r] of per) {
    const onHand = Math.round((have.get(pid) ?? 0) * 100) / 100;
    const onOrder = coming.get(pid) ?? 0;
    const qty = suggestQty({ onHand, min: r.min, max: r.max, onOrder });
    if (qty <= 0) continue;
    const first = vendors.get(tmpl.get(pid) ?? 0)?.[0];
    const price = first?.priceCents ?? cents(prods.find((p) => p.id === pid)?.standard_price);
    const key = first?.vendorId ?? 0;
    const g = groups.get(key) ?? { vendorId: key, vendor: first?.vendor ?? 'No vendor yet', lines: [], totalCents: 0 };
    g.lines.push({ productId: pid, name: r.name, onHand, min: r.min, max: r.max, onOrder, qty, priceCents: price });
    g.totalCents += price * qty;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, lines: g.lines.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => (a.vendorId === 0 ? 1 : 0) - (b.vendorId === 0 ? 1 : 0) || a.vendor.localeCompare(b.vendor));
}

/**
 * Makes one DRAFT purchase order for a vendor from lines the buyer reviewed.
 * A draft for the same vendor and source that is still open gets the new parts
 * added instead of a second order. Confirming and emailing is a separate button.
 */
export async function draftForVendor(client: OdooClient, vendorId: number, lines: { productId: number; name: string; qty: number; priceCents: number }[], ref = 'Johnsons app reorder'): Promise<{ id: number; name: string; reused: boolean }> {
  const wanted = lines.filter((l) => l.qty > 0);
  if (!vendorId) throw new Error('Pick a vendor for these parts first.');
  if (wanted.length === 0) throw new Error('Nothing to order.');
  const make = (l: { productId: number; name: string; qty: number; priceCents: number }) => [0, 0, { product_id: l.productId, name: l.name, product_qty: l.qty, ...(l.priceCents > 0 ? { price_unit: l.priceCents / 100 } : {}) }];
  const [existing] = (await client.call('purchase.order', 'search', [[['partner_id', '=', vendorId], ['state', '=', 'draft'], ['origin', '=', ref]]], { limit: 1, order: 'id desc' })) as number[];
  if (existing) {
    const [row] = (await client.call('purchase.order', 'read', [[existing]], { fields: ['name', 'order_line'] })) as { name?: string; order_line?: number[] }[];
    const have = row?.order_line?.length ? ((await client.call('purchase.order.line', 'read', [row.order_line], { fields: ['product_id'] })) as { product_id?: unknown }[]) : [];
    const on = new Set(have.map((h) => m2o(h.product_id)?.[0]));
    const add = wanted.filter((l) => !on.has(l.productId));
    if (add.length) await client.call('purchase.order', 'write', [[existing], { order_line: add.map(make) }]);
    return { id: existing, name: row?.name ?? `#${existing}`, reused: true };
  }
  const id = (await client.call('purchase.order', 'create', [{ partner_id: vendorId, origin: ref, order_line: wanted.map(make) }])) as number;
  const [row] = (await client.call('purchase.order', 'read', [[id]], { fields: ['name'] })) as { name?: string }[];
  return { id, name: row?.name ?? `#${id}`, reused: false };
}

// ---- Purchase orders ----

export type PoGroup = 'draft' | 'sent' | 'receive' | 'done';
export const PO_GROUP_LABEL: Record<PoGroup, string> = { draft: 'Draft', sent: 'Sent', receive: 'To receive', done: 'Done' };

export interface PoRow {
  id: number;
  name: string;
  vendor: string;
  state: string;
  group: PoGroup;
  totalCents: number;
  /** When the vendor is expected to deliver. */
  expected?: number;
  late: boolean;
}

/** Odoo's state as the four groups a buyer thinks in. Cancelled orders have none. */
export function poGroup(state: string): PoGroup | null {
  if (state === 'draft') return 'draft';
  if (state === 'sent' || state === 'to approve') return 'sent';
  if (state === 'purchase') return 'receive';
  if (state === 'done') return 'done';
  return null;
}

/** Recent purchase orders (newest first), each in a group, with what is late (expected before now and still to receive). */
export async function listPurchases(client: OdooClient, now = Date.now(), limit = 80): Promise<PoRow[]> {
  const rows = (await client.call('purchase.order', 'search_read', [[['state', '!=', 'cancel']]], { fields: ['name', 'partner_id', 'state', 'amount_total', 'date_planned'], order: 'id desc', limit })) as Record<string, unknown>[];
  return rows.flatMap((r) => {
    const group = poGroup(str(r.state));
    if (!group) return [];
    const expected = odooMs(r.date_planned);
    return [{ id: r.id as number, name: str(r.name), vendor: m2o(r.partner_id)?.[1] ?? '', state: str(r.state), group, totalCents: cents(r.amount_total), ...(expected ? { expected } : {}), late: group === 'receive' && !!expected && expected < now }];
  });
}

export interface PoLine {
  id: number;
  productId: number;
  name: string;
  qty: number;
  received: number;
  priceCents: number;
}

export interface PoDetail extends PoRow {
  vendorId: number;
  email: string;
  origin: string;
  lines: PoLine[];
}

export async function readPurchase(client: OdooClient, id: number, now = Date.now()): Promise<PoDetail> {
  const [r] = (await client.call('purchase.order', 'read', [[id]], { fields: ['name', 'partner_id', 'state', 'amount_total', 'date_planned', 'origin', 'order_line'] })) as Record<string, unknown>[];
  if (!r) throw new Error('Odoo no longer has this purchase order.');
  const lines = ((r.order_line as number[] | undefined)?.length ? await client.call('purchase.order.line', 'read', [r.order_line as number[]], { fields: ['product_id', 'name', 'product_qty', 'qty_received', 'price_unit'] }) : []) as Record<string, unknown>[];
  const vendor = m2o(r.partner_id);
  let email = '';
  if (vendor) {
    const [p] = (await client.call('res.partner', 'read', [[vendor[0]]], { fields: ['email'] }).catch(() => [])) as { email?: unknown }[];
    email = str(p?.email);
  }
  const expected = odooMs(r.date_planned);
  const group = poGroup(str(r.state)) ?? 'done';
  return {
    id,
    name: str(r.name),
    vendor: vendor?.[1] ?? '',
    vendorId: vendor?.[0] ?? 0,
    email,
    state: str(r.state),
    group,
    totalCents: cents(r.amount_total),
    ...(expected ? { expected } : {}),
    late: group === 'receive' && !!expected && expected < now,
    origin: str(r.origin),
    lines: lines.map((l) => ({ id: l.id as number, productId: m2o(l.product_id)?.[0] ?? 0, name: m2o(l.product_id)?.[1] ?? str(l.name), qty: num(l.product_qty), received: num(l.qty_received), priceCents: cents(l.price_unit) })),
  };
}

/** Changes a line on a DRAFT order (quantity and price). A confirmed order is changed in Odoo. */
export async function editPurchaseLine(client: OdooClient, orderId: number, line: { id: number; qty: number; priceCents: number }): Promise<void> {
  const [o] = (await client.call('purchase.order', 'read', [[orderId]], { fields: ['state'] })) as { state?: string }[];
  if (o?.state !== 'draft' && o?.state !== 'sent') throw new Error('Only a draft order can be changed here. Change a confirmed order in Odoo.');
  if (line.qty <= 0) await client.call('purchase.order.line', 'unlink', [[line.id]]);
  else await client.call('purchase.order.line', 'write', [[line.id], { product_qty: line.qty, price_unit: line.priceCents / 100 }]);
}

export interface Confirmed {
  state: string;
  emailed: boolean;
  /** Why it did not go, when it did not. */
  why?: string;
}

/**
 * Confirms the order and has Odoo email it to the vendor. This runs only from
 * the "Confirm and send" button, on a screen that showed the order. If Odoo
 * can't email it, the order is still confirmed and the reason is returned.
 */
export async function confirmAndSend(client: OdooClient, id: number, email = true): Promise<Confirmed> {
  const [o] = (await client.call('purchase.order', 'read', [[id]], { fields: ['state'] })) as { state?: string }[];
  if (o?.state === 'draft' || o?.state === 'sent' || o?.state === 'to approve') await client.call('purchase.order', 'button_confirm', [[id]]);
  const [after] = (await client.call('purchase.order', 'read', [[id]], { fields: ['state'] })) as { state?: string }[];
  if (after?.state === 'to approve') return { state: 'to approve', emailed: false, why: 'Odoo wants a manager to approve this order first.' };
  if (!email) return { state: after?.state ?? '', emailed: false };
  const emailed = await emailPurchaseOrder(client, id);
  return { state: after?.state ?? '', emailed, ...(emailed ? {} : { why: 'Odoo could not email it (no email on the vendor, or outgoing mail is not set up). It is confirmed; send it from Odoo or call the vendor.' }) };
}

/** Cancels a purchase order that has nothing received. */
export async function cancelPurchase(client: OdooClient, id: number): Promise<void> {
  await client.call('purchase.order', 'button_cancel', [[id]]);
}

// ---- Vendors and vendor prices ----

export interface VendorPrice {
  id: number;
  vendorId: number;
  vendor: string;
  priceCents: number;
  minQty: number;
  code: string;
  delay: number;
}

/** Each product template's vendor price rows, cheapest first. */
export async function vendorPrices(client: OdooClient, templateIds: number[]): Promise<Map<number, VendorPrice[]>> {
  const out = new Map<number, VendorPrice[]>();
  if (templateIds.length === 0) return out;
  let rows: Record<string, unknown>[] = [];
  try {
    rows = (await client.call('product.supplierinfo', 'search_read', [[['product_tmpl_id', 'in', templateIds]]], { fields: ['product_tmpl_id', 'partner_id', 'price', 'min_qty', 'product_code', 'delay', 'sequence'], order: 'sequence asc, price asc', limit: 2000 })) as Record<string, unknown>[];
  } catch {
    return out;
  }
  for (const r of rows) {
    const t = m2o(r.product_tmpl_id)?.[0];
    const v = m2o(r.partner_id);
    if (!t || !v) continue;
    const list = out.get(t) ?? [];
    list.push({ id: r.id as number, vendorId: v[0], vendor: v[1], priceCents: cents(r.price), minQty: num(r.min_qty), code: str(r.product_code), delay: num(r.delay) });
    out.set(t, list);
  }
  for (const [k, list] of out) out.set(k, [...list].sort((a, b) => (a.priceCents || Infinity) - (b.priceCents || Infinity)));
  return out;
}

export interface Vendor {
  id: number;
  name: string;
  email: string;
  phone: string;
  /** Typical days from order to delivery, from the vendor's price rows. */
  leadDays: number;
  parts: number;
}

export async function listVendors(client: OdooClient): Promise<Vendor[]> {
  const rows = (await client.call('res.partner', 'search_read', [[['supplier_rank', '>', 0]]], { fields: ['name', 'email', 'phone'], order: 'name asc', limit: 300 })) as Record<string, unknown>[];
  const info = (await client.call('product.supplierinfo', 'search_read', [[['partner_id', 'in', rows.map((r) => r.id)]]], { fields: ['partner_id', 'delay'], limit: 5000 }).catch(() => [])) as Record<string, unknown>[];
  return rows.map((r) => {
    const mine = info.filter((i) => m2o(i.partner_id)?.[0] === r.id);
    const lead = mine.length ? Math.round(mine.reduce((n, i) => n + num(i.delay), 0) / mine.length) : 0;
    return { id: r.id as number, name: str(r.name), email: str(r.email), phone: str(r.phone), leadDays: lead, parts: mine.length };
  });
}

export interface PartVendors {
  templateId: number;
  rows: VendorPrice[];
}

export async function partVendors(client: OdooClient, productId: number): Promise<PartVendors> {
  const [p] = (await client.call('product.product', 'read', [[productId]], { fields: ['product_tmpl_id'] })) as { product_tmpl_id?: unknown }[];
  const templateId = m2o(p?.product_tmpl_id)?.[0] ?? 0;
  return { templateId, rows: templateId ? ((await vendorPrices(client, [templateId])).get(templateId) ?? []) : [] };
}

/** Adds a vendor price row to a part (product.supplierinfo), or changes the one given. */
export async function saveVendorPrice(client: OdooClient, templateId: number, row: { id?: number; vendorId: number; priceCents: number; minQty: number; code: string; delay: number }): Promise<void> {
  const vals = { partner_id: row.vendorId, price: row.priceCents / 100, min_qty: row.minQty, product_code: row.code || false, delay: row.delay };
  if (row.id) await client.call('product.supplierinfo', 'write', [[row.id], vals]);
  else await client.call('product.supplierinfo', 'create', [{ ...vals, product_tmpl_id: templateId }]);
}

export async function removeVendorPrice(client: OdooClient, id: number): Promise<void> {
  await client.call('product.supplierinfo', 'unlink', [[id]]);
}

// ---- Cost and sell price ----

export interface PartPricing {
  productId: number;
  name: string;
  costCents: number;
  priceCents: number;
  /** What the last confirmed purchase paid, when there is one. */
  lastPaidCents?: number;
  lastPaidAt?: number;
}

/** Margin as a share of the sell price, in percent (0 with no price). */
export const marginPercent = (costCents: number, priceCents: number) => (priceCents > 0 ? Math.round(((priceCents - costCents) / priceCents) * 1000) / 10 : 0);

/** The sell price that keeps the same margin at a new cost, rounded up to the next 5 cents. */
export function priceAtSameMargin(oldCostCents: number, oldPriceCents: number, newCostCents: number): number {
  if (oldPriceCents <= 0 || oldCostCents <= 0 || oldCostCents >= oldPriceCents) return oldPriceCents;
  // The same margin means the same price-to-cost ratio.
  return Math.ceil((newCostCents * oldPriceCents) / oldCostCents / 5) * 5;
}

/** Parts matching what is typed, with their cost, price and last paid cost. */
export async function searchPricing(client: OdooClient, q: string, limit = 25): Promise<PartPricing[]> {
  const t = q.trim();
  const domain: unknown[] = [['type', '!=', 'service'], ['sale_ok', '=', true]];
  if (t) domain.push('|', '|', ['name', 'ilike', t], ['default_code', 'ilike', t], ['barcode', '=', t]);
  const rows = (await client.call('product.product', 'search_read', [domain], { fields: ['name', 'standard_price', 'list_price'], order: 'name asc', limit })) as Record<string, unknown>[];
  const paid = await lastPaid(client, rows.map((r) => r.id as number));
  return rows.map((r) => ({ productId: r.id as number, name: str(r.name), costCents: cents(r.standard_price), priceCents: cents(r.list_price), ...(paid.get(r.id as number) ?? {}) }));
}

async function lastPaid(client: OdooClient, ids: number[]): Promise<Map<number, { lastPaidCents: number; lastPaidAt?: number }>> {
  const out = new Map<number, { lastPaidCents: number; lastPaidAt?: number }>();
  if (ids.length === 0) return out;
  try {
    const rows = (await client.call('purchase.order.line', 'search_read', [[['product_id', 'in', ids], ['order_id.state', 'in', ['purchase', 'done']], ['price_unit', '>', 0]]], { fields: ['product_id', 'price_unit', 'date_order'], order: 'id desc', limit: 1000 })) as Record<string, unknown>[];
    for (const r of rows) {
      const p = m2o(r.product_id)?.[0];
      if (p && !out.has(p)) out.set(p, { lastPaidCents: cents(r.price_unit), ...(odooMs(r.date_order) ? { lastPaidAt: odooMs(r.date_order) } : {}) });
    }
  } catch {
    // Purchase isn't readable here.
  }
  return out;
}

/** Saves one part's cost and/or sell price. Only the values given change, one part at a time. */
export async function savePricing(client: OdooClient, productId: number, v: { costCents?: number; priceCents?: number }): Promise<void> {
  const vals: Record<string, number> = {};
  if (v.costCents !== undefined) vals.standard_price = v.costCents / 100;
  if (v.priceCents !== undefined) vals.list_price = v.priceCents / 100;
  if (Object.keys(vals).length === 0) return;
  await client.call('product.product', 'write', [[productId], vals]);
}

export interface CostRise {
  productId: number;
  name: string;
  costCents: number;
  paidCents: number;
  priceCents: number;
  /** A sell price that keeps the same margin at the new cost. */
  suggestedPriceCents: number;
  paidAt?: number;
}

/** Parts whose last confirmed purchase paid more than the stored cost, biggest rise first. Nothing is changed here. */
export async function costWentUp(client: OdooClient, now = Date.now(), days = 120): Promise<CostRise[]> {
  const since = new Date(now - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  let rows: Record<string, unknown>[];
  try {
    rows = (await client.call('purchase.order.line', 'search_read', [[['order_id.state', 'in', ['purchase', 'done']], ['price_unit', '>', 0], ['date_order', '>=', since]]], { fields: ['product_id', 'price_unit', 'date_order'], order: 'id desc', limit: 1500 })) as Record<string, unknown>[];
  } catch {
    return [];
  }
  const last = new Map<number, { cents: number; at?: number }>();
  for (const r of rows) {
    const p = m2o(r.product_id)?.[0];
    if (p && !last.has(p)) last.set(p, { cents: cents(r.price_unit), at: odooMs(r.date_order) });
  }
  if (last.size === 0) return [];
  const prods = (await client.call('product.product', 'read', [[...last.keys()]], { fields: ['name', 'standard_price', 'list_price'] })) as Record<string, unknown>[];
  const out: CostRise[] = [];
  for (const p of prods) {
    const l = last.get(p.id as number);
    const cost = cents(p.standard_price);
    if (!l || l.cents <= cost) continue;
    const price = cents(p.list_price);
    out.push({ productId: p.id as number, name: str(p.name), costCents: cost, paidCents: l.cents, priceCents: price, suggestedPriceCents: priceAtSameMargin(cost, price, l.cents), ...(l.at ? { paidAt: l.at } : {}) });
  }
  return out.sort((a, b) => b.paidCents - b.costCents - (a.paidCents - a.costCents));
}

// ---- Pricelists ----

export interface Pricelist {
  id: number;
  name: string;
  currency: string;
  items: number;
}

/** Whether Odoo's Sales pricelists option is on (the pricelist model is readable). The app never turns it on. */
export async function pricelistsAvailable(client: OdooClient): Promise<boolean> {
  try {
    await client.call('product.pricelist', 'search_count', [[]]);
    await client.call('product.pricelist.item', 'search_count', [[]]);
    return true;
  } catch {
    return false;
  }
}

/** Whether the Sales pricelist option is ticked (users get the pricelist group). Null when it can't be checked. */
export async function pricelistOptionOn(client: OdooClient): Promise<boolean | null> {
  try {
    const r = await client.call('res.users', 'has_group', [[client.session.uid], 'product.group_product_pricelist']);
    return typeof r === 'boolean' ? r : null;
  } catch {
    return null;
  }
}

export async function listPricelists(client: OdooClient): Promise<Pricelist[]> {
  const rows = (await client.call('product.pricelist', 'search_read', [[['active', '=', true]]], { fields: ['name', 'currency_id', 'item_ids'], order: 'sequence asc, name asc', limit: 100 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: str(r.name), currency: m2o(r.currency_id)?.[1] ?? '', items: Array.isArray(r.item_ids) ? r.item_ids.length : 0 }));
}

export type RuleKind = 'fixed' | 'percentage' | 'formula';
export type RuleScope = 'product' | 'category' | 'all';

export interface PriceRule {
  id: number;
  scope: RuleScope;
  /** The product or category, as Odoo names it. */
  target: string;
  targetId: number;
  kind: RuleKind;
  fixedCents: number;
  percent: number;
  minQty: number;
}

const SCOPE_FROM_ODOO: Record<string, RuleScope> = { '0_product_variant': 'product', '1_product': 'product', '2_product_category': 'category', '3_global': 'all' };
const SCOPE_TO_ODOO: Record<RuleScope, string> = { product: '0_product_variant', category: '2_product_category', all: '3_global' };

/** One pricelist's rules, as the app edits them: a fixed price or a percent off, for a part, a category or everything. */
export async function pricelistRules(client: OdooClient, id: number): Promise<PriceRule[]> {
  const rows = (await client.call('product.pricelist.item', 'search_read', [[['pricelist_id', '=', id]]], { fields: ['applied_on', 'product_id', 'product_tmpl_id', 'categ_id', 'compute_price', 'fixed_price', 'percent_price', 'min_quantity'], order: 'applied_on asc, min_quantity asc, id asc', limit: 500 })) as Record<string, unknown>[];
  return rows.map((r) => {
    const scope = SCOPE_FROM_ODOO[str(r.applied_on)] ?? 'all';
    const t = m2o(r.product_id) ?? m2o(r.product_tmpl_id) ?? m2o(r.categ_id);
    const kind = str(r.compute_price);
    return { id: r.id as number, scope, target: scope === 'all' ? 'Everything' : (t?.[1] ?? ''), targetId: t?.[0] ?? 0, kind: kind === 'fixed' ? 'fixed' : kind === 'percentage' ? 'percentage' : 'formula', fixedCents: cents(r.fixed_price), percent: num(r.percent_price), minQty: num(r.min_quantity) };
  });
}

/** What a rule does, in words: "$12.50 each", "10% off". */
export function ruleText(r: Pick<PriceRule, 'kind' | 'fixedCents' | 'percent' | 'minQty'>): string {
  const what = r.kind === 'fixed' ? `$${(r.fixedCents / 100).toFixed(2)} each` : r.kind === 'percentage' ? `${r.percent}% off` : 'A formula set in Odoo';
  return r.minQty > 1 ? `${what}, from ${r.minQty}` : what;
}

/** Makes or changes a rule (a fixed price or a percent off). A formula rule built in Odoo is left for Odoo. */
export async function savePriceRule(client: OdooClient, pricelistId: number, rule: { id?: number; scope: RuleScope; targetId?: number; kind: 'fixed' | 'percentage'; fixedCents?: number; percent?: number; minQty?: number }): Promise<number> {
  if (rule.scope !== 'all' && !rule.targetId) throw new Error('Pick the part or category this rule is for.');
  if (rule.kind === 'percentage' && (rule.percent === undefined || rule.percent < 0 || rule.percent > 100)) throw new Error('A percent off is between 0 and 100.');
  if (rule.kind === 'fixed' && (rule.fixedCents === undefined || rule.fixedCents < 0)) throw new Error('Enter the fixed price.');
  const vals: Record<string, unknown> = {
    pricelist_id: pricelistId,
    applied_on: SCOPE_TO_ODOO[rule.scope],
    compute_price: rule.kind,
    min_quantity: rule.minQty ?? 0,
    ...(rule.kind === 'fixed' ? { fixed_price: (rule.fixedCents ?? 0) / 100 } : { percent_price: rule.percent ?? 0 }),
    ...(rule.scope === 'product' ? { product_id: rule.targetId } : rule.scope === 'category' ? { categ_id: rule.targetId } : {}),
  };
  if (rule.id) {
    await client.call('product.pricelist.item', 'write', [[rule.id], vals]);
    return rule.id;
  }
  return (await client.call('product.pricelist.item', 'create', [vals])) as number;
}

export async function removePriceRule(client: OdooClient, id: number): Promise<void> {
  await client.call('product.pricelist.item', 'unlink', [[id]]);
}

// ---- Suggested min and par from real use ----

export interface UseSuggestion {
  productId: number;
  name: string;
  used: number;
  perWeek: number;
  min: number;
  max: number;
  }

/**
 * Suggests reorder numbers from what was really used on jobs over `weeks`:
 * minimum covers `coverWeeks` of use (default 2), maximum twice that. Only a
 * suggestion; the buyer applies it one part at a time.
 */
export function suggestFromUse(uses: JobUse[], weeks: number, coverWeeks = 2): UseSuggestion[] {
  const total = new Map<number, { name: string; used: number }>();
  for (const u of uses) for (const l of u.lines) if (l.productId) total.set(l.productId, { name: l.name, used: (total.get(l.productId)?.used ?? 0) + l.qty });
  return [...total.entries()]
    .map(([productId, { name, used }]) => {
      const perWeek = used / Math.max(1, weeks);
      const min = Math.max(1, Math.ceil(perWeek * coverWeeks));
      return { productId, name, used, perWeek: Math.round(perWeek * 10) / 10, min, max: min * 2 };
    })
    .sort((a, b) => b.used - a.used);
}
