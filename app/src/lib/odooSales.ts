/**
 * Quotes and invoices sent from the phone to Odoo. A quote the customer said
 * yes to becomes a confirmed sales order (sale.order); an invoice becomes a
 * posted customer invoice (account.move), tied to that sales order when there
 * is one, and the payments recorded on the phone are registered against it.
 * Odoo keeps the books; the phone reads back what's paid and what's owed.
 *
 * Each line uses the Odoo product its price-sheet line is linked to; a line
 * with no product (a price typed on the phone) uses one "Garage door service"
 * product, made in Odoo the first time it's needed. Odoo applies its own taxes
 * for each product, so the Odoo total is shown back on the phone.
 */
import type { OdooClient } from './odoo';
import type { OdooLink } from './prices';
import type { PayMethod, Payment } from './invoices';
import type { QuoteLine } from './quote';

/** A record the phone sent to Odoo. */
export interface OdooRef {
  id: number;
  /** "S00012" or "INV/2026/00007". */
  name: string;
}

/** What Odoo says about an invoice the phone sent. */
export interface OdooInvoiceState extends OdooRef {
  /** Cents, with Odoo's taxes. */
  total: number;
  /** Still owed, cents. */
  residual: number;
  /** Odoo's payment_state: not_paid, partial, in_payment, paid, reversed. */
  paymentState: string;
  /** Phone payments already registered in Odoo. */
  sentPayments: string[];
  checkedAt: number;
  /** The customer signature (its id) already attached to the invoice in Odoo. */
  signatureSent?: string;
  /** Odoo's amounts before tax and its tax, cents (read since 0.5.17). */
  untaxed?: number;
  tax?: number;
  /** Odoo's invoice lines (read since 0.5.18): the phone shows these once the invoice is in Odoo. */
  lines?: OdooInvoiceLine[];
}

export interface OdooInvoiceLine {
  label: string;
  qty: number;
  /** The line's amount before tax, cents. */
  cents: number;
}

/** The product a line without a linked Odoo product goes in as. */
export const SERVICE_PRODUCT_CODE = 'GDT-SERVICE';

const ODOO_PAY_LABEL: Record<string, string> = { not_paid: 'Not paid', partial: 'Partly paid', in_payment: 'In payment', paid: 'Paid', reversed: 'Reversed', invoicing_legacy: 'Paid' };
export const odooPaymentLabel = (s: string) => ODOO_PAY_LABEL[s] ?? s;

/** Odoo amounts are dollars as floats. */
const toCents = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) : 0);

/** Order or invoice line values for the phone's lines. Lines with nothing to charge are left out. */
export function lineValues(lines: QuoteLine[], links: Record<string, OdooLink>, serviceProduct: () => number, qtyField: 'product_uom_qty' | 'quantity'): Record<string, unknown>[] {
  return lines
    .filter((l) => l.cents > 0)
    .map((l) => {
      const linked = l.key ? links[l.key]?.id : undefined;
      const qty = l.qty && l.qty > 0 ? l.qty : 1;
      return { product_id: linked ?? l.productId ?? serviceProduct(), name: l.label, [qtyField]: qty, price_unit: l.cents / qty / 100 };
    });
}

/** Lines that need the fallback service product. */
const needsService = (lines: QuoteLine[], links: Record<string, OdooLink>) => lines.some((l) => l.cents > 0 && !(l.key && links[l.key]) && !l.productId);

/** Finds, or makes the first time, the service product for lines that aren't linked to an Odoo product. */
export async function serviceProduct(client: OdooClient): Promise<number> {
  const found = (await client.call('product.product', 'search', [[['default_code', '=', SERVICE_PRODUCT_CODE]]], { limit: 1 })) as number[];
  if (found[0]) return found[0];
  return (await client.call('product.product', 'create', [{ name: 'Garage door service', default_code: SERVICE_PRODUCT_CODE, type: 'service', sale_ok: true, list_price: 0, taxes_id: [[6, 0, []]] }])) as number;
}

async function prepare(client: OdooClient, lines: QuoteLine[], links: Record<string, OdooLink>, qtyField: 'product_uom_qty' | 'quantity') {
  const service = needsService(lines, links) ? await serviceProduct(client) : 0;
  return lineValues(lines, links, () => service, qtyField);
}

/** The order's customer reference: the tier first ("Better · 12 Elm St"), so reports can tell which option sold. */
export const orderRef = (tierLabel: string, address: string) => [tierLabel, address.trim()].filter(Boolean).join(' · ');

