/**
 * Invoices and payments. An invoice is made from the quote option the
 * customer picked: its lines and totals are copied in when it's made, so a
 * later price change never alters an invoice already sent. Payments are
 * recorded by how the customer paid (cash, check, Cash App, Venmo, Zelle).
 * Kept free of React so it can be tested directly.
 *
 * The shape follows an accounting system's invoice (number, customer, lines,
 * untaxed amount, tax, total, payments, amount due), so a later sync with
 * Odoo or similar can map it one to one.
 */
import { formatJobDate } from './jobs';
import { OdooInvoiceState, parseInvoiceState } from './odooSales';
import { parseShipTo, ShipTo } from './ticket';
import { formatMoney, Tier, TIER_LABEL, TIERS } from './prices';
import { QuoteLine, QuoteOption } from './quote';

export const INVOICES_STORAGE_KEY = 'invoices/v1';
export const BUSINESS_STORAGE_KEY = 'business/v1';

export type PayMethod = 'cash' | 'check' | 'cashapp' | 'venmo' | 'zelle';
export const PAY_METHODS: PayMethod[] = ['cash', 'check', 'cashapp', 'venmo', 'zelle'];
export const PAY_LABEL: Record<PayMethod, string> = { cash: 'Cash', check: 'Check', cashapp: 'Cash App', venmo: 'Venmo', zelle: 'Zelle' };

export interface Payment {
  id: string;
  method: PayMethod;
  /** Cents. */
  amount: number;
  at: number;
  /** Check number, or the app's confirmation, if noted. */
  reference: string;
}

export interface Invoice {
  id: string;
  /** "1001", counting up on this phone. */
  number: string;
  jobId: string;
  customerId?: string;
  /** The customer's name and job address when the invoice was made. */
  billTo: string;
  address: string;
  tier: Tier;
  lines: QuoteLine[];
  subtotal: number;
  tax: number;
  total: number;
  payments: Payment[];
  createdAt: number;
  updatedAt: number;
  /** Set when cancelled; kept so the numbers stay in order. */
  voidedAt?: number;
  /** The posted invoice in Odoo, with what Odoo last said is paid (src/lib/odooSales.ts). */
  odoo?: OdooInvoiceState;
  /** "ticket" when made from the job's ticket rather than a good/better/best option. */
  source?: 'ticket';
  /** The customer reference for Odoo; "Invoice 1004" when not set. */
  ref?: string;
  /** Sent to Odoo by the phone on its own once there's signal (invoices made since 0.5.17). */
  autoSend?: boolean;
  /** The delivery address picked on the ticket; partner_shipping_id on the invoice in Odoo. */
  shipTo?: ShipTo;
  /** Warranty picked for this job, in months (0 for none); what isn't set follows the follow-up settings. */
  warranty?: { partsMonths?: number; laborMonths?: number };
}

/** The customer reference the invoice goes to Odoo with. */
export const invoiceRef = (inv: Pick<Invoice, 'ref' | 'number'>) => inv.ref?.trim() || `Invoice ${inv.number}`;

/** The invoice with what Odoo said: once Odoo has priced it, its tax and totals are the ones shown. */
export function withOdoo(inv: Invoice, odoo: OdooInvoiceState): Invoice {
  return {
    ...inv,
    odoo,
    ...(odoo.untaxed !== undefined ? { subtotal: odoo.untaxed, tax: odoo.tax ?? 0, total: odoo.total } : {}),
    // Odoo's lines once it has them, so the phone and Odoo show the same invoice.
    ...(odoo.lines?.length ? { lines: odoo.lines.map((l): QuoteLine => ({ label: l.label, cents: l.cents, taxable: false, ...(l.qty !== 1 ? { qty: l.qty } : {}) })) } : {}),
  };
}

/** The invoice's number as the customer sees it: Odoo's ("INV/2026/00080") once it's in Odoo, else the phone's. */
export const invoiceNo = (inv: Pick<Invoice, 'number' | 'odoo'>) => inv.odoo?.name || inv.number;
/** "Invoice INV/2026/00080", or "Invoice 1004" before it's in Odoo. */
export const invoiceLabel = (inv: Pick<Invoice, 'number' | 'odoo'>) => `Invoice ${invoiceNo(inv)}`;

/** "Better option", or "Job ticket" for an invoice made from the ticket. */
export function optionLabel(inv: Pick<Invoice, 'tier' | 'source'>): string {
  return inv.source === 'ticket' ? 'Job ticket' : `${TIER_LABEL[inv.tier]} option`;
}

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'void';

/** The tech's own details, for invoices and payment links. */
export interface Business {
  name: string;
  phone: string;
  /** Cash App $cashtag, with or without the $. */
  cashtag: string;
  /** Venmo username, with or without the @. */
  venmo: string;
  /** The email or phone number Zelle payments go to. */
  zelle: string;
  /** The link customers use to leave a review (Google, Yelp, Facebook...). */
  reviewUrl: string;
}

export const EMPTY_BUSINESS: Business = { name: '', phone: '', cashtag: '', venmo: '', zelle: '', reviewUrl: '' };

