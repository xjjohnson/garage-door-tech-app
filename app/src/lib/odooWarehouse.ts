/**
 * The Warehouse area: who may see it, counting any location (the warehouse or
 * a truck), transfers, receiving, parts used on jobs, and the adjustment
 * history. Everything is read from and written to Odoo's own Inventory; the
 * phone stores nothing new.
 *
 * Safety rules (same as the truck stock):
 * - Nothing here turns on a setting in Odoo (Track Inventory included).
 * - Nothing is written until a person presses a button on a screen that showed
 *   what will change. Old phone data is never bulk-written.
 * - A line Odoo refuses is reported and does not stop the others.
 * Kept free of React; the client is passed in, so tests use a fake server.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { rolePreview } from './devFlags';
import { OdooClient } from './odoo';
import { readProducts, setTruckQty, StockProduct } from './odooStock';
import { orderInfoByName } from './odooPurchasing';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? v : 0);
const m2o = (v: unknown): [number, string] | undefined => (Array.isArray(v) && typeof v[0] === 'number' ? [v[0], str(v[1])] : undefined);

export type Role = 'warehouse' | 'purchasing' | 'pricing' | 'dispatch' | 'office' | 'sales';

/** Odoo groups that open each area. The owner (an Odoo admin or Field Service manager) sees everything. */
export const ROLE_GROUPS: Record<Role, string[]> = {
  warehouse: ['stock.group_stock_manager'],
  purchasing: ['purchase.group_purchase_user', 'purchase.group_purchase_manager'],
  // Cost and pricelists change what the business earns: a purchase manager who is also a sales manager.
  pricing: ['purchase.group_purchase_manager'],
  // Handing out jobs: the Field Service Dispatcher group.
  dispatch: ['fieldservice.group_fsm_dispatcher'],
  // Techs already hold Sales User and Billing (the app writes their quotes and invoices as them), so these two use the Administrator groups.
  office: ['account.group_account_manager'],
  sales: ['sales_team.group_sale_manager'],
};

/** Odoo groups that make someone the owner. */
export const OWNER_GROUPS = ['base.group_system', 'fieldservice.group_fsm_manager'];

export interface Access {
  warehouse: boolean;
  purchasing: boolean;
  /** Cost and pricelist editing. */
  pricing: boolean;
  /** The Dispatch area: Odoo's Field Service Dispatcher group (or the owner). */
  dispatch: boolean;
  /** The Office area: Odoo's Billing Administrator group (or the owner). */
  office: boolean;
  /** The Sales area: Odoo's Sales Administrator group (or the owner). */
  sales: boolean;
  owner: boolean;
}
export const NO_ACCESS: Access = { warehouse: false, purchasing: false, pricing: false, dispatch: false, office: false, sales: false, owner: false };

/** Asks Odoo about one group. `seen.answered` turns true once Odoo has given a real yes or no, so "couldn't reach Odoo" isn't mistaken for "no". */
async function inGroup(client: OdooClient, group: string, seen: { answered: boolean }): Promise<boolean> {
  try {
    const r = await client.call('res.users', 'has_group', [[client.session.uid], group]);
    if (typeof r === 'boolean') seen.answered = true;
    return r === true;
  } catch {
    // Not a group in this Odoo, or Odoo can't be reached; it can't be held.
    return false;
  }
}

const cacheKey = (client: OdooClient) => `roles.last.${client.session.url}|${client.session.db}|${client.session.login}`;

async function readCache(client: OdooClient): Promise<Access | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(client));
    const d = raw ? JSON.parse(raw) : null;
    // A role saved by an older version has no dispatch answer yet: that means no.
    if (d && ['warehouse', 'purchasing', 'pricing', 'owner'].every((k) => typeof d[k] === 'boolean')) return { dispatch: false, office: false, sales: false, ...d } as Access;
  } catch {
    // No saved role.
  }
  return null;
}

/**
 * Which areas this signed-in Odoo user may open, from their Odoo groups,
 * whatever "Look as a tech" says. When Odoo can't be reached it uses the
 * role it last saw for this login, so losing signal never locks the owner out;
 * with none saved yet it shows nothing.
 */
