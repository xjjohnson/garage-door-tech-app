/**
 * A job's ticket: the running list of services and materials for the job,
 * built from the price book (or typed by hand) and changed any time until
 * the invoice is made. When signed in to Odoo it is kept as a draft
 * quotation (sale.order), so Odoo works out tax (on parts only) and any
 * discounts, and the phone shows Odoo's totals. Kept free of React so it can
 * be tested directly.
 */
import { Discount, discountKey, discountLineName, parseDiscount } from './discounts';
import type { OdooClient } from './odoo';
import { lineValues, OdooRef, parseRef, serviceProduct } from './odooSales';
import { termsNote } from './odooSettings';
import { At, AutoHeadings, findSame, hasSections, insertLine, orderLines, paymentsHeading, planHeading, signKey } from './ticketSections';
import type { PriceBookItem } from './priceBook';
import { cents as priceCents, formatMoney, OdooLink } from './prices';
import type { QuoteLine, QuoteOption } from './quote';

export type LineKind = 'service' | 'material' | 'note' | 'section';

/** A note or section heading: shown on the quotation in Odoo (display_type line_note / line_section), never priced. */
export const isText = (l: { kind: LineKind }) => l.kind === 'note' || l.kind === 'section';
/** Whether the ticket has anything to charge for. */
export const hasPriced = (t: Pick<Ticket, 'lines'>) => t.lines.some((l) => !isText(l));

export interface TicketLine {
  id: string;
  name: string;
  qty: number;
  /** Price each, in cents. */
  unitCents: number;
  kind: LineKind;
  /** The Odoo product, when it came from the price book or a linked price-sheet line. */
  productId?: number;
  /** The maintenance plan's fee line: put on and taken off with the plan, not edited by hand. */
  planFee?: boolean;
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
  /** The order was picked from Odoo when the job was made, not made by this ticket: once approved it is left alone, not replaced by a new quotation. */
  linked?: boolean;
  totals?: TicketTotals;
  /** A quick discount: a percent off every line (Odoo's line discount) or one negative Discount line. Odoo works out the totals. */
  discount?: Discount;
  /** The customer reference typed on the ticket; goes on the sales order and the invoice in Odoo. */
  ref?: string;
  /** When the ticket was saved as an estimate for the customer (its quotation in Odoo). */
  estimateAt?: number;
  /** The delivery address picked on the ticket (an address under the customer's Odoo contact); partner_shipping_id in Odoo. */
  shipTo?: ShipTo;
  /** Deposits taken before the work is done; they become the invoice's first payments at Create invoice. */
  deposits?: Deposit[];
  /** depositsKey of the deposits last written to the quotation in Odoo (as "Deposit received" lines). */
  depositsSaved?: string;
  /** Ticket material lines (by id) the tech bought for this job rather than took off the truck. */
  bought?: string[];
  /** Estimates: which estimate this is when a job holds several (src/lib/estimates.ts). Set once there is more than one. */
  id?: string;
  /** Estimates: the name shown in the list ("Good", "Replace the opener"). */
  title?: string;
  /** Estimates: when the customer picked this one. */
  pickedAt?: number;
  /** Estimates: when another one was picked and this one was declined (its quotation is cancelled in Odoo). */
  declinedAt?: number;
  /** Estimates: declined, but its quotation in Odoo still has to be cancelled (offline when it was declined). */
  cancelPending?: boolean;
  /** The customer's signature approving this estimate (0.8): saved on its quotation in Odoo. */
  signed?: EstimateSigned;
  /** A maintenance plan offered with this estimate. It is set up in Odoo once the customer accepts. */
  plan?: TicketPlan;
  /** planKey of the plan last written to the quotation in Odoo (as a note line). */
  planSaved?: string;
  /** Terms & Conditions on this quotation (and the invoice made from it). Off unless switched on; Odoo's own default is cleared when it is off. */
  terms?: boolean;
}