export function paid(inv: Pick<Invoice, 'payments'>): number {
  return inv.payments.reduce((n, p) => n + p.amount, 0);
}

export function balance(inv: Pick<Invoice, 'payments' | 'total'>): number {
  return Math.max(0, inv.total - paid(inv));
}

export function invoiceStatus(inv: Invoice): InvoiceStatus {
  if (inv.voidedAt) return 'void';
  const p = paid(inv);
  if (p >= inv.total) return 'paid';
  return p > 0 ? 'partial' : 'unpaid';
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = { unpaid: 'UNPAID', partial: 'PART PAID', paid: 'PAID', void: 'VOID' };

/** The next number after the highest on this phone, starting at 1001. */
export function nextInvoiceNumber(invoices: Invoice[]): string {
  const max = invoices.reduce((m, i) => Math.max(m, Number.parseInt(i.number, 10) || 0), 1000);
  return String(max + 1);
}

export function newId(prefix: string, now: number, random: () => number = Math.random): string {
  return `${prefix}-${now.toString(36)}-${Math.floor(random() * 1e9).toString(36)}`;
}

export function createInvoice(
  job: { id: string; customerId?: string; customer: string; address: string },
  option: QuoteOption,
  existing: Invoice[],
  now: number,
  id: string = newId('i', now),
  source?: 'ticket',
  extra: { ref?: string; autoSend?: boolean; shipTo?: ShipTo; payments?: Payment[] } = {},
): Invoice {
  return {
    id,
    number: nextInvoiceNumber(existing),
    jobId: job.id,
    ...(job.customerId ? { customerId: job.customerId } : {}),
    billTo: job.customer,
    address: extra.shipTo?.address || job.address,
    tier: option.tier,
    lines: option.lines.filter((l) => l.cents > 0).map((l) => ({ ...l })),
    subtotal: option.subtotal,
    tax: option.tax,
    total: option.total,
    payments: (extra.payments ?? []).map((p) => ({ ...p })),
    createdAt: now,
    updatedAt: now,
    ...(source ? { source } : {}),
    ...(extra.ref?.trim() ? { ref: extra.ref.trim() } : {}),
    ...(extra.autoSend ? { autoSend: true } : {}),
    ...(extra.shipTo ? { shipTo: extra.shipTo } : {}),
  };
}

/** Text the customer can read: what was done, what's owed, and how to pay. */
export function invoiceText(inv: Invoice, business: Business): string {
  const out: string[] = [];
  out.push(`${business.name || 'Garage door service'}: invoice ${invoiceNo(inv)}`);
  out.push(`${inv.billTo || 'Customer'}${inv.address ? `, ${inv.address}` : ''} · ${formatJobDate(inv.createdAt)}`);
  out.push('');
  for (const l of inv.lines) out.push(`- ${l.label}: ${formatMoney(l.cents)}`);
  if (inv.tax > 0) out.push(`- Tax: ${formatMoney(inv.tax)}`);
  out.push(`Total: ${formatMoney(inv.total)}`);
  const p = paid(inv);
  if (p > 0) out.push(`Paid: ${formatMoney(p)}`);
  const due = balance(inv);
  out.push(due > 0 ? `Amount due: ${formatMoney(due)}` : 'Paid in full. Thank you!');
  if (due > 0) {
    const ways = payLinks(business, due, invoiceLabel(inv));
    if (ways.length > 0) {
      out.push('');
      out.push('Pay by:');
      for (const w of ways) out.push(`- ${w.label}: ${w.url ?? w.handle}`);
      out.push('- Cash or check');
    }
  }
  if (business.phone) out.push('', `Questions: ${business.phone}`);
  return out.join('\n');
}

export interface PayLink {
  method: PayMethod;
  label: string;
  /** What to show: "$cashtag", "@user", or the Zelle email or phone. */
  handle: string;
  /** A link that opens the app with the amount filled in, where the app has one. Zelle doesn't. */
  url?: string;
}

const dollars = (c: number) => (c / 100).toFixed(2);

/** The customer's ways to pay by app, from the tech's handles, with the amount in the link where the app allows it. */
export function payLinks(b: Business, amountCents: number, note: string): PayLink[] {
  const out: PayLink[] = [];
  const tag = b.cashtag.trim().replace(/^\$/, '').replace(/[^A-Za-z0-9_-]/g, '');
  if (tag) out.push({ method: 'cashapp', label: 'Cash App', handle: `$${tag}`, url: `https://cash.app/$${tag}${amountCents > 0 ? `/${dollars(amountCents)}` : ''}` });
  const user = b.venmo.trim().replace(/^@/, '').replace(/[^A-Za-z0-9_-]/g, '');
  if (user) {
    const q = amountCents > 0 ? `?txn=pay&amount=${dollars(amountCents)}&note=${encodeURIComponent(note)}` : '';
    out.push({ method: 'venmo', label: 'Venmo', handle: `@${user}`, url: `https://venmo.com/${user}${q}` });
  }
  const z = b.zelle.trim();
  if (z) out.push({ method: 'zelle', label: 'Zelle', handle: z });
  return out;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Reads saved invoices; anything that isn't an invoice is dropped. */
export function parseInvoices(raw: string | null | unknown[]): Invoice[] {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];
  const out: Invoice[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const x = item as Record<string, unknown>;
    if (typeof x.id !== 'string' || typeof x.jobId !== 'string') continue;
    const lines = Array.isArray(x.lines)
      ? x.lines.flatMap((l): QuoteLine[] => {
          if (!l || typeof l !== 'object') return [];
          const y = l as Record<string, unknown>;
          return [{ label: str(y.label), cents: num(y.cents), taxable: y.taxable === true, ...(str(y.key) ? { key: str(y.key) } : {}), ...(num(y.qty) > 0 ? { qty: num(y.qty) } : {}), ...(num(y.productId) > 0 ? { productId: num(y.productId) } : {}) }];
        })
      : [];
    const payments = Array.isArray(x.payments)
      ? x.payments.flatMap((p): Payment[] => {
          if (!p || typeof p !== 'object') return [];
          const y = p as Record<string, unknown>;
          if (!PAY_METHODS.includes(y.method as PayMethod) || num(y.amount) <= 0) return [];
          return [{ id: str(y.id) || `p${num(y.at)}`, method: y.method as PayMethod, amount: num(y.amount), at: num(y.at), reference: str(y.reference) }];
        })
      : [];
    const createdAt = num(x.createdAt);
    out.push({
      id: x.id,
      number: str(x.number) || '?',
      jobId: x.jobId,
      ...(typeof x.customerId === 'string' && x.customerId ? { customerId: x.customerId } : {}),
      billTo: str(x.billTo),
      address: str(x.address),
      tier: TIERS.includes(x.tier as Tier) ? (x.tier as Tier) : 'good',
      lines,
      subtotal: num(x.subtotal),
      tax: num(x.tax),
      total: num(x.total),
      payments,
      createdAt,
      updatedAt: num(x.updatedAt) || createdAt,
      ...(num(x.voidedAt) ? { voidedAt: num(x.voidedAt) } : {}),
      ...(parseInvoiceState(x.odoo) ? { odoo: parseInvoiceState(x.odoo) } : {}),
      ...(x.source === 'ticket' ? { source: 'ticket' as const } : {}),
      ...(str(x.ref) ? { ref: str(x.ref) } : {}),
      ...(x.autoSend === true ? { autoSend: true } : {}),
      ...(parseShipTo(x.shipTo) ? { shipTo: parseShipTo(x.shipTo) } : {}),
      ...parseCoverage(x),
    });
  }
  return out;
}

/** The per-job warranty, when saved and sensible. */
function parseCoverage(x: Record<string, unknown>): Pick<Invoice, 'warranty'> {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const w = x.warranty && typeof x.warranty === 'object' ? (x.warranty as Record<string, unknown>) : {};
  const partsMonths = n(w.partsMonths);
  const laborMonths = n(w.laborMonths);
  return {
    ...(partsMonths !== undefined || laborMonths !== undefined ? { warranty: { ...(partsMonths !== undefined ? { partsMonths } : {}), ...(laborMonths !== undefined ? { laborMonths } : {}) } } : {}),
  };
}

export function parseBusiness(raw: string | null | object): Business {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return EMPTY_BUSINESS;
    }
  }
  if (!data || typeof data !== 'object') return EMPTY_BUSINESS;
  const d = data as Record<string, unknown>;
  return { name: str(d.name), phone: str(d.phone), cashtag: str(d.cashtag), venmo: str(d.venmo), zelle: str(d.zelle), reviewUrl: str(d.reviewUrl) };
}

