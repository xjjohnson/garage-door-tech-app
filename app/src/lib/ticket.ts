/**
 * A job's ticket: the running list of services and materials for the job,
 * built from the price book (or typed by hand) and changed any time until
 * the invoice is made. When signed in to Odoo it is kept as a draft
 * quotation (sale.order), so Odoo works out tax (on parts only) and any
 * discounts, and the phone shows Odoo's totals. Kept free of React so it can
 * be tested directly.
 */
import type { OdooClient } from './odoo';
import { lineValues, OdooRef, parseRef, serviceProduct } from './odooSales';
import type { PriceBookItem } from './priceBook';
import { cents as priceCents, OdooLink } from './prices';
import type { QuoteLine, QuoteOption } from './quote';

export type LineKind = 'service' | 'material';

export interface TicketLine {
  id: string;
  name: string;
  qty: number;
  /** Price each, in cents. */
  unitCents: number;
  kind: LineKind;
  /** The Odoo product, when it came from the price book or a linked price-sheet line. */
  productId?: number;
}

/** What Odoo worked out for the ticket's draft quotation. */
export interface TicketTotals {
  untaxed: number;
  tax: number;
  total: number;
  /** linesKey() of the lines these totals are for: stale once the lines change. */
  key: string;
  at: number;
}

export interface Ticket {
  lines: TicketLine[];
  /** The draft quotation in Odoo holding these lines. */
  order?: OdooRef;
  totals?: TicketTotals;
  /** The customer reference typed on the ticket; goes on the sales order and the invoice in Odoo. */
  ref?: string;
  /** When the ticket was saved as an estimate for the customer (its quotation in Odoo). */
  estimateAt?: number;
  /** The delivery address picked on the ticket (an address under the customer's Odoo contact); partner_shipping_id in Odoo. */
  shipTo?: ShipTo;
  /** Deposits taken before the work is done; they become the invoice's first payments at Create invoice. */
  deposits?: Deposit[];
}

/** A deposit taken on the ticket: the same shape as an invoice payment. */
export interface Deposit {
  id: string;
  method: 'cash' | 'check' | 'cashapp' | 'venmo' | 'zelle';
  /** Cents. */
  amount: number;
  at: number;
  reference: string;
}

const DEPOSIT_METHODS: Deposit['method'][] = ['cash', 'check', 'cashapp', 'venmo', 'zelle'];

export function parseDeposits(v: unknown): Deposit[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((d): Deposit[] => {
    const y = (d ?? {}) as Record<string, unknown>;
    if (typeof y.id !== 'string' || !DEPOSIT_METHODS.includes(y.method as Deposit['method']) || typeof y.amount !== 'number' || y.amount <= 0) return [];
    return [{ id: y.id, method: y.method as Deposit['method'], amount: Math.round(y.amount), at: typeof y.at === 'number' ? y.at : 0, reference: typeof y.reference === 'string' ? y.reference : '' }];
  });
}

/** What the deposits on the ticket add up to, in cents. */
export const depositTotal = (t: Pick<Ticket, 'deposits'> | undefined) => (t?.deposits ?? []).reduce((n, d) => n + d.amount, 0);

/** A delivery address: the Odoo contact id to use as partner_shipping_id, and its address for display. */
export interface ShipTo {
  id: number;
  address: string;
}

export function parseShipTo(v: unknown): ShipTo | undefined {
  const s = v as { id?: unknown; address?: unknown } | null;
  return s && typeof s.id === 'number' && s.id > 0 ? { id: s.id, address: typeof s.address === 'string' ? s.address : '' } : undefined;
}

/** A ticket material that is a part on the truck, and how many of it still have to come off the truck for the job. */
export interface TicketPart {
  itemId: string;
  name: string;
  qty: number;
}

/**
 * Parts used, filtered down from the ticket: each material on the ticket that
 * is a truck item (same Odoo product), less what was already taken off the
 * truck for this job by hand.
 */
export function ticketParts(t: Ticket | undefined, items: { id: string; name: string; odooId?: number }[], used: { itemId: string; qty: number; jobId?: string }[], jobId: string): TicketPart[] {
  if (!t) return [];
  const want = new Map<string, TicketPart>();
  for (const l of t.lines) {
    if (l.kind !== 'material' || !l.productId) continue;
    const item = items.find((i) => i.odooId === l.productId);
    if (!item) continue;
    const cur = want.get(item.id);
    want.set(item.id, { itemId: item.id, name: item.name, qty: (cur?.qty ?? 0) + l.qty });
  }
  return [...want.values()]
    .map((p) => ({ ...p, qty: p.qty - used.filter((u) => u.jobId === jobId && u.itemId === p.itemId).reduce((n, u) => n + u.qty, 0) }))
    .filter((p) => p.qty > 0);
}

