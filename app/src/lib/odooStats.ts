/**
 * The business numbers worked out from Odoo itself (payments, invoices,
 * Field Service orders, quotations), so what was deleted or changed there
 * shows up here. Same shape as the phone's own snapshot (src/lib/stats.ts),
 * which stays the fallback when Odoo can't be reached. Kept free of React.
 */
import { PAY_METHODS, PayMethod } from './invoices';
import type { OdooClient } from './odoo';
import { iso, methodOf } from './odooPayments';
import { lastDays, monthOf, Period, PeriodStats, Snapshot, thisWeek } from './stats';

type Client = Pick<OdooClient, 'call' | 'session'>;
type Row = Record<string, unknown>;

const cents = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) : 0);
const day = (v: unknown): number | undefined => {
  if (typeof v !== 'string' || v.length < 10) return undefined;
  const [y, m, d] = v.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
};
const utcTime = (v: unknown): number | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = Date.parse(`${v.replace(' ', 'T')}Z`);
  return Number.isNaN(t) ? undefined : t;
};
const utc = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
const rows = async (c: Client, model: string, domain: unknown[], fields: string[], limit = 2000): Promise<Row[]> => {
  const r = await c.call(model, 'search_read', [domain], { fields, limit });
  return Array.isArray(r) ? (r as Row[]) : [];
};
const some = async (f: () => Promise<Row[]>): Promise<Row[]> => f().catch(() => []);

export async function odooSnapshot(c: Client, now: number, monthsBack = 6): Promise<Snapshot> {
  const since = monthOf(now, -(monthsBack - 1)).start;
  const sinceDay = iso(since);
  const sinceUtc = utc(since);

  const payments = await rows(c, 'account.payment', [['payment_type', '=', 'inbound'], ['partner_type', '=', 'customer'], ['state', 'in', ['in_process', 'paid']], ['date', '>=', sinceDay]], ['amount', 'date', 'memo', 'journal_id', 'payment_method_line_id']).catch(() =>
    rows(c, 'account.payment', [['payment_type', '=', 'inbound'], ['partner_type', '=', 'customer'], ['state', 'in', ['in_process', 'paid']], ['date', '>=', sinceDay]], ['amount', 'date', 'journal_id', 'payment_method_line_id']),
  );
  const invoices = await rows(c, 'account.move', [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['invoice_date', '>=', sinceDay]], ['amount_total', 'invoice_date']);
  const owing = await rows(c, 'account.move', [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['payment_state', 'in', ['not_paid', 'partial']]], ['amount_residual', 'invoice_date', 'name', 'partner_id'], 1000);
  const orders = await some(() => rows(c, 'fsm.order', [['create_date', '>=', sinceUtc]], ['create_date']));
  const openJobs = await c.call('fsm.order', 'search_count', [[['stage_id.is_closed', '=', false]]]).then((n) => Number(n) || 0, () => 0);
  const accepted = await some(() => rows(c, 'sale.order', [['state', 'in', ['sale', 'done']], ['date_order', '>=', sinceUtc]], ['date_order']));

  const stats = (p: Period): PeriodStats => {
    const inP = (ms: number | undefined) => ms !== undefined && ms >= p.start && ms < p.end;
    const byMethod = Object.fromEntries(PAY_METHODS.map((m) => [m, 0])) as Record<PayMethod, number>;
    let collected = 0;
    for (const r of payments) {
      if (!inP(day(r.date))) continue;
      const amt = cents(r.amount);
      collected += amt;
      const m = methodOf(r);
      if (m) byMethod[m] += amt;
    }
    const made = invoices.filter((r) => inP(day(r.invoice_date)));
    const invoiced = made.reduce((n, r) => n + cents(r.amount_total), 0);
    const jobsSaved = orders.filter((r) => inP(utcTime(r.create_date))).length;
    const acc = accepted.filter((r) => inP(utcTime(r.date_order))).length;
    return {
      collected,
      invoiced,
      invoices: made.length,
      jobsSaved,
      accepted: acc,
      closeRate: jobsSaved > 0 ? Math.min(1, acc / jobsSaved) : null,
      averageTicket: made.length > 0 ? Math.round(invoiced / made.length) : null,
      byMethod,
    };
  };

  const oldest = [...owing].sort((a, b) => (day(a.invoice_date) ?? 0) - (day(b.invoice_date) ?? 0))[0];
  const who = oldest && Array.isArray(oldest.partner_id) ? String(oldest.partner_id[1]) : 'customer';
  return {
    openJobs,
    owed: owing.reduce((n, r) => n + cents(r.amount_residual), 0),
    owedInvoices: owing.length,
    ...(oldest ? { oldestText: `${String(oldest.name || 'Invoice')}, ${who}, since ${new Date(day(oldest.invoice_date) ?? now).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` } : {}),
    week: stats(thisWeek(now)),
    month: stats(monthOf(now)),
    months: Array.from({ length: monthsBack }, (_, k) => {
      const p = monthOf(now, k - monthsBack + 1);
      return { start: p.start, collected: stats(p).collected };
    }),
    days: lastDays(now).map((p) => ({ start: p.start, collected: stats(p).collected })),
  };
}
