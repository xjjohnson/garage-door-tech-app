/**
 * What the Office and Sales areas read from Odoo: invoices that are late,
 * orders waiting to be invoiced, quotes waiting or gone quiet, callbacks,
 * complaints, warranty, plans about to renew, customers not seen in a while,
 * and the repairs flagged on inspections that were never sold. All reads;
 * the few writes (mark a quote lost, log a complaint) are one record each.
 * Money is cents. Kept free of React.
 */
import type { DeptLimits } from './deptLimits';
import type { OdooClient } from './odoo';
import { odooTime, toOdooTime } from './odoo';
import { completeActivity, createManualFollowUp } from './odooFollowUps';

type Client = Pick<OdooClient, 'call' | 'session'>;
type Row = Record<string, unknown>;

export const DAY_MS = 86_400_000;
const cents = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const m2o = (v: unknown): { id: number; name: string } | undefined => (Array.isArray(v) && typeof v[0] === 'number' ? { id: v[0], name: str(v[1]) } : undefined);
const dayOf = (ms: number) => toOdooTime(ms).slice(0, 10);
const rows = async (c: Client, model: string, domain: unknown[], fields: string[], opts: { order?: string; limit?: number } = {}): Promise<Row[]> => {
  const r = await c.call(model, 'search_read', [domain], { fields, limit: opts.limit ?? 200, ...(opts.order ? { order: opts.order } : {}) });
  return Array.isArray(r) ? (r as Row[]) : [];
};
const count = (c: Client, model: string, domain: unknown[]): Promise<number> => c.call(model, 'search_count', [domain]).then((n) => Number(n) || 0, () => 0);
/** A day from an Odoo date ("2026-11-17") at noon, so time zones never move it a day. */
const dateOnly = (v: unknown): number | undefined => {
  const s = str(v).slice(0, 10);
  if (s.length < 10) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
};

// ---- Rows the pages draw ----

export interface MoneyRow {
  /** The Odoo record: an invoice (account.move) or a quotation or order (sale.order). */
  model: 'account.move' | 'sale.order';
  id: number;
  name: string;
  partnerId: number;
  customer: string;
  /** Cents: what is owed (an invoice) or the order total. */
  cents: number;
  /** Invoices: days past due. Quotes and orders: days since the last change. */
  days: number;
  /** "9 days late", "Sent 5 days ago". */
  text: string;
  ref?: string;
  phone: string;
}

const daysBetween = (from: number, to: number) => Math.max(0, Math.floor((to - from) / DAY_MS));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function toInvoiceRow(r: Row, now: number): MoneyRow {
  const p = m2o(r.partner_id);
  const due = dateOnly(r.invoice_date_due);
  const late = due !== undefined ? daysBetween(due, now) : 0;
  return { model: 'account.move', id: r.id as number, name: str(r.name), partnerId: p?.id ?? 0, customer: p?.name ?? '', cents: cents(r.amount_residual), days: late, text: due === undefined ? 'No due date' : late > 0 ? `${plural(late, 'day')} late` : 'Not due yet', ...(str(r.ref) ? { ref: str(r.ref) } : {}), phone: '' };
}

function toOrderRow(r: Row, now: number, what: string): MoneyRow {
  const p = m2o(r.partner_id);
  const at = odooTime(r.write_date) ?? odooTime(r.date_order) ?? now;
  const d = daysBetween(at, now);
  return { model: 'sale.order', id: r.id as number, name: str(r.name), partnerId: p?.id ?? 0, customer: p?.name ?? '', cents: cents(r.amount_total), days: d, text: `${what} ${d === 0 ? 'today' : `${plural(d, 'day')} ago`}`, ...(str(r.client_order_ref) ? { ref: str(r.client_order_ref) } : {}), phone: '' };
}

/** Fills in each row's phone from the customer's contact. A phone Odoo won't show stays empty. */
export async function withPhones(c: Client, list: MoneyRow[]): Promise<MoneyRow[]> {
  const ids = [...new Set(list.map((r) => r.partnerId).filter(Boolean))];
  if (!ids.length) return list;
  const found = (await c.call('res.partner', 'read', [ids], { fields: ['phone'] }).catch(() => [])) as Row[];
  const phone = new Map(found.map((p) => [p.id as number, str(p.phone)]));
  return list.map((r) => ({ ...r, phone: phone.get(r.partnerId) ?? '' }));
}