/** The plan as it was when picked: a copy, so a later change to the plan doesn't change what the customer was offered. */
export interface TicketPlan {
  id: number;
  name: string;
  description: string;
  everyMonths: number;
  visitsPerYear: number;
  daysAhead: number;
  jobTypeId?: number;
  termMonths: number;
  renews: boolean;
  priceCents: number;
  /** Set once the plan is made in Odoo (its agreement and repeating visit). */
  setUp?: { agreementId?: number; repeatId?: number; at: number };
  /** Why setting it up in Odoo failed, so the tech can try again. */
  setUpError?: string;
}

/** Fingerprint of the plan on a ticket, to tell when the quotation in Odoo needs it written again. */
export const planKey = (t: Pick<Ticket, 'plan'>) => (t.plan ? `${t.plan.id}:${t.plan.name}:${t.plan.priceCents}` : '');

/** Whether the plan is fully made in Odoo (a partly made one has `setUp.at` of 0 and carries on from where it stopped). */
export const planDone = (t: Pick<Ticket, 'plan'>): boolean => !!t.plan?.setUp && t.plan.setUp.at > 0;

/** How long a plan runs, in words: "12 months", "2 years", "ongoing". */
export const termText = (months: number) => (months === 0 ? 'ongoing' : months % 12 === 0 ? `${months / 12} year${months === 12 ? '' : 's'}` : `${months} months`);

/** The plan's fee as a service line, valid for the plan's term (untaxed: tax is on parts only). */
export const planFeeLine = (p: Pick<TicketPlan, 'name' | 'priceCents' | 'termMonths'>): TicketLine => ({ id: 'plan-fee', name: `${p.name} plan (${termText(p.termMonths)})`, qty: 1, unitCents: p.priceCents, kind: 'service', planFee: true });

/**
 * Puts a plan on the ticket, replacing any other; undefined takes it off. A plan
 * with a fee also puts its fee on the ticket as one service line, which goes
 * when the plan does. A plan with no charge adds no line.
 */
export function setPlan(t: Ticket, plan: TicketPlan | undefined): Ticket {
  const { plan: _old, ...rest } = t;
  const lines = rest.lines.filter((l) => !l.planFee);
  return plan ? { ...rest, plan, lines: plan.priceCents > 0 ? [...lines, planFeeLine(plan)] : lines } : { ...rest, lines };
}

/** What the quotation in Odoo says about the plan, as a note line (the fee, when there is one, is its own line). */
export function planLineNotes(t: Pick<Ticket, 'plan'>): Record<string, unknown>[] {
  if (!t.plan) return [];
  const p = t.plan;
  return [{ display_type: 'line_note', name: `Maintenance plan: ${p.name}${p.priceCents > 0 ? `, valid for ${termText(p.termMonths)} (the fee is the plan line above)` : ' (included, no charge)'}${p.description ? `. ${p.description}` : ''}` }];
}

/** A customer's signature on one estimate. `key` is linesKey of what they signed, so a changed estimate asks again. */
export interface EstimateSigned {
  /** The Signature (src/lib/attachments.ts) holding the drawing. */
  id: string;
  by: string;
  at: number;
  key: string;
  /** `<signature id>:<quotation id>` once saved on that quotation in Odoo. */
  sent?: string;
}

/** The estimate's signature, if the customer signed it as it is now. */
/** What a signature covers: the lines and the plan, so adding or changing a plan asks the customer again. */
export const signKeyOf = signKey;
/** Signatures made before 0.5.144 covered the lines in order; they still count while nothing has changed. */
const legacySignKey = (t: Pick<Ticket, 'lines' | 'plan'>) => linesKey(t.lines) + (t.plan ? `+plan:${t.plan.id}` : '');
export const signedNow = (t: Ticket): EstimateSigned | undefined => (t.signed && (t.signed.key === signKeyOf(t) || t.signed.key === legacySignKey(t)) ? t.signed : undefined);

/** Whether this signature still has to be saved on the estimate's quotation in Odoo. */
export const signaturePending = (t: Ticket): boolean => !!t.order && !!signedNow(t) && t.signed!.sent !== `${t.signed!.id}:${t.order.id}`;

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