/** The ticket's customer reference as typed; empty means none (Justin, Nov 13). */
export const ticketRef = (t: Ticket) => t.ref?.trim() ?? '';

export const EMPTY_TICKET: Ticket = { lines: [] };

export function newLineId(now: number, random: () => number = Math.random): string {
  return `t${now.toString(36)}${Math.floor(random() * 1e6).toString(36)}`;
}

export const lineTotal = (l: TicketLine) => Math.round(l.unitCents * l.qty);
export const subtotal = (t: Ticket) => t.lines.reduce((n, l) => n + lineTotal(l), 0);

/** A fingerprint of what Odoo needs to price: changes whenever a line does. */
export function linesKey(lines: TicketLine[]): string {
  return lines.map((l) => `${l.productId ?? ''}:${l.name}:${l.qty}:${l.unitCents}`).join('|');
}

/** Odoo's totals, if they are for the lines as they are now. */
export function currentTotals(t: Ticket): TicketTotals | undefined {
  return t.totals && t.totals.key === linesKey(t.lines) ? t.totals : undefined;
}

/**
 * The phone's own guess while Odoo hasn't priced the ticket: tax at the
 * price sheet's rate on materials only.
 */
export function estimateTotals(t: Ticket, taxPercent: string): { untaxed: number; tax: number; total: number } {
  const untaxed = subtotal(t);
  const rate = priceCents(taxPercent) / 10000;
  const tax = Math.round(t.lines.filter((l) => l.kind === 'material').reduce((n, l) => n + lineTotal(l), 0) * rate);
  return { untaxed, tax, total: untaxed + tax };
}

/** Adds a price-book item; the same product again just adds one to its count. */
export function addItem(t: Ticket, item: PriceBookItem, id: string): Ticket {
  const same = t.lines.find((l) => l.productId === item.id && l.unitCents === item.cents);
  if (same) return setQty(t, same.id, same.qty + 1);
  return { ...t, lines: [...t.lines, { id, name: item.name, qty: 1, unitCents: item.cents, kind: item.kind, productId: item.id }] };
}

export function addTyped(t: Ticket, line: { name: string; unitCents: number; kind: LineKind }, id: string): Ticket {
  return { ...t, lines: [...t.lines, { id, name: line.name.trim() || (line.kind === 'service' ? 'Service' : 'Material'), qty: 1, unitCents: Math.max(0, line.unitCents), kind: line.kind }] };
}

/** A count of 0 or less takes the line off. */
export function setQty(t: Ticket, id: string, qty: number): Ticket {
  if (qty <= 0) return removeLine(t, id);
  return { ...t, lines: t.lines.map((l) => (l.id === id ? { ...l, qty } : l)) };
}

export function setPrice(t: Ticket, id: string, unitCents: number): Ticket {
  return { ...t, lines: t.lines.map((l) => (l.id === id ? { ...l, unitCents: Math.max(0, Math.round(unitCents)) } : l)) };
}

export function removeLine(t: Ticket, id: string): Ticket {
  return { ...t, lines: t.lines.filter((l) => l.id !== id) };
}

/**
 * Puts an estimate option's lines on the ticket (after what's there). Lines
 * from the price sheet keep their Odoo product. Taxable lines are parts.
 */
export function addOption(t: Ticket, option: QuoteOption, links: Record<string, OdooLink>, ids: () => string): Ticket {
  const add = option.lines
    .filter((l) => l.cents > 0)
    .map((l): TicketLine => {
      const qty = l.qty && l.qty > 0 ? l.qty : 1;
      const productId = (l.key ? links[l.key]?.id : undefined) ?? l.productId;
      return { id: ids(), name: l.label, qty, unitCents: Math.round(l.cents / qty), kind: l.taxable ? 'material' : 'service', ...(productId ? { productId } : {}) };
    });
  return { ...t, lines: [...t.lines, ...add] };
}

/** The ticket's lines as quote lines, for the invoice and for Odoo. */
export function toQuoteLines(t: Ticket): QuoteLine[] {
  return t.lines.map((l) => ({ label: l.name, cents: lineTotal(l), taxable: l.kind === 'material', ...(l.qty !== 1 ? { qty: l.qty } : {}), ...(l.productId ? { productId: l.productId } : {}) }));
}

/** The ticket as one quote option, for making the invoice. Totals are Odoo's when current, else the phone's estimate. */
export function ticketOption(t: Ticket, taxPercent: string): QuoteOption {
  const totals = currentTotals(t) ?? estimateTotals(t, taxPercent);
  const lines = toQuoteLines(t);
  return { tier: 'good', title: 'Job ticket', available: true, springCount: 0, lines, subtotal: totals.untaxed, tax: totals.tax, total: totals.total };
}