/** A backup's invoices merged into the phone's: nothing deleted, the copy changed last wins. */
export function mergeInvoices(current: Invoice[], incoming: Invoice[]): Invoice[] {
  const byId = new Map(current.map((i) => [i.id, i]));
  for (const i of incoming) {
    const mine = byId.get(i.id);
    if (!mine || i.updatedAt > mine.updatedAt) byId.set(i.id, i);
  }
  return [...byId.values()];
}

/** Newest first, with unpaid ones before paid and void. */
export function sortInvoices(list: Invoice[]): Invoice[] {
  const rank: Record<InvoiceStatus, number> = { unpaid: 0, partial: 0, paid: 1, void: 2 };
  return [...list].sort((a, b) => rank[invoiceStatus(a)] - rank[invoiceStatus(b)] || b.createdAt - a.createdAt);
}

export const tierLabel = (t: Tier) => TIER_LABEL[t];

/** A usable review link: what was typed, with https:// added if it was left off. Empty if it doesn't look like a web address. */
export function reviewLink(b: Pick<Business, 'reviewUrl'>): string {
  const u = b.reviewUrl.trim();
  if (!u || /\s/.test(u) || !u.includes('.')) return '';
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/** The text asking a paid-up customer for a review. */
export function reviewRequestText(inv: Pick<Invoice, 'billTo'>, b: Business): string {
  const name = inv.billTo.split(/\s+/)[0] || 'there';
  return `Hi ${name}, thanks for choosing ${b.name || 'us'}! If you're happy with the work on your garage door, a quick review helps a lot: ${reviewLink(b)}`;
}