export async function realAccess(client: OdooClient): Promise<Access> {
  const seen = { answered: false };
  const held = async (groups: string[]) => {
    for (const g of groups) if (await inGroup(client, g, seen)) return true;
    return false;
  };
  const owner = (await held(OWNER_GROUPS)) || (typeof client.inAnyGroup === 'function' && (await client.inAnyGroup(OWNER_GROUPS).catch(() => false)));
  let access: Access;
  if (owner) {
    access = { warehouse: true, purchasing: true, pricing: true, dispatch: true, office: true, sales: true, owner: true };
  } else {
    const [warehouse, purchasing, buyManager, salesManager, dispatch, office] = await Promise.all([held(ROLE_GROUPS.warehouse), held(ROLE_GROUPS.purchasing), held(ROLE_GROUPS.pricing), inGroup(client, 'sales_team.group_sale_manager', seen), held(ROLE_GROUPS.dispatch), held(ROLE_GROUPS.office)]);
    access = { warehouse, purchasing: purchasing || buyManager, pricing: buyManager && salesManager, dispatch, office, sales: salesManager, owner: false };
  }
  if (!seen.answered && !owner) return (await readCache(client)) ?? access;
  if (seen.answered || owner) AsyncStorage.setItem(cacheKey(client), JSON.stringify(access)).catch(() => undefined);
  return access;
}

/** What each role the Developer screen can imitate may open. Fixed here, never read from or written to Odoo. */
export function previewAccess(p: NonNullable<ReturnType<typeof rolePreview>>): Access {
  const none = { ...NO_ACCESS };
  switch (p) {
    case 'owner':
      return { warehouse: true, purchasing: true, pricing: true, dispatch: true, office: true, sales: true, owner: true };
    case 'dispatcher':
      return { ...none, dispatch: true };
    case 'office':
      return { ...none, office: true };
    case 'sales':
      return { ...none, sales: true };
    case 'warehouse':
      return { ...none, warehouse: true };
    case 'buyer':
      return { ...none, purchasing: true };
    default:
      return none;
  }
}

/** The access to act on: the real one, or the imitated role's while Developer > Look at the app as is on. */
export async function departmentAccess(client: OdooClient): Promise<Access> {
  const p = rolePreview();
  if (p) return previewAccess(p);
  return realAccess(client);
}

/** Count differences that need a note before they are applied: more than 5 units, or 20 percent of what was expected. */
export const BIG_DIFF = { units: 5, percent: 20 };

export function isBigDifference(expected: number, counted: number, rule = BIG_DIFF): boolean {
  const d = Math.abs(counted - expected);
  if (d === 0) return false;
  if (d > rule.units) return true;
  return expected > 0 && (d / expected) * 100 > rule.percent;
}

// ---- Locations ----

export interface Place {
  id: number;
  name: string;
  /** A truck: its name has "truck" in it. */
  truck: boolean;
}