const INVOICE_FIELDS = ['name', 'partner_id', 'amount_residual', 'invoice_date_due', 'ref'];
const ORDER_FIELDS = ['name', 'partner_id', 'amount_total', 'write_date', 'date_order', 'client_order_ref'];
const OWED = [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['payment_state', 'in', ['not_paid', 'partial']]];

/** The last day an invoice may be due and still count as late today. */
export const lateCutoff = (limits: DeptLimits, now: number) => dayOf(now - limits.lateInvoiceDays * DAY_MS);
/** Quotes untouched since before this are quiet. */
export const quietCutoff = (limits: DeptLimits, now: number) => toOdooTime(now - limits.quoteQuietDays * DAY_MS);

export async function overdueInvoices(c: Client, limits: DeptLimits, now: number): Promise<MoneyRow[]> {
  const r = await rows(c, 'account.move', [...OWED, ['invoice_date_due', '<=', lateCutoff(limits, now)]], INVOICE_FIELDS, { order: 'invoice_date_due asc' });
  return withPhones(c, r.map((x) => toInvoiceRow(x, now)));
}

export async function unpaidInvoices(c: Client, now: number): Promise<MoneyRow[]> {
  const r = await rows(c, 'account.move', OWED, INVOICE_FIELDS, { order: 'invoice_date_due asc', limit: 300 });
  return withPhones(c, r.map((x) => toInvoiceRow(x, now)));
}

/** Approved orders Odoo says still have something to invoice. */
export async function ordersToInvoice(c: Client, limits: DeptLimits, now: number): Promise<MoneyRow[]> {
  const r = await rows(c, 'sale.order', [['state', '=', 'sale'], ['invoice_status', '=', 'to invoice'], ['date_order', '>=', toOdooTime(now - limits.invoiceLookbackDays * DAY_MS)]], ORDER_FIELDS, { order: 'date_order asc' });
  return withPhones(c, r.map((x) => toOrderRow(x, now, 'Approved')));
}

export async function quotesWaiting(c: Client, now: number): Promise<MoneyRow[]> {
  const r = await rows(c, 'sale.order', [['state', '=', 'sent']], ORDER_FIELDS, { order: 'write_date asc', limit: 200 });
  return withPhones(c, r.map((x) => toOrderRow(x, now, 'Sent')));
}

export async function quotesQuiet(c: Client, limits: DeptLimits, now: number): Promise<MoneyRow[]> {
  const r = await rows(c, 'sale.order', [['state', '=', 'sent'], ['write_date', '<', quietCutoff(limits, now)]], ORDER_FIELDS, { order: 'write_date asc', limit: 200 });
  return withPhones(c, r.map((x) => toOrderRow(x, now, 'Sent')));
}

export async function wonThisMonth(c: Client, now: number): Promise<MoneyRow[]> {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const r = await rows(c, 'sale.order', [['state', 'in', ['sale', 'done']], ['date_order', '>=', toOdooTime(start)]], ORDER_FIELDS, { order: 'date_order desc', limit: 200 });
  return r.map((x) => toOrderRow(x, now, 'Approved'));
}

// ---- Red numbers (counts only) ----

export interface OfficeCounts {
  notInvoiced: number;
  overdue: number;
  quotesWaiting: number;
}
export interface SalesCounts {
  quiet: number;
  followUps: number;
  renewals: number;
  flagged: number;
}

export async function officeCounts(c: Client, limits: DeptLimits, now: number): Promise<OfficeCounts> {
  const [notInvoiced, overdue, waiting] = await Promise.all([
    count(c, 'sale.order', [['state', '=', 'sale'], ['invoice_status', '=', 'to invoice'], ['date_order', '>=', toOdooTime(now - limits.invoiceLookbackDays * DAY_MS)]]),
    count(c, 'account.move', [...OWED, ['invoice_date_due', '<=', lateCutoff(limits, now)]]),
    count(c, 'sale.order', [['state', '=', 'sent']]),
  ]);
  return { notInvoiced, overdue, quotesWaiting: waiting };
}

