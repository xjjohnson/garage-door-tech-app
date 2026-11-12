/**
 * Odoo's own Quotations and Invoices lists, as the Sales and Invoicing apps
 * show them: every sale.order and every customer invoice or credit note, not
 * only the ones made on this phone. Read-only here, apart from emailing a
 * record with Odoo's own template. Kept free of React; the client is passed
 * in, so tests use a fake.
 */
import type { OdooClient } from './odoo';
import { odooTime } from './odoo';

type Client = Pick<OdooClient, 'call'>;

export type ListKind = 'quotations' | 'invoices';
export type RecordModel = 'sale.order' | 'account.move';

export const MODEL: Record<ListKind, RecordModel> = { quotations: 'sale.order', invoices: 'account.move' };

/** The filter chips over each list. */
export const FILTERS = {
  quotations: [
    { value: 'all', label: 'All' },
    { value: 'quotes', label: 'Quotations' },
    { value: 'orders', label: 'Sales orders' },
  ],
  invoices: [
    { value: 'all', label: 'All' },
    { value: 'unpaid', label: 'Not paid' },
    { value: 'paid', label: 'Paid' },
    { value: 'draft', label: 'Draft' },
  ],
} as const;

export type ListFilter = (typeof FILTERS)[ListKind][number]['value'];

/** One row of a list. Money in cents. */
export interface OdooListRow {
  id: number;
  /** "S00055", "INV/2026/00012". */
  name: string;
  partnerId: number;
  customer: string;
  /** Order date or invoice date, ms. */
  date?: number;
  /** Invoices only: when it's due, ms. */
  due?: number;
  total: number;
  /** Invoices only: still owed. */
  residual?: number;
  /** "Quotation", "Sales order", "Not paid", "Overdue", "Paid"... */
  status: string;
  /** Whether the status needs attention (unpaid, overdue). */
  warn: boolean;
  /** Customer reference ("Better · 12 Elm St"). */
  ref?: string;
  /** Invoices only: a credit note rather than an invoice. */
  refund?: boolean;
}

export interface OdooLine {
  label: string;
  qty: number;
  unit: number;
  subtotal: number;
  /** A section or note line: a heading, no money. */
  heading?: boolean;
}

export interface OdooRecordDetail extends OdooListRow {
  untaxed: number;
  tax: number;
  lines: OdooLine[];
}

const cents = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const many2one = (v: unknown): [number, string] => (Array.isArray(v) ? [v[0] as number, str(v[1])] : [0, '']);

const QUOTE_STATE: Record<string, string> = { draft: 'Quotation', sent: 'Quotation sent', sale: 'Sales order', done: 'Locked', cancel: 'Cancelled' };

function quoteRow(r: Record<string, unknown>): OdooListRow {
  const [partnerId, customer] = many2one(r.partner_id);
  const state = str(r.state);
  return {
    id: r.id as number,
    name: str(r.name) || `#${r.id}`,
    partnerId,
    customer,
    ...(odooTime(r.date_order) !== undefined ? { date: odooTime(r.date_order) } : {}),
    total: cents(r.amount_total),
    status: QUOTE_STATE[state] ?? state,
    warn: false,
    ...(str(r.client_order_ref) ? { ref: str(r.client_order_ref) } : {}),
  };
}

/** Odoo's payment status in words, with Overdue for an unpaid invoice past its due date. */
export function invoiceStatus(state: string, payment: string, due: number | undefined, now: number): { status: string; warn: boolean } {
  if (state === 'draft') return { status: 'Draft', warn: false };
  if (state === 'cancel') return { status: 'Cancelled', warn: false };
  if (payment === 'paid') return { status: 'Paid', warn: false };
  if (payment === 'in_payment') return { status: 'In payment', warn: false };
  if (payment === 'reversed') return { status: 'Reversed', warn: false };
  const overdue = due !== undefined && due < now - 24 * 3600 * 1000;
  if (payment === 'partial') return { status: overdue ? 'Partly paid, overdue' : 'Partly paid', warn: true };
  return { status: overdue ? 'Overdue' : 'Not paid', warn: true };
}

function invoiceRow(r: Record<string, unknown>, now: number): OdooListRow {
  const [partnerId, customer] = many2one(r.partner_id);
  const due = odooTime(r.invoice_date_due);
  const refund = r.move_type === 'out_refund';
  const s = invoiceStatus(str(r.state), str(r.payment_state), due, now);
  return {
    id: r.id as number,
    name: (str(r.name) && r.name !== '/' ? str(r.name) : '') || `Draft #${r.id}`,
    partnerId,
    customer,
    ...(odooTime(r.invoice_date) !== undefined ? { date: odooTime(r.invoice_date) } : {}),
    ...(due !== undefined ? { due } : {}),
    total: cents(r.amount_total),
    residual: cents(r.amount_residual),
    status: refund ? `Credit note · ${s.status}` : s.status,
    warn: !refund && s.warn,
    ...(str(r.ref) ? { ref: str(r.ref) } : {}),
    ...(refund ? { refund: true } : {}),
  };
}