/** Sends the option the customer picked as a confirmed sales order. */
export async function sendOrder(client: OdooClient, partnerId: number, lines: QuoteLine[], links: Record<string, OdooLink>, ref: string, shipId?: number): Promise<OdooRef> {
  const order_line = (await prepare(client, lines, links, 'product_uom_qty')).map((v) => [0, 0, v]);
  const id = (await client.call('sale.order', 'create', [{ partner_id: partnerId, client_order_ref: ref || false, ...(shipId ? { partner_shipping_id: shipId } : {}), order_line }])) as number;
  await client.call('sale.order', 'action_confirm', [[id]]);
  const [row] = (await client.call('sale.order', 'read', [[id]], { fields: ['name'] })) as { name?: string }[];
  return { id, name: row?.name ?? `#${id}` };
}

/**
 * The confirmed sales order for an invoice made without one (a ticket
 * finished offline): the ticket's draft quotation gets the invoice's lines
 * and is confirmed, or, if there's no draft left, a new order is made.
 */
export async function confirmOrderFor(client: OdooClient, partnerId: number, lines: QuoteLine[], links: Record<string, OdooLink>, ref: string, draft?: OdooRef, shipId?: number): Promise<OdooRef> {
  if (draft) {
    const [row] = (await client.call('sale.order', 'read', [[draft.id]], { fields: ['state', 'name'] })) as { state?: string; name?: string }[];
    if (row?.state === 'draft' || row?.state === 'sent') {
      const vals = await prepare(client, lines, links, 'product_uom_qty');
      await client.call('sale.order', 'write', [[draft.id], { client_order_ref: ref || false, ...(shipId ? { partner_shipping_id: shipId } : {}), order_line: [[5, 0, 0], ...vals.map((v) => [0, 0, v])] }]);
      await client.call('sale.order', 'action_confirm', [[draft.id]]);
      return { id: draft.id, name: row.name ?? draft.name };
    }
  }
  return sendOrder(client, partnerId, lines, links, ref, shipId);
}

/**
 * Sends an invoice and posts it. When the job's sales order is in Odoo, the
 * invoice lines are tied to its lines, so Odoo shows the order as invoiced.
 */
export async function sendInvoice(client: OdooClient, partnerId: number, lines: QuoteLine[], links: Record<string, OdooLink>, ref: string, order?: OdooRef, shipId?: number): Promise<OdooInvoiceState> {
  const vals = await prepare(client, lines, links, 'quantity');
  if (order) {
    const orderLines = (await client.call('sale.order.line', 'search_read', [[['order_id', '=', order.id], ['display_type', '=', false]]], { fields: ['id'], order: 'sequence asc, id asc' })) as { id: number }[];
    // Same lines in the same order as the quote, unless prices changed the list since.
    if (orderLines.length === vals.length) vals.forEach((v, i) => (v.sale_line_ids = [[6, 0, [orderLines[i].id]]]));
  }
  const id = (await client.call('account.move', 'create', [{ move_type: 'out_invoice', partner_id: partnerId, ref: ref || false, ...(shipId ? { partner_shipping_id: shipId } : {}), ...(order ? { invoice_origin: order.name } : {}), invoice_line_ids: vals.map((v) => [0, 0, v]) }])) as number;
  await client.call('account.move', 'action_post', [[id]]);
  return readInvoice(client, id, []);
}

/** What Odoo says is paid and owed now. */
export async function readInvoice(client: OdooClient, id: number, sentPayments: string[], now: number = Date.now()): Promise<OdooInvoiceState> {
  const [r] = (await client.call('account.move', 'read', [[id]], { fields: ['name', 'amount_untaxed', 'amount_tax', 'amount_total', 'amount_residual', 'payment_state', 'invoice_line_ids'] })) as Record<string, unknown>[];
  if (!r) throw new Error('That invoice is no longer in Odoo.');
  const lines = await readLines(client, r.invoice_line_ids);
  return {
    id,
    name: typeof r.name === 'string' ? r.name : `#${id}`,
    total: toCents(r.amount_total),
    residual: toCents(r.amount_residual),
    paymentState: typeof r.payment_state === 'string' ? r.payment_state : 'not_paid',
    sentPayments,
    checkedAt: now,
    ...(typeof r.amount_untaxed === 'number' ? { untaxed: toCents(r.amount_untaxed), tax: toCents(r.amount_tax) } : {}),
    ...(lines ? { lines } : {}),
  };
}