export async function salesCounts(c: Client, limits: DeptLimits, now: number): Promise<SalesCounts> {
  const [quiet, followUps, flagged, renewals] = await Promise.all([
    count(c, 'sale.order', [['state', '=', 'sent'], ['write_date', '<', quietCutoff(limits, now)]]),
    count(c, 'mail.activity', [['res_model', '=', 'res.partner'], ['date_deadline', '<=', dayOf(now)], ['summary', 'not ilike', 'Complaint:'], ['summary', 'not ilike', REPAIR]]),
    count(c, 'mail.activity', [['res_model', '=', 'res.partner'], ['summary', 'ilike', REPAIR]]),
    plansAboutToRenew(c, limits, now).then((l) => l.length, () => 0),
  ]);
  return { quiet, followUps, renewals, flagged };
}

// ---- Marking a quote lost ----

export const LOST_REASONS = ['Too expensive', 'Went elsewhere', 'Not now', 'No answer', 'Other'] as const;
export const LOST_PREFIX = 'Lost:';

/** The reason a quote was lost, from the note Mark lost wrote, or undefined for a note that isn't one. */
export function lostReason(body: string): string | undefined {
  const text = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const m = /^Lost:\s*(.+?)(?:\s+johnsons-lost)?$/.exec(text);
  return m ? m[1]!.trim() : undefined;
}

/** Writes the reason on the quote and cancels it, the way Odoo's own Cancel does. */
export async function markLost(c: Client, orderId: number, reason: string): Promise<void> {
  if (!LOST_REASONS.includes(reason as (typeof LOST_REASONS)[number])) throw new Error('Pick a reason first.');
  await c.call('sale.order', 'message_post', [[orderId]], { body: `<p>${LOST_PREFIX} ${reason} <small>johnsons-lost</small></p>`, message_type: 'comment', subtype_xmlid: 'mail.mt_note' });
  await c.call('sale.order', 'action_cancel', [[orderId]], { context: { disable_cancel_warning: true } });
}

export interface LostRow {
  orderId: number;
  name: string;
  customer: string;
  reason: string;
  at?: number;
}

/** Quotes lost since the reasons were being written, newest first. Cancelled quotes with no note are not listed. */
export async function lostQuotes(c: Client): Promise<LostRow[]> {
  const notes = await rows(c, 'mail.message', [['model', '=', 'sale.order'], ['body', 'ilike', 'johnsons-lost']], ['res_id', 'body', 'date'], { order: 'date desc', limit: 200 });
  const ids = notes.map((n) => n.res_id as number);
  const orders = ids.length ? await rows(c, 'sale.order', [['id', 'in', ids], ['state', '=', 'cancel']], ['name', 'partner_id'], { limit: 200 }) : [];
  const by = new Map(orders.map((o) => [o.id as number, o]));
  return notes.flatMap((n): LostRow[] => {
    const o = by.get(n.res_id as number);
    const reason = lostReason(str(n.body));
    return o && reason ? [{ orderId: o.id as number, name: str(o.name), customer: m2o(o.partner_id)?.name ?? '', reason, ...(odooTime(n.date) !== undefined ? { at: odooTime(n.date) } : {}) }] : [];
  });
}

/** How many quotes were lost for each reason, most first. */
export function lostByReason(list: LostRow[]): { reason: string; count: number }[] {
  const m = new Map<string, number>();
  for (const l of list) m.set(l.reason, (m.get(l.reason) ?? 0) + 1);
  return [...m.entries()].map(([reason, n]) => ({ reason, count: n })).sort((a, b) => b.count - a.count);
}

// ---- Activities: follow-ups, complaints, repairs not sold ----

export const COMPLAINT = 'Complaint:';
export const REPAIR = 'Offer repair:';

export interface ActivityRow {
  id: number;
  partnerId: number;
  customer: string;
  summary: string;
  due?: number;
  who: string;
}