const QUOTE_FIELDS = ['name', 'partner_id', 'date_order', 'amount_total', 'state', 'client_order_ref'];
const INVOICE_FIELDS = ['name', 'partner_id', 'invoice_date', 'invoice_date_due', 'amount_total', 'amount_residual', 'state', 'payment_state', 'move_type', 'ref'];

function domain(kind: ListKind, filter: ListFilter, search: string): unknown[] {
  const d: unknown[] = [];
  if (kind === 'invoices') {
    d.push(['move_type', 'in', ['out_invoice', 'out_refund']]);
    if (filter === 'unpaid') d.push(['state', '=', 'posted'], ['payment_state', 'in', ['not_paid', 'partial']]);
    if (filter === 'paid') d.push(['payment_state', 'in', ['paid', 'in_payment']]);
    if (filter === 'draft') d.push(['state', '=', 'draft']);
  } else {
    if (filter === 'quotes') d.push(['state', 'in', ['draft', 'sent']]);
    if (filter === 'orders') d.push(['state', 'in', ['sale', 'done']]);
  }
  const q = search.trim();
  if (q) d.push('|', ['name', 'ilike', q], ['partner_id', 'ilike', q]);
  return d;
}

export const PAGE = 40;

/** One page of a list, newest first. */
export async function fetchList(c: Client, kind: ListKind, filter: ListFilter = 'all', search = '', offset = 0, now: number = Date.now()): Promise<OdooListRow[]> {
  const model = MODEL[kind];
  const rows = (await c.call(model, 'search_read', [domain(kind, filter, search)], {
    fields: kind === 'quotations' ? QUOTE_FIELDS : INVOICE_FIELDS,
    limit: PAGE,
    offset,
    order: kind === 'quotations' ? 'date_order desc, id desc' : 'invoice_date desc, id desc',
  })) as Record<string, unknown>[];
  return rows.map((r) => (kind === 'quotations' ? quoteRow(r) : invoiceRow(r, now)));
}

/** One quotation or invoice with its lines and tax. */
export async function fetchRecord(c: Client, model: RecordModel, id: number, now: number = Date.now()): Promise<OdooRecordDetail> {
  const quote = model === 'sale.order';
  const fields = [...(quote ? QUOTE_FIELDS : INVOICE_FIELDS), 'amount_untaxed', 'amount_tax', quote ? 'order_line' : 'invoice_line_ids'];
  const [r] = (await c.call(model, 'read', [[id]], { fields })) as Record<string, unknown>[];
  if (!r) throw new Error('That record is no longer in Odoo.');
  const lineIds = (r[quote ? 'order_line' : 'invoice_line_ids'] as number[] | undefined) ?? [];
  const lineModel = quote ? 'sale.order.line' : 'account.move.line';
  const qty = quote ? 'product_uom_qty' : 'quantity';
  const rows = lineIds.length ? ((await c.call(lineModel, 'read', [lineIds], { fields: ['name', qty, 'price_unit', 'price_subtotal', 'display_type', 'sequence'] })) as Record<string, unknown>[]) : [];
  const lines = rows
    .sort((a, b) => ((a.sequence as number) ?? 0) - ((b.sequence as number) ?? 0))
    .filter((l) => !l.display_type || l.display_type === 'product' || l.display_type === 'line_section' || l.display_type === 'line_note')
    .map((l): OdooLine => {
      const heading = l.display_type === 'line_section' || l.display_type === 'line_note';
      const label = str(l.name).split('\n')[0];
      return heading ? { label, qty: 0, unit: 0, subtotal: 0, heading: true } : { label, qty: typeof l[qty] === 'number' ? (l[qty] as number) : 0, unit: cents(l.price_unit), subtotal: cents(l.price_subtotal) };
    });
  const row = quote ? quoteRow(r) : invoiceRow(r, now);
  return { ...row, untaxed: cents(r.amount_untaxed), tax: cents(r.amount_tax), lines };
}

/** The record in Odoo's web app (this address works from Odoo 14 to 19). */
export function odooWebLink(baseUrl: string, model: RecordModel, id: number): string {
  return `${baseUrl.replace(/\/+$/, '')}/web#id=${id}&model=${model}&view_type=form`;
}

/** What the list was the last time it was read, so it still shows with no signal. */
export const LISTS_STORAGE_KEY = 'odoo-lists/v1';

export interface SavedList {
  rows: OdooListRow[];
  at: number;
}

export function parseSavedLists(raw: string | null): Partial<Record<ListKind, SavedList>> {
  try {
    const d = raw ? JSON.parse(raw) : null;
    if (!d || typeof d !== 'object') return {};
    const out: Partial<Record<ListKind, SavedList>> = {};
    for (const k of ['quotations', 'invoices'] as const) {
      const v = d[k] as { rows?: unknown; at?: unknown } | undefined;
      if (v && Array.isArray(v.rows) && typeof v.at === 'number') out[k] = { rows: v.rows.filter((r) => r && typeof (r as OdooListRow).id === 'number') as OdooListRow[], at: v.at };
    }
    return out;
  } catch {
    return {};
  }
}