const DEPOSIT_LABEL: Record<Deposit['method'], string> = { cash: 'cash', check: 'check', cashapp: 'Cash App', venmo: 'Venmo', zelle: 'Zelle' };

/** Which deposits are on the ticket, to tell when the quotation in Odoo needs them written again. */
export const depositsKey = (t: Pick<Ticket, 'deposits'> | undefined) => (t?.deposits ?? []).map((d) => `${d.id}:${d.amount}:${d.method}:${d.reference}`).join('|');

/**
 * The deposits as note lines on the job's quotation in Odoo, so they are kept
 * there and not only on the phone (Justin, Nov 13). Notes carry no price, so
 * the quotation's totals don't change; at Create invoice the deposits become
 * the invoice's first payments.
 */
export function depositNotes(t: Pick<Ticket, 'deposits'>): Record<string, unknown>[] {
  return (t.deposits ?? []).map((d) => ({
    display_type: 'line_note',
    name: `Deposit received: ${formatMoney(d.amount)} by ${DEPOSIT_LABEL[d.method]}${d.reference ? ` (${d.method === 'check' ? 'check #' : 'ref '}${d.reference})` : ''}${d.at ? `, ${new Date(d.at).toISOString().slice(0, 10)}` : ''}. Paid toward the invoice.`,
  }));
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

const onOrder = (itemId: string, purchases: { jobId?: string; receivedAt?: number; lines: { itemId: string }[] }[], jobId: string) =>
  purchases.some((po) => po.jobId === jobId && !po.receivedAt && po.lines.some((l) => l.itemId === itemId));

/** A ticket part that isn't accounted for yet: not a truck item, or ordered for the job and not in yet. */
export interface UnaccountedPart {
  lineId: string;
  name: string;
  qty: number;
  /** "ordered" when a purchase order for this job has it and it hasn't come in. */
  why: 'not-on-truck' | 'ordered';
}

/**
 * Ticket parts (materials from Odoo products) that Parts used can't account
 * for: not on the truck and not marked bought for the job, or ordered for the
 * job and not received yet. Create invoice waits until there are none, so
 * every part on the invoice is logged somewhere. Typed-in lines are left out.
 */
export function unaccountedParts(
  t: Ticket | undefined,
  items: { id: string; odooId?: number }[],
  jobId: string,
  purchases: { jobId?: string; receivedAt?: number; lines: { itemId: string }[] }[] = [],
): UnaccountedPart[] {
  if (!t) return [];
  return t.lines.flatMap((l): UnaccountedPart[] => {
    if (l.kind !== 'material' || !l.productId || t.bought?.includes(l.id)) return [];
    const item = items.find((i) => i.odooId === l.productId);
    if (!item) return [{ lineId: l.id, name: l.name, qty: l.qty, why: 'not-on-truck' }];
    return onOrder(item.id, purchases, jobId) ? [{ lineId: l.id, name: l.name, qty: l.qty, why: 'ordered' }] : [];
  });
}

/** Ticket lines marked bought for the job (not truck stock). */
export const boughtParts = (t: Ticket | undefined) => (t?.lines ?? []).filter((l) => t?.bought?.includes(l.id));

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
export function ticketParts(
  t: Ticket | undefined,
  items: { id: string; name: string; odooId?: number }[],
  used: { itemId: string; qty: number; jobId?: string }[],
  jobId: string,
  purchases: { jobId?: string; receivedAt?: number; lines: { itemId: string }[] }[] = [],
): TicketPart[] {
  if (!t) return [];
  const want = new Map<string, TicketPart>();
  for (const l of t.lines) {
    if (l.kind !== 'material' || !l.productId || t.bought?.includes(l.id)) continue;
    const item = items.find((i) => i.odooId === l.productId);
    if (!item || onOrder(item.id, purchases, jobId)) continue;
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
export function linesKey(lines: TicketLine[], discount?: Discount, terms?: boolean): string {
  const d = discountKey(discount);
  return lines.map((l) => (isText(l) ? `${l.kind}:${l.name}` : `${l.productId ?? ''}:${l.name}:${l.qty}:${l.unitCents}`)).join('|') + (d ? `#${d}` : '') + (terms === undefined ? '' : terms ? '~terms' : '~clean');
}

/** Odoo's totals, if they are for the lines and discount as they are now. */
export function currentTotals(t: Ticket): TicketTotals | undefined {
  return t.totals && t.totals.key === linesKey(t.lines, t.discount, t.terms) ? t.totals : undefined;
}

/**
 * The phone's own guess while Odoo hasn't priced the ticket: tax at the
 * price sheet's rate on materials only.
 */
export function estimateTotals(t: Ticket, taxPercent: string): { untaxed: number; tax: number; total: number } {
  const rate = priceCents(taxPercent) / 10000;
  // A percent off comes off every line, so it also lowers the taxed parts; a dollar amount off is an untaxed line.
  const keep = t.discount?.pct ? 1 - t.discount.pct / 100 : 1;
  const off = t.discount?.cents ?? 0;
  const untaxed = Math.round(subtotal(t) * keep) - off;
  const tax = Math.round(t.lines.filter((l) => l.kind === 'material').reduce((n, l) => n + lineTotal(l), 0) * keep * rate);
  return { untaxed, tax, total: untaxed + tax };
}

/**
 * Adds a price-book item at the end of a section (`at`, see ticketSections.ts; default the last one). The same
 * product again in the same section just adds one to its count; in another section it is its own line.
 */
export function addItem(t: Ticket, item: PriceBookItem, id: string, at?: At): Ticket {
  const same = findSame(t, item.id, item.cents, at);
  if (same) return setQty(t, same.id, same.qty + 1);
  return insertLine(t, { id, name: item.name, qty: 1, unitCents: item.cents, kind: item.kind, productId: item.id }, at);
}

export function addTyped(t: Ticket, line: { name: string; unitCents: number; kind: LineKind }, id: string, at?: At): Ticket {
  return insertLine(t, { id, name: line.name.trim() || (line.kind === 'service' ? 'Service' : 'Material'), qty: 1, unitCents: Math.max(0, line.unitCents), kind: line.kind }, at);
}

/** A count of 0 or less takes the line off. */
export function setQty(t: Ticket, id: string, qty: number): Ticket {
  if (qty <= 0) return removeLine(t, id);
  return { ...t, lines: t.lines.map((l) => (l.id === id ? { ...l, qty } : l)) };
}

export function setPrice(t: Ticket, id: string, unitCents: number): Ticket {
  return { ...t, lines: t.lines.map((l) => (l.id === id ? { ...l, unitCents: Math.max(0, Math.round(unitCents)) } : l)) };
}

/** Puts a quick discount on the ticket, replacing any other; undefined takes it off. */
/** Switches the Terms & Conditions on or off for this quotation. */
export function setTerms(t: Ticket, on: boolean): Ticket {
  return { ...t, terms: on };
}

export function setDiscount(t: Ticket, discount: Discount | undefined): Ticket {
  const { discount: _old, ...rest } = t;
  return discount ? { ...rest, discount } : rest;
}

/** Adds a note or a section heading (text only, no price) after what's there. */
export function addText(t: Ticket, kind: 'note' | 'section', text: string, id: string, at?: At): Ticket {
  const name = text.trim();
  return name ? insertLine(t, { id, name, qty: 1, unitCents: 0, kind }, at) : t;
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
    .filter((l) => l.cents > 0 || l.display)
    .map((l): TicketLine => {
      // A template's own section headings and notes come in as headings and notes, in place.
      if (l.display) return { id: ids(), name: l.label, qty: 1, unitCents: 0, kind: l.display };
      const qty = l.qty && l.qty > 0 ? l.qty : 1;
      const productId = (l.key ? links[l.key]?.id : undefined) ?? l.productId;
      return { id: ids(), name: l.label, qty, unitCents: Math.round(l.cents / qty), kind: l.taxable ? 'material' : 'service', ...(productId ? { productId } : {}) };
    });
  return { ...t, lines: [...t.lines, ...add] };
}

/** The ticket's lines as quote lines, for the invoice and for Odoo. */
export function toQuoteLines(t: Ticket): QuoteLine[] {
  const pct = t.discount?.pct;
  const lines = orderLines(t.lines).filter((l) => !isText(l)).map((l) => ({ label: l.name, cents: lineTotal(l), taxable: l.kind === 'material', ...(l.qty !== 1 ? { qty: l.qty } : {}), ...(l.productId ? { productId: l.productId } : {}), ...(pct ? { discountPct: pct } : {}) }));
  // A dollar discount is one negative service line (untaxed), after the others.
  return t.discount?.cents && lines.length > 0 ? [...lines, { label: discountLineName(t.discount), cents: -t.discount.cents, taxable: false }] : lines;
}

/**
 * The ticket's lines for the invoice: the same order as the estimate, with its section headings and notes in
 * place (and the automatic plan heading on a ticket with sections), so the invoice reads like the estimate.
 * Deposit and plan notes are left off: deposits become the invoice's payments.
 */
export function toInvoiceLines(t: Ticket, auto?: AutoHeadings): QuoteLine[] {
  const priced = toQuoteLines(t);
  if (!t.lines.some(isText)) return priced;
  const sectioned = hasSections(t.lines);
  let at = 0;
  const out: QuoteLine[] = [];
  for (const l of orderLines(t.lines)) {
    if (isText(l)) out.push({ label: l.name, cents: 0, taxable: false, display: l.kind === 'note' ? 'note' : 'section' });
    else {
      if (l.planFee && sectioned) out.push({ label: planHeading(auto), cents: 0, taxable: false, display: 'section' });
      const q = priced[at++];
      if (q) out.push(q);
    }
  }
  return [...out, ...priced.slice(at)];
}

/** The ticket as one quote option, for making the invoice. Totals are Odoo's when current, else the phone's estimate. */
export function ticketOption(t: Ticket, taxPercent: string, auto?: AutoHeadings): QuoteOption {
  const totals = currentTotals(t) ?? estimateTotals(t, taxPercent);
  const lines = toInvoiceLines(t, auto);
  return { tier: 'good', title: 'Job ticket', available: true, springCount: 0, lines, subtotal: totals.untaxed, tax: totals.tax, total: totals.total };
}

const toCents = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) : 0);

/**
 * Keeps the ticket as a draft quotation in Odoo: makes it the first time,
 * then replaces its lines, and reads back Odoo's totals. A quotation that's
 * no longer a draft (confirmed or cancelled in Odoo) is left alone and a new
 * one is made.
 */
/** Saves of the same estimate wait for each other, and a quotation made is remembered, so a slow save can't make a second one. */
const saving = new Map<string, Promise<unknown>>();

export async function syncTicket(client: OdooClient, partnerId: number, t: Ticket, ref: string, now: number, key?: string, auto?: AutoHeadings): Promise<{ order: OdooRef; totals: TicketTotals; depositsSaved: string; planSaved: string }> {
  if (!key) return syncTicketNow(client, partnerId, t, ref, now, auto);
  const prev = saving.get(key);
  const run = (async () => {
    const before = prev ? ((await prev.catch(() => undefined)) as { order?: OdooRef } | undefined) : undefined;
    // An earlier save of this estimate just made its quotation (the phone hadn't noted it yet): update that one.
    return syncTicketNow(client, partnerId, !t.order && before?.order ? { ...t, order: before.order } : t, ref, now, auto);
  })();
  saving.set(key, run);
  const done = () => void (saving.get(key) === run && saving.delete(key));
  run.then(done, done);
  return run;
}

async function syncTicketNow(client: OdooClient, partnerId: number, t: Ticket, ref: string, now: number, auto?: AutoHeadings): Promise<{ order: OdooRef; totals: TicketTotals; depositsSaved: string; planSaved: string }> {
  const lines = toQuoteLines(t);
  const needService = lines.some((l) => l.cents !== 0 && !l.productId);
  const service = needService ? await serviceProduct(client) : 0;
  // Notes and sections keep their place among the priced lines, so the quotation in Odoo reads the way the ticket does.
  const priced = lines;
  let at = 0;
  const body: Record<string, unknown>[] = [];
  // The plan fee sorts last. On a ticket with sections it gets its own heading, so it doesn't read as part of the last repair section.
  const sectioned = hasSections(t.lines);
  for (const l of orderLines(t.lines)) {
    if (l.planFee && sectioned) body.push({ display_type: 'line_section', name: planHeading(auto) });
    if (isText(l)) body.push({ display_type: l.kind === 'note' ? 'line_note' : 'line_section', name: l.name });
    else {
      const q = priced[at++];
      if (q) body.push(...lineValues([q], {}, () => service, 'product_uom_qty'));
    }
  }
  // A dollar discount is the last quote line, after the others.
  for (; at < priced.length; at++) body.push(...lineValues([priced[at]], {}, () => service, 'product_uom_qty'));
  // The plan note and the deposit notes go last; on a ticket with sections a closing heading keeps them apart from the repairs.
  const tail = [...planLineNotes(t), ...depositNotes(t)];
  const vals = [...body, ...(sectioned && tail.length ? [{ display_type: 'line_section', name: paymentsHeading(auto) }] : []), ...tail];
  let order = t.order;
  // The picked delivery address. Nothing picked: a new order gets the customer's own,
  // and an existing one keeps whatever Odoo has (it may have been set there by hand).
  const ship = t.shipTo ? { partner_shipping_id: t.shipTo.id } : {};
  let confirmed = false;
  if (order) {
    const [row] = (await client.call('sale.order', 'read', [[order.id]], { fields: ['state'] })) as { state?: string }[];
    // An approved order linked from an earlier job (see odooOpenOrders.ts) keeps its lines: Odoo won't let them be removed, and a second quotation would double it.
    if (t.linked && (row?.state === 'sale' || row?.state === 'done')) confirmed = true;
    else if (row?.state !== 'draft' && row?.state !== 'sent') order = undefined;
  }
  if (order && confirmed) {
    // Nothing to write; just read its totals back.
  } else if (order) {
    // The note (terms) is only touched once the switch has been used, so a note typed in Odoo isn't wiped by a plain save.
    const termsVals = t.terms === undefined ? {} : { note: t.terms ? (await termsNote(client)) || false : false };
    await client.call('sale.order', 'write', [[order.id], { client_order_ref: ref || false, ...ship, ...termsVals, order_line: [[5, 0, 0], ...vals.map((v) => [0, 0, v])] }]);
  } else {
    // Clean by default: an explicit empty note keeps Odoo's default terms off the new quotation. The switch on the ticket turns the terms on.
    const terms = t.terms ? await termsNote(client) : '';
    const id = (await client.call('sale.order', 'create', [{ partner_id: partnerId, client_order_ref: ref || false, partner_shipping_id: partnerId, ...ship, note: terms || false, order_line: vals.map((v) => [0, 0, v]) }])) as number;
    order = { id, name: `#${id}` };
  }
  const [r] = (await client.call('sale.order', 'read', [[order.id]], { fields: ['name', 'amount_untaxed', 'amount_tax', 'amount_total'] })) as Record<string, unknown>[];
  return {
    order: { id: order.id, name: typeof r?.name === 'string' ? r.name : order.name },
    totals: { untaxed: toCents(r?.amount_untaxed), tax: toCents(r?.amount_tax), total: toCents(r?.amount_total), key: linesKey(t.lines, t.discount, t.terms), at: now },
    depositsSaved: depositsKey(t),
    planSaved: planKey(t),
  };
}

/** Confirms the ticket's quotation, when making the invoice, so Odoo ties the invoice to it. */
export async function confirmTicket(client: OdooClient, order: OdooRef, ref?: string): Promise<void> {
  const [row] = (await client.call('sale.order', 'read', [[order.id]], { fields: ['state'] })) as { state?: string }[];
  if (row?.state !== 'draft' && row?.state !== 'sent') return;
  if (ref !== undefined) await client.call('sale.order', 'write', [[order.id], { client_order_ref: ref || false }]);
  await client.call('sale.order', 'action_confirm', [[order.id]]);
}

function parsePlan(v: unknown): TicketPlan | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const p = v as Record<string, unknown>;
  if (typeof p.id !== 'number' || typeof p.name !== 'string' || !p.name) return undefined;
  const n = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  const u = p.setUp as Record<string, unknown> | undefined;
  const setUp = u && typeof u === 'object' && (typeof u.agreementId === 'number' || typeof u.repeatId === 'number') ? { ...(typeof u.agreementId === 'number' ? { agreementId: u.agreementId } : {}), ...(typeof u.repeatId === 'number' ? { repeatId: u.repeatId } : {}), at: n(u.at, 0) } : undefined;
  return {
    id: p.id,
    name: p.name,
    description: typeof p.description === 'string' ? p.description : '',
    everyMonths: Math.max(1, n(p.everyMonths, 12)),
    visitsPerYear: Math.max(1, n(p.visitsPerYear, 1)),
    daysAhead: Math.max(0, n(p.daysAhead, 30)),
    ...(typeof p.jobTypeId === 'number' && p.jobTypeId > 0 ? { jobTypeId: p.jobTypeId } : {}),
    termMonths: Math.max(0, n(p.termMonths, 12)),
    renews: p.renews === true,
    priceCents: Math.max(0, Math.round(n(p.priceCents, 0))),
    ...(setUp ? { setUp } : {}),
    ...(typeof p.setUpError === 'string' && p.setUpError ? { setUpError: p.setUpError } : {}),
  };
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
            kind: l.kind === 'service' || l.kind === 'note' || l.kind === 'section' ? l.kind : 'material',
            ...(typeof l.productId === 'number' ? { productId: l.productId } : {}),
            ...(l.planFee === true ? { planFee: true } : {}),
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
  const str = (x: unknown) => (typeof x === 'string' && x ? x : undefined);
  const at = (x: unknown) => (typeof x === 'number' && x > 0 ? x : undefined);
  const sg = d.signed as Record<string, unknown> | undefined;
  const signed = sg && typeof sg === 'object' && str(sg.id) && at(sg.at) && typeof sg.key === 'string' ? { id: str(sg.id)!, by: typeof sg.by === 'string' ? sg.by : '', at: at(sg.at)!, key: sg.key, ...(str(sg.sent) ? { sent: str(sg.sent) } : {}) } : undefined;
  const plan = parsePlan(d.plan);
  return { lines, ...(signed ? { signed } : {}), ...(plan ? { plan } : {}), ...(typeof d.planSaved === 'string' && d.planSaved ? { planSaved: d.planSaved } : {}), ...(str(d.id) ? { id: str(d.id) } : {}), ...(str(d.title) ? { title: str(d.title) } : {}), ...(at(d.pickedAt) ? { pickedAt: at(d.pickedAt) } : {}), ...(at(d.declinedAt) ? { declinedAt: at(d.declinedAt) } : {}), ...(d.cancelPending === true ? { cancelPending: true } : {}), ...(order ? { order } : {}), ...(d.linked === true && order ? { linked: true } : {}), ...(totals ? { totals } : {}), ...(parseDiscount(d.discount) ? { discount: parseDiscount(d.discount) } : {}), ...(typeof d.ref === 'string' && d.ref ? { ref: d.ref } : {}), ...(typeof d.estimateAt === 'number' && d.estimateAt > 0 ? { estimateAt: d.estimateAt } : {}), ...(parseShipTo(d.shipTo) ? { shipTo: parseShipTo(d.shipTo) } : {}), ...(parseDeposits(d.deposits).length ? { deposits: parseDeposits(d.deposits) } : {}), ...(typeof d.depositsSaved === 'string' && d.depositsSaved ? { depositsSaved: d.depositsSaved } : {}), ...(Array.isArray(d.bought) && d.bought.some((x) => typeof x === 'string') ? { bought: d.bought.filter((x): x is string => typeof x === 'string') } : {}) };
}