const toActivity = (r: Row): ActivityRow => ({ id: r.id as number, partnerId: (r.res_id as number) ?? 0, customer: str(r.res_name), summary: str(r.summary), ...(dateOnly(r.date_deadline) !== undefined ? { due: dateOnly(r.date_deadline) } : {}), who: m2o(r.user_id)?.name ?? '' });
const ACT_FIELDS = ['res_id', 'res_name', 'summary', 'date_deadline', 'user_id'];

async function activities(c: Client, domain: unknown[], limit = 100): Promise<ActivityRow[]> {
  return (await rows(c, 'mail.activity', [['res_model', '=', 'res.partner'], ...domain], ACT_FIELDS, { order: 'date_deadline asc', limit })).map(toActivity);
}

/** Follow-up calls due today or earlier (complaints and repairs not sold have their own pages). */
export const followUpsDue = (c: Client, now: number) => activities(c, [['date_deadline', '<=', dayOf(now)], ['summary', 'not ilike', COMPLAINT], ['summary', 'not ilike', REPAIR]]);
export const openComplaints = (c: Client) => activities(c, [['summary', 'ilike', COMPLAINT]]);
export const flaggedRepairs = (c: Client) => activities(c, [['summary', 'ilike', REPAIR]]);
export const finishActivity = completeActivity;

/** A complaint is a to-do on the customer's contact whose title starts "Complaint:". */
export function logComplaint(c: Client, partnerId: number, text: string, due: number): Promise<number> {
  if (!text.trim()) throw new Error('Type what the complaint is.');
  return createManualFollowUp(c, partnerId, { title: `${COMPLAINT} ${text.trim().slice(0, 80)}`, note: text.trim(), due });
}

/** Customers matching what was typed, for picking one. */
export async function findCustomers(c: Client, term: string): Promise<{ id: number; name: string }[]> {
  const t = term.trim();
  if (t.length < 2) return [];
  const r = (await c.call('res.partner', 'name_search', [t], { limit: 8 })) as [number, string][];
  return Array.isArray(r) ? r.map(([id, name]) => ({ id, name })) : [];
}

// ---- Callbacks: the same house again soon ----

export interface JobVisit {
  id: number;
  name: string;
  place: number;
  placeName: string;
  tech: string;
  at: number;
}
export interface Callback {
  first: JobVisit;
  again: JobVisit;
  gapDays: number;
}

/** Pairs of visits to one house within `days` of each other, the later one being the callback. Newest callback first. */
export function callbacks(visits: JobVisit[], days: number): Callback[] {
  const byPlace = new Map<number, JobVisit[]>();
  for (const v of visits) byPlace.set(v.place, [...(byPlace.get(v.place) ?? []), v]);
  const out: Callback[] = [];
  for (const list of byPlace.values()) {
    const s = [...list].sort((a, b) => a.at - b.at);
    for (let i = 1; i < s.length; i++) {
      const gap = (s[i]!.at - s[i - 1]!.at) / DAY_MS;
      if (gap <= days) out.push({ first: s[i - 1]!, again: s[i]!, gapDays: Math.round(gap) });
    }
  }
  return out.sort((a, b) => b.again.at - a.again.at);
}

/** Field Service jobs (done or planned) since a date, as visits. */
export async function readVisits(c: Client, since: number): Promise<JobVisit[]> {
  const fields = c.session.fields ?? [];
  const when = fields.includes('date_end') ? 'date_end' : fields.includes('scheduled_date_start') ? 'scheduled_date_start' : 'create_date';
  const r = await rows(c, 'fsm.order', [[when, '>=', toOdooTime(since)]], ['name', 'location_id', 'person_id', when], { order: `${when} desc`, limit: 3000 });
  return r.flatMap((x): JobVisit[] => {
    const l = m2o(x.location_id);
    const at = odooTime(x[when]);
    return l && at !== undefined ? [{ id: x.id as number, name: str(x.name), place: l.id, placeName: l.name, tech: m2o(x.person_id)?.name ?? '', at }] : [];
  });
}