const toCents = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) : 0);

/**
 * Keeps the ticket as a draft quotation in Odoo: makes it the first time,
 * then replaces its lines, and reads back Odoo's totals. A quotation that's
 * no longer a draft (confirmed or cancelled in Odoo) is left alone and a new
 * one is made.
 */
export async function syncTicket(client: OdooClient, partnerId: number, t: Ticket, ref: string, now: number): Promise<{ order: OdooRef; totals: TicketTotals }> {
  const lines = toQuoteLines(t);
  const needService = lines.some((l) => l.cents > 0 && !l.productId);
  const service = needService ? await serviceProduct(client) : 0;
  const vals = lineValues(lines, {}, () => service, 'product_uom_qty');
  let order = t.order;
  // The picked delivery address. Nothing picked: a new order gets the customer's own,
  // and an existing one keeps whatever Odoo has (it may have been set there by hand).
  const ship = t.shipTo ? { partner_shipping_id: t.shipTo.id } : {};
  if (order) {
    const [row] = (await client.call('sale.order', 'read', [[order.id]], { fields: ['state'] })) as { state?: string }[];
    if (row?.state !== 'draft' && row?.state !== 'sent') order = undefined;
  }
  if (order) {
    await client.call('sale.order', 'write', [[order.id], { client_order_ref: ref || false, ...ship, order_line: [[5, 0, 0], ...vals.map((v) => [0, 0, v])] }]);
  } else {
    const id = (await client.call('sale.order', 'create', [{ partner_id: partnerId, client_order_ref: ref || false, partner_shipping_id: partnerId, ...ship, order_line: vals.map((v) => [0, 0, v]) }])) as number;
    order = { id, name: `#${id}` };
  }
  const [r] = (await client.call('sale.order', 'read', [[order.id]], { fields: ['name', 'amount_untaxed', 'amount_tax', 'amount_total'] })) as Record<string, unknown>[];
  return {
    order: { id: order.id, name: typeof r?.name === 'string' ? r.name : order.name },
    totals: { untaxed: toCents(r?.amount_untaxed), tax: toCents(r?.amount_tax), total: toCents(r?.amount_total), key: linesKey(t.lines), at: now },
  };
}

/** Confirms the ticket's quotation, when making the invoice, so Odoo ties the invoice to it. */
export async function confirmTicket(client: OdooClient, order: OdooRef, ref?: string): Promise<void> {
  const [row] = (await client.call('sale.order', 'read', [[order.id]], { fields: ['state'] })) as { state?: string }[];
  if (row?.state !== 'draft' && row?.state !== 'sent') return;
  if (ref !== undefined) await client.call('sale.order', 'write', [[order.id], { client_order_ref: ref || false }]);
  await client.call('sale.order', 'action_confirm', [[order.id]]);
}

export function parseTicket(v: unknown): Ticket | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const d = v as Record<string, unknown>;
  const lines = Array.isArray(d.lines)
    ? d.lines.flatMap((x): TicketLine[] => {
        if (!x || typeof x !== 'object') return [];
        const l = x as Record<string, unknown>;
        if (typeof l.id !== 'string' || typeof l.name !== 'string') return [];
        return [
          {
            id: l.id,
            name: l.name,
            qty: typeof l.qty === 'number' && l.qty > 0 ? l.qty : 1,
            unitCents: typeof l.unitCents === 'number' && l.unitCents > 0 ? Math.round(l.unitCents) : 0,
            kind: l.kind === 'service' ? 'service' : 'material',
            ...(typeof l.productId === 'number' ? { productId: l.productId } : {}),
          },
        ];
      })
    : [];
  const order = parseRef(d.order);
  const t = d.totals as Record<string, unknown> | undefined;
  const totals =
    t && typeof t === 'object' && typeof t.key === 'string'
      ? { untaxed: Number(t.untaxed) || 0, tax: Number(t.tax) || 0, total: Number(t.total) || 0, key: t.key, at: Number(t.at) || 0 }
      : undefined;
  return { lines, ...(order ? { order } : {}), ...(totals ? { totals } : {}), ...(typeof d.ref === 'string' && d.ref ? { ref: d.ref } : {}), ...(typeof d.estimateAt === 'number' && d.estimateAt > 0 ? { estimateAt: d.estimateAt } : {}), ...(parseShipTo(d.shipTo) ? { shipTo: parseShipTo(d.shipTo) } : {}), ...(parseDeposits(d.deposits).length ? { deposits: parseDeposits(d.deposits) } : {}) };
}