/** Every internal Inventory location a person can count: the warehouse stock location and the trucks, warehouse first. */
export async function listPlaces(client: OdooClient): Promise<Place[]> {
  const rows = (await client.call('stock.location', 'search_read', [[['usage', '=', 'internal']]], { fields: ['name', 'complete_name', 'warehouse_id', 'location_id'], order: 'complete_name asc', limit: 300 })) as Record<string, unknown>[];
  const out: Place[] = rows.map((r) => {
    const name = str(r.complete_name) || str(r.name);
    return { id: r.id as number, name, truck: /truck/i.test(name) };
  });
  // Warehouse stock locations (usually "WH/Stock") first, then trucks, then the rest.
  const rank = (p: Place) => (p.truck ? 1 : /(^|\/)stock$/i.test(p.name) ? 0 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export interface CountLine extends StockProduct {
  qty: number;
  min?: number;
  max?: number;
  /** The last time Odoo counted it here, if known. */
  countedAt?: number;
}

const odooMs = (v: unknown) => {
  if (typeof v !== 'string' || !v) return undefined;
  const t = Date.parse(v.includes('T') ? v : `${v.replace(' ', 'T')}Z`);
  return Number.isNaN(t) ? undefined : t;
};

/** What Odoo has on a location (and its sub-locations), by product, with the replenishment rule and last count where there is one. */
export async function readPlace(client: OdooClient, locationId: number): Promise<CountLine[]> {
  const fields = (await client.call('stock.quant', 'fields_get', [], { attributes: ['type'] }).catch(() => ({}))) as Record<string, unknown>;
  const quants = (await client.call('stock.quant', 'search_read', [[['location_id', 'child_of', locationId]]], { fields: ['product_id', 'quantity', ...('last_count_date' in fields ? ['last_count_date'] : [])], limit: 5000 })) as Record<string, unknown>[];
  let rules: Record<string, unknown>[] = [];
  try {
    rules = (await client.call('stock.warehouse.orderpoint', 'search_read', [[['location_id', 'child_of', locationId]]], { fields: ['product_id', 'product_min_qty', 'product_max_qty'], limit: 2000 })) as Record<string, unknown>[];
  } catch {
    // No replenishment rules readable here.
  }
  const qty = new Map<number, number>();
  const counted = new Map<number, number>();
  for (const q of quants) {
    const p = m2o(q.product_id)?.[0];
    if (!p) continue;
    qty.set(p, (qty.get(p) ?? 0) + num(q.quantity));
    const at = odooMs(q.last_count_date);
    if (at) counted.set(p, Math.max(counted.get(p) ?? 0, at));
  }
  const rule = new Map<number, { min: number; max: number }>();
  for (const r of rules) {
    const p = m2o(r.product_id)?.[0];
    if (p) rule.set(p, { min: num(r.product_min_qty), max: num(r.product_max_qty) });
  }
  const ids = [...new Set([...qty.keys(), ...rule.keys()])];
  const products = await readProducts(client, ids);
  return products
    .map((p) => ({ ...p, qty: Math.round((qty.get(p.id) ?? 0) * 100) / 100, ...(rule.get(p.id) ?? {}), ...(counted.has(p.id) ? { countedAt: counted.get(p.id) } : {}) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const isBelowMin = (l: { qty: number; min?: number }) => l.min !== undefined && l.min > 0 && l.qty < l.min;

export interface PlaceSummary {
  place: Place;
  parts: number;
  low: number;
  zero: number;
  lastCountedAt?: number;
}

/** One row per location for the overview: how many parts, how many are below minimum or at zero, and when it was last counted. */
export async function placeOverview(client: OdooClient, places?: Place[]): Promise<PlaceSummary[]> {
  const list = places ?? (await listPlaces(client));
  const out: PlaceSummary[] = [];
  for (const place of list) {
    try {
      const lines = await readPlace(client, place.id);
      const last = lines.reduce((n, l) => Math.max(n, l.countedAt ?? 0), 0);
      out.push({ place, parts: lines.length, low: lines.filter(isBelowMin).length, zero: lines.filter((l) => l.qty <= 0).length, ...(last ? { lastCountedAt: last } : {}) });
    } catch {
      out.push({ place, parts: 0, low: 0, zero: 0 });
    }
  }
  return out;
}

// ---- Counting ----

export interface CountEntry {
  productId: number;
  name: string;
  expected: number;
  counted: number;
  note?: string;
}

export interface CountResult {
  applied: { productId: number; name: string; from: number; to: number }[];
  problems: { productId: number; name: string; why: string }[];
}

/** What the adjustment is called in Odoo's history: "Cycle count, Nov 20, by Sam", and the note when there is one. */
export function countReason(by: string, now: number, note?: string): string {
  const d = new Date(now);
  const when = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Cycle count, ${when}, by ${by || 'the app'}${note?.trim() ? `: ${note.trim()}` : ''}`;
}

/**
 * Applies the counts a person has reviewed. Only products whose counted number
 * differs from what Odoo has are changed. A big difference without a note is
 * refused for that line (the screen asks for the note first). Each change is
 * an Odoo inventory adjustment named with the reason, so the history says who
 * and why. A refused line is reported and the rest still go.
 */
export async function applyCounts(client: OdooClient, locationId: number, entries: CountEntry[], by: string, now: number, rule = BIG_DIFF): Promise<CountResult> {
  const out: CountResult = { applied: [], problems: [] };
  for (const e of entries) {
    if (e.counted === e.expected) continue;
    if (isBigDifference(e.expected, e.counted, rule) && !e.note?.trim()) {
      out.problems.push({ productId: e.productId, name: e.name, why: 'A big difference needs a note first.' });
      continue;
    }
    try {
      await setTruckQty(client, locationId, e.productId, e.counted, countReason(by, now, e.note));
      out.applied.push({ productId: e.productId, name: e.name, from: e.expected, to: e.counted });
    } catch (err) {
      out.problems.push({ productId: e.productId, name: e.name, why: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

// ---- Transfers ----

export interface TransferLine {
  productId: number;
  name: string;
  qty: number;
}

export interface TransferResult {
  pickingId: number;
  name: string;
  /** False when Odoo wants a person to finish it (a question it asked), so it stays open there. */
  done: boolean;
}

/** The internal transfer operation type for the source's warehouse, else any internal one. */
async function internalType(client: OdooClient, fromId: number): Promise<number> {
  let warehouse: number | undefined;
  try {
    const [loc] = (await client.call('stock.location', 'read', [[fromId]], { fields: ['warehouse_id'] })) as { warehouse_id?: unknown }[];
    warehouse = m2o(loc?.warehouse_id)?.[0];
  } catch {
    // Any internal type will do.
  }
  const base: unknown[] = [['code', '=', 'internal']];
  if (warehouse) {
    const [id] = (await client.call('stock.picking.type', 'search', [[...base, ['warehouse_id', '=', warehouse]]], { limit: 1 })) as number[];
    if (id) return id;
  }
  const [id] = (await client.call('stock.picking.type', 'search', [base], { limit: 1 })) as number[];
  if (!id) throw new Error('Odoo has no internal transfer operation type.');
  return id;
}

/** The Source text of a transfer made here, so a retry after a lost connection finds it instead of moving the parts twice. */
export const transferOrigin = (key: string) => `Johnsons app transfer ${key}`;

/**
 * Moves parts from one location to another (warehouse to truck, truck to
 * truck) as a validated internal transfer, so Odoo's own history shows it.
 * `key` is one value per button press: the same key finds the same transfer.
 */
export async function transferStock(client: OdooClient, fromId: number, toId: number, lines: TransferLine[], key: string): Promise<TransferResult> {
  const wanted = lines.filter((l) => l.qty > 0);
  if (wanted.length === 0) throw new Error('Nothing to move.');
  if (fromId === toId) throw new Error('Pick two different places.');
  const origin = transferOrigin(key);
  const moveFields = (await client.call('stock.move', 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;
  const qtyField = 'quantity' in moveFields ? 'quantity' : 'quantity_done';
  let [pid] = (await client.call('stock.picking', 'search', [[['origin', '=', origin], ['state', '!=', 'cancel']]], { limit: 1 })) as number[];
  if (!pid) {
    const type = await internalType(client, fromId);
    const uoms = (await client.call('product.product', 'read', [wanted.map((l) => l.productId)], { fields: ['uom_id'] })) as { id: number; uom_id?: unknown }[];
    const uom = new Map(uoms.map((u) => [u.id, m2o(u.uom_id)?.[0]]));
    const move = (l: TransferLine) => [0, 0, { product_id: l.productId, product_uom_qty: l.qty, location_id: fromId, location_dest_id: toId, ...('name' in moveFields ? { name: l.name } : {}), ...('product_uom' in moveFields && uom.get(l.productId) ? { product_uom: uom.get(l.productId) } : {}) }];
    pid = (await client.call('stock.picking', 'create', [{ picking_type_id: type, location_id: fromId, location_dest_id: toId, origin, move_ids: wanted.map(move) }])) as number;
  }
  const [pick] = (await client.call('stock.picking', 'read', [[pid]], { fields: ['state', 'name'] })) as { state?: string; name?: string }[];
  const name = pick?.name || `#${pid}`;
  if (pick?.state === 'done') return { pickingId: pid, name, done: true };
  await client.call('stock.picking', 'action_confirm', [[pid]]);
  await client.call('stock.picking', 'action_assign', [[pid]]).catch(() => undefined);
  // Take exactly what was asked, even where the source's reservation fell short.
  const moves = (await client.call('stock.move', 'search_read', [[['picking_id', '=', pid]]], { fields: ['product_id'] })) as { id: number; product_id?: unknown }[];
  for (const m of moves) {
    const l = wanted.find((w) => w.productId === m2o(m.product_id)?.[0]);
    if (l) await client.call('stock.move', 'write', [[m.id], { [qtyField]: l.qty }]);
  }
  const r = await client.call('stock.picking', 'button_validate', [[pid]], { context: { skip_backorder: true, skip_immediate: true, skip_sms: true } });
  return { pickingId: pid, name, done: !(r && typeof r === 'object') };
}

// ---- Receiving ----

export interface ReceiptLine {
  moveId: number;
  productId: number;
  name: string;
  ordered: number;
}

export interface OpenReceipt {
  pickingId: number;
  name: string;
  vendor: string;
  /** The purchase order it belongs to, as Odoo names it (the Source). */
  origin: string;
  scheduled?: number;
  late: boolean;
  lines: ReceiptLine[];
  /** From the purchase order behind it, when Odoo lets the phone read it. */
  orderedBy?: string;
  forWhat?: string;
  totalCents?: number;
}

/** Receipts still waiting to come in (from confirmed purchase orders), oldest first. */
export async function openReceipts(client: OdooClient, now = Date.now()): Promise<OpenReceipt[]> {
  const picks = (await client.call('stock.picking', 'search_read', [[['picking_type_code', '=', 'incoming'], ['state', 'in', ['assigned', 'confirmed', 'waiting']]]], { fields: ['name', 'partner_id', 'origin', 'scheduled_date'], order: 'scheduled_date asc', limit: 100 })) as Record<string, unknown>[];
  if (picks.length === 0) return [];
  const moves = (await client.call('stock.move', 'search_read', [[['picking_id', 'in', picks.map((p) => p.id)]]], { fields: ['picking_id', 'product_id', 'product_uom_qty'] })) as Record<string, unknown>[];
  const info = await orderInfoByName(client, picks.map((p) => str(p.origin)));
  return picks.map((p) => {
    const at = odooMs(p.scheduled_date);
    const po = info.get(str(p.origin));
    return {
      pickingId: p.id as number,
      name: str(p.name),
      vendor: m2o(p.partner_id)?.[1] ?? '',
      origin: str(p.origin),
      ...(at ? { scheduled: at } : {}),
      late: !!at && at < now,
      ...(po ? { orderedBy: po.orderedBy, forWhat: po.forWhat, totalCents: po.totalCents } : {}),
      lines: moves
        .filter((m) => m2o(m.picking_id)?.[0] === p.id)
        .map((m) => ({ moveId: m.id as number, productId: m2o(m.product_id)?.[0] ?? 0, name: m2o(m.product_id)?.[1] ?? '', ordered: num(m.product_uom_qty) })),
    };
  });
}

/**
 * Receives what actually came: sets the received number on each line and
 * validates. Less than ordered leaves the rest as a backorder in Odoo (it is
 * not cancelled or forced). Receiving nothing on a line is fine.
 */
export async function receiveInto(client: OdooClient, pickingId: number, received: { moveId: number; qty: number }[]): Promise<{ done: boolean; short: number }> {
  const moveFields = (await client.call('stock.move', 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;
  const qtyField = 'quantity' in moveFields ? 'quantity' : 'quantity_done';
  let short = 0;
  const wanted = (await client.call('stock.move', 'read', [received.map((r) => r.moveId)], { fields: ['product_uom_qty'] })) as { id: number; product_uom_qty?: number }[];
  for (const r of received) {
    const ordered = wanted.find((w) => w.id === r.moveId)?.product_uom_qty ?? 0;
    if (r.qty < ordered) short++;
    await client.call('stock.move', 'write', [[r.moveId], { [qtyField]: Math.max(0, r.qty) }]);
  }
  const res = await client.call('stock.picking', 'button_validate', [[pickingId]], { context: { skip_backorder: true, skip_sms: true } });
  return { done: !(res && typeof res === 'object'), short };
}

// ---- Parts used on jobs ----

export interface JobUse {
  orderId: number;
  job: string;
  site: string;
  at: number;
  by: string;
  from: string;
  lines: { productId: number; name: string; qty: number }[];
}

/** Parts recorded on Field Service orders by the app (parts used delivered from a truck) since `since`, newest job first. */
export async function recentPartsUsed(client: OdooClient, since: number): Promise<JobUse[]> {
  let picks: Record<string, unknown>[];
  try {
    picks = (await client.call('stock.picking', 'search_read', [[['fsm_order_id', '!=', false], ['state', '=', 'done'], ['date_done', '>=', new Date(since).toISOString().slice(0, 19).replace('T', ' ')]]], { fields: ['fsm_order_id', 'location_id', 'date_done', 'create_uid', 'name'], order: 'date_done desc', limit: 300 })) as Record<string, unknown>[];
  } catch {
    // Field Service Stock isn't installed here.
    return [];
  }
  if (picks.length === 0) return [];
  const moves = (await client.call('stock.move', 'search_read', [[['picking_id', 'in', picks.map((p) => p.id)]]], { fields: ['picking_id', 'product_id', 'quantity', 'product_uom_qty'] })) as Record<string, unknown>[];
  const by = new Map<number, JobUse>();
  for (const p of picks) {
    const o = m2o(p.fsm_order_id);
    if (!o) continue;
    const row = by.get(o[0]) ?? { orderId: o[0], job: o[1], site: '', at: odooMs(p.date_done) ?? 0, by: m2o(p.create_uid)?.[1] ?? '', from: m2o(p.location_id)?.[1] ?? '', lines: [] };
    for (const m of moves.filter((x) => m2o(x.picking_id)?.[0] === p.id)) row.lines.push({ productId: m2o(m.product_id)?.[0] ?? 0, name: m2o(m.product_id)?.[1] ?? '', qty: num(m.quantity) || num(m.product_uom_qty) });
    by.set(o[0], row);
  }
  return [...by.values()].sort((a, b) => b.at - a.at);
}

export interface Attention {
  /** Jobs finished since `since` with no parts recorded. */
  noParts: { orderId: number; job: string }[];
  /** Truck stock below zero: parts used that the count never had. */
  negative: { place: string; name: string; qty: number }[];
}

/** What needs a look: closed jobs that have no parts recorded, and parts whose count is below zero somewhere. */
export async function needsAttention(client: OdooClient, since: number, used: JobUse[]): Promise<Attention> {
  const out: Attention = { noParts: [], negative: [] };
  const done = new Set(used.map((u) => u.orderId));
  try {
    const stamp = new Date(since).toISOString().slice(0, 19).replace('T', ' ');
    const orders = (await client.call('fsm.order', 'search_read', [[['stage_id.is_closed', '=', true], ['write_date', '>=', stamp]]], { fields: ['name'], limit: 200 })) as { id: number; name?: string }[];
    out.noParts = orders.filter((o) => !done.has(o.id)).map((o) => ({ orderId: o.id, job: str(o.name) || `#${o.id}` }));
  } catch {
    // No closed-stage field here: skip this list.
  }
  try {
    const q = (await client.call('stock.quant', 'search_read', [[['quantity', '<', 0], ['location_id.usage', '=', 'internal']]], { fields: ['product_id', 'location_id', 'quantity'], limit: 100 })) as Record<string, unknown>[];
    out.negative = q.map((r) => ({ place: m2o(r.location_id)?.[1] ?? '', name: m2o(r.product_id)?.[1] ?? '', qty: num(r.quantity) }));
  } catch {
    // Can't read stock.
  }
  return out;
}

// ---- Adjustment history ----

export interface Adjustment {
  id: number;
  at: number;
  by: string;
  product: string;
  from: string;
  to: string;
  qty: number;
  reference: string;
}

/** Odoo's stock history for inventory adjustments (counts), newest first, optionally for one person, place or part (a word in the name). */
export async function adjustmentLog(client: OdooClient, filter: { person?: string; place?: string; part?: string } = {}, limit = 100): Promise<Adjustment[]> {
  const domain: unknown[] = [['is_inventory', '=', true], ['state', '=', 'done']];
  if (filter.person?.trim()) domain.push(['create_uid.name', 'ilike', filter.person.trim()]);
  if (filter.part?.trim()) domain.push(['product_id.name', 'ilike', filter.part.trim()]);
  if (filter.place?.trim()) domain.push('|', ['location_id.complete_name', 'ilike', filter.place.trim()], ['location_dest_id.complete_name', 'ilike', filter.place.trim()]);
  const rows = (await client.call('stock.move.line', 'search_read', [domain], { fields: ['date', 'create_uid', 'product_id', 'location_id', 'location_dest_id', 'quantity', 'reference'], order: 'date desc', limit })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, at: odooMs(r.date) ?? 0, by: m2o(r.create_uid)?.[1] ?? '', product: m2o(r.product_id)?.[1] ?? '', from: m2o(r.location_id)?.[1] ?? '', to: m2o(r.location_dest_id)?.[1] ?? '', qty: num(r.quantity), reference: str(r.reference) }));
}

/** A one-line reading of an adjustment: "Added 3 to WH/Stock" or "Removed 2 from Truck - Sam". */
export function adjustmentText(a: Adjustment): string {
  const into = /inventory adjustment|virtual/i.test(a.from);
  return into ? `Added ${a.qty} to ${a.to}` : `Removed ${a.qty} from ${a.from}`;
}