/** Customers whose newest visit is older than `cutoff`, oldest last visit first. */
export function notSeen(visits: JobVisit[], cutoff: number): JobVisit[] {
  const latest = new Map<number, JobVisit>();
  for (const v of visits) if (!latest.has(v.place) || v.at > latest.get(v.place)!.at) latest.set(v.place, v);
  return [...latest.values()].filter((v) => v.at < cutoff).sort((a, b) => a.at - b.at);
}

/** Months back from a date, for the "not seen" cutoff. */
export function monthsAgo(now: number, months: number): number {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d.getTime();
}

// ---- Warranty: who is covered, and until when ----

export interface Covered {
  equipmentId: number;
  name: string;
  customer: string;
  partsUntil?: number;
  laborUntil?: number;
  /** The later of the two end dates. */
  until: number;
}

const MONTH = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** The "Warranty on parts until Nov 2, 2028" lines the app writes into equipment notes, as dates. */
export function parseWarranty(notes: string): { partsUntil?: number; laborUntil?: number } {
  const text = notes.replace(/<\/p>\s*<p>/g, '\n').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '');
  const out: { partsUntil?: number; laborUntil?: number } = {};
  for (const m of text.matchAll(/Warranty on (parts|labor) until ([A-Za-z]{3,9})\.? (\d{1,2}), (\d{4})/g)) {
    const mi = MONTH.indexOf(m[2]!.slice(0, 3).toLowerCase());
    if (mi < 0) continue;
    const at = new Date(Number(m[4]), mi, Number(m[3]), 12).getTime();
    if (m[1] === 'parts') out.partsUntil = at;
    else out.laborUntil = at;
  }
  return out;
}

/** Equipment still under warranty today, soonest ending first. */
export function coveredNow(items: { equipmentId: number; name: string; customer: string; notes: string }[], now: number): Covered[] {
  const today = new Date(now).setHours(0, 0, 0, 0);
  return items
    .flatMap((i): Covered[] => {
      const w = parseWarranty(i.notes);
      const ends = [w.partsUntil, w.laborUntil].filter((x): x is number => x !== undefined);
      const until = ends.length ? Math.max(...ends) : 0;
      return until >= today ? [{ equipmentId: i.equipmentId, name: i.name, customer: i.customer, ...w, until }] : [];
    })
    .sort((a, b) => a.until - b.until);
}

export async function warrantyList(c: Client, now: number): Promise<Covered[]> {
  const r = await rows(c, 'fsm.equipment', [['notes', 'ilike', 'Warranty on']], ['name', 'notes', 'location_id'], { limit: 1000 });
  return coveredNow(r.map((x) => ({ equipmentId: x.id as number, name: str(x.name), customer: m2o(x.location_id)?.name ?? '', notes: str(x.notes) })), now);
}

// ---- Plans about to renew ----

export interface PlanEnd {
  id: number;
  name: string;
  customer: string;
  partnerId: number;
  endsAt: number;
}

/** Customer maintenance plans (agreements) ending within the renew window. */
export async function plansAboutToRenew(c: Client, limits: DeptLimits, now: number): Promise<PlanEnd[]> {
  const today = dayOf(now);
  const until = dayOf(now + limits.planRenewDays * DAY_MS);
  // Plans the app set up say "Maintenance plan: <name>." at the start of their description.
  const base = [['end_date', '>=', today], ['end_date', '<=', until], ['description', 'ilike', 'Maintenance plan']];
  let r: Row[];
  try {
    r = await rows(c, 'agreement', [...base, ['is_template', '=', false]], ['name', 'partner_id', 'end_date'], { order: 'end_date asc' });
  } catch {
    r = await rows(c, 'agreement', base, ['name', 'partner_id', 'end_date'], { order: 'end_date asc' });
  }
  return r.flatMap((x): PlanEnd[] => {
    const e = dateOnly(x.end_date);
    const p = m2o(x.partner_id);
    return e !== undefined && p ? [{ id: x.id as number, name: str(x.name), customer: p.name, partnerId: p.id, endsAt: e }] : [];
  });
}