/** The invoice's product lines as Odoo has them (sections and notes left out). */
async function readLines(client: OdooClient, ids: unknown): Promise<OdooInvoiceLine[] | undefined> {
  if (!Array.isArray(ids) || ids.length === 0) return undefined;
  const rows = await client.call('account.move.line', 'read', [ids], { fields: ['name', 'quantity', 'price_subtotal', 'display_type', 'sequence'] });
  if (!Array.isArray(rows)) return undefined;
  return (rows as Record<string, unknown>[])
    .filter((l) => !l.display_type || l.display_type === 'product')
    .sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0))
    .map((l) => ({ label: (typeof l.name === 'string' ? l.name : '').split('\n')[0], qty: typeof l.quantity === 'number' ? l.quantity : 1, cents: toCents(l.price_subtotal) }));
}

/** Cash goes to a cash journal; checks and the payment apps to the bank. */
export const journalType = (m: PayMethod): 'cash' | 'bank' => (m === 'cash' ? 'cash' : 'bank');

/** Registers phone payments in Odoo the way its Register Payment button does. Returns the ids that went through. */
export async function sendPayments(client: OdooClient, invoiceId: number, payments: Payment[], methodLabel: (m: PayMethod) => string): Promise<string[]> {
  const journals = new Map<string, number>();
  const sent: string[] = [];
  for (const p of payments) {
    const type = journalType(p.method);
    if (!journals.has(type)) {
      const ids = (await client.call('account.journal', 'search', [[['type', '=', type]]], { limit: 1 })) as number[];
      // No cash journal: fall back to the bank one.
      const fallback = ids[0] ?? ((await client.call('account.journal', 'search', [[['type', 'in', ['bank', 'cash']]]], { limit: 1 })) as number[])[0];
      if (!fallback) throw new Error('Odoo has no bank or cash journal to record payments in.');
      journals.set(type, fallback);
    }
    const context = { active_model: 'account.move', active_ids: [invoiceId] };
    const memo = [methodLabel(p.method), p.reference].filter(Boolean).join(' ');
    const wizard = (await client.call(
      'account.payment.register',
      'create',
      [{ amount: p.amount / 100, payment_date: new Date(p.at).toISOString().slice(0, 10), journal_id: journals.get(type), communication: memo }],
      { context },
    )) as number;
    await client.call('account.payment.register', 'action_create_payments', [[wizard]], { context });
    sent.push(p.id);
  }
  return sent;
}

/** Reads a stored OdooRef. */
export function parseRef(v: unknown): OdooRef | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  return typeof r.id === 'number' && typeof r.name === 'string' ? { id: r.id, name: r.name } : undefined;
}

/** Reads a stored OdooInvoiceState. */
export function parseInvoiceState(v: unknown): OdooInvoiceState | undefined {
  const ref = parseRef(v);
  if (!ref) return undefined;
  const r = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' ? x : 0);
  return {
    ...ref,
    total: n(r.total),
    residual: n(r.residual),
    paymentState: typeof r.paymentState === 'string' ? r.paymentState : 'not_paid',
    sentPayments: Array.isArray(r.sentPayments) ? r.sentPayments.filter((x): x is string => typeof x === 'string') : [],
    checkedAt: n(r.checkedAt),
    ...(typeof r.signatureSent === 'string' ? { signatureSent: r.signatureSent } : {}),
    ...(typeof r.untaxed === 'number' ? { untaxed: r.untaxed, tax: n(r.tax) } : {}),
    ...(Array.isArray(r.lines)
      ? {
          lines: r.lines.flatMap((l): OdooInvoiceLine[] => {
            if (!l || typeof l !== 'object') return [];
            const y = l as Record<string, unknown>;
            return [{ label: typeof y.label === 'string' ? y.label : '', qty: n(y.qty) || 1, cents: n(y.cents) }];
          }),
        }
      : {}),
  };
}

/** Attaches the signed page (a PDF) to the invoice in Odoo, with a note in its chatter. */
export async function sendSignature(client: Pick<OdooClient, 'call'>, moveId: number, fileName: string, pdfBase64: string, note: string): Promise<void> {
  const id = (await client.call('ir.attachment', 'create', [{ name: fileName, type: 'binary', datas: pdfBase64, res_model: 'account.move', res_id: moveId, mimetype: 'application/pdf' }])) as number;
  await client.call('account.move', 'message_post', [[moveId]], { body: note, attachment_ids: [id], message_type: 'comment', subtype_xmlid: 'mail.mt_note' });
}
