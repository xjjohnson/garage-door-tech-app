/**
 * Linking an existing sales order to a new job: work that was quoted and is
 * waiting on the customer's approval (or approved but not invoiced yet) is
 * closed out on one job, and finished on a later job tied to the same order.
 * The order's lines become the new job's ticket, and the job's order is set,
 * so Create invoice ties the invoice to it. Kept free of React; the client is
 * passed in, so tests use a fake.
 */
import type { OdooClient } from './odoo';
import { odooTime } from './odoo';
import { OdooRef } from './odooSales';
import { linesKey, newLineId, Ticket, TicketLine } from './ticket';

type Client = Pick<OdooClient, 'call'>;

export interface OpenOrder extends OdooRef {
  /** "Waiting for approval" (a quotation) or "Approved" (confirmed, not invoiced yet). */
  status: string;
  total: number;
  /** The customer reference ("Better · 12 Elm St"). */
  ref?: string;
  date?: number;
}

const STATUS: Record<string, string> = { draft: 'Waiting for approval', sent: 'Waiting for approval', sale: 'Approved' };
const cents = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** A customer's sales orders and quotations that are not fully invoiced yet, newest first (their contacts' too). */
export async function fetchOpenOrders(c: Client, partnerId: number, limit = 15): Promise<OpenOrder[]> {
  const rows = (await c.call('sale.order', 'search_read', [[['partner_id', 'child_of', partnerId], ['state', 'in', ['draft', 'sent', 'sale']], ['invoice_status', '!=', 'invoiced']]], {
    fields: ['name', 'date_order', 'amount_total', 'state', 'client_order_ref'],
    limit,
    order: 'date_order desc, id desc',
  })) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as number,
    name: str(r.name) || `#${r.id}`,
    status: STATUS[str(r.state)] ?? str(r.state),
    total: cents(r.amount_total),
    ...(str(r.client_order_ref) ? { ref: str(r.client_order_ref) } : {}),
    ...(odooTime(r.date_order) !== undefined ? { date: odooTime(r.date_order) } : {}),
  }));
}

/**
 * The order's priced lines as a ticket tied to it. A line discount is folded
 * into the price, since the ticket has none per line. Totals come from the
 * order, so nothing is saved back to Odoo until the ticket changes.
 */
export async function ticketFromOrder(c: Client, order: OdooRef, now: number, ids: () => string = () => newLineId(now)): Promise<Ticket> {
  const [o] = (await c.call('sale.order', 'read', [[order.id]], { fields: ['name', 'client_order_ref', 'amount_untaxed', 'amount_tax', 'amount_total'] })) as Record<string, unknown>[];
  if (!o) throw new Error('That sales order is no longer in Odoo.');
  const rows = (await c.call('sale.order.line', 'search_read', [[['order_id', '=', order.id], ['display_type', '=', false]]], {
    fields: ['name', 'product_id', 'product_uom_qty', 'price_unit', 'discount'],
    order: 'sequence asc, id asc',
  })) as Record<string, unknown>[];
  const productIds = [...new Set(rows.map((r) => (Array.isArray(r.product_id) ? (r.product_id[0] as number) : 0)).filter(Boolean))];
  const types = new Map<number, string>();
  if (productIds.length) {
    const prods = (await c.call('product.product', 'read', [productIds], { fields: ['type'] })) as Record<string, unknown>[];
    for (const p of prods) types.set(p.id as number, str(p.type));
  }
  const lines: TicketLine[] = rows.map((r) => {
    const pid = Array.isArray(r.product_id) ? (r.product_id[0] as number) : 0;
    const price = typeof r.price_unit === 'number' ? r.price_unit : 0;
    const off = typeof r.discount === 'number' ? r.discount : 0;
    return {
      id: ids(),
      // Odoo names a line "[CODE] Name\nDescription": the first line is enough.
      name: str(r.name).split('\n')[0].replace(/^\[[^\]]*\]\s*/, '') || 'Item',
      qty: typeof r.product_uom_qty === 'number' && r.product_uom_qty > 0 ? r.product_uom_qty : 1,
      unitCents: Math.max(0, Math.round(price * (1 - off / 100) * 100)),
      kind: types.get(pid) === 'service' ? 'service' : 'material',
      ...(pid ? { productId: pid } : {}),
    };
  });
  const name = str(o.name) || order.name;
  const ref = str(o.client_order_ref);
  return {
    lines,
    order: { id: order.id, name },
    linked: true,
    ...(ref ? { ref } : {}),
    totals: { untaxed: cents(o.amount_untaxed), tax: cents(o.amount_tax), total: cents(o.amount_total), key: linesKey(lines), at: now },
  };
}
