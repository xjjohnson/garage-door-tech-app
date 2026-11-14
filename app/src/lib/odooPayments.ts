/**
 * Today's money by how it was paid, read from Odoo's payments (account.payment)
 * so the end-of-day summary matches the books. Kept free of React.
 */
import type { PayMethod } from './invoices';
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call'>;

export interface OdooPayTotals {
  /** Cents received, by method. */
  byMethod: Record<PayMethod, number>;
  /** Received in some other way (a payment made in Odoo itself, say), cents. */
  other: number;
  checks: number;
  count: number;
}

const name = (v: unknown) => (Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '');

/** Which of the five ways a payment came in. The app writes the way into the memo ("Cash App ref"); else the method line or journal name. */
export function methodOf(p: { memo?: unknown; payment_method_line_id?: unknown; journal_id?: unknown }): PayMethod | undefined {
  const text = [typeof p.memo === 'string' ? p.memo : '', name(p.payment_method_line_id), name(p.journal_id)].map((s) => s.toLowerCase());
  const rules: [RegExp, PayMethod][] = [
    [/cash\s*app/, 'cashapp'],
    [/venmo/, 'venmo'],
    [/zelle/, 'zelle'],
    [/cheque|check/, 'check'],
    [/\bcash\b/, 'cash'],
  ];
  for (const t of text) for (const [re, m] of rules) if (re.test(t)) return m;
  return undefined;
}

const iso = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Customer payments dated the day of `dayStart` (ms), totalled by method. */
export async function odooPaymentsFor(client: Client, dayStart: number): Promise<OdooPayTotals> {
  const domain = [['payment_type', '=', 'inbound'], ['partner_type', '=', 'customer'], ['state', 'in', ['in_process', 'paid']], ['date', '=', iso(dayStart)]];
  const fields = ['amount', 'memo', 'journal_id', 'payment_method_line_id'];
  let rows: Record<string, unknown>[];
  try {
    rows = (await client.call('account.payment', 'search_read', [domain], { fields, limit: 500 })) as Record<string, unknown>[];
  } catch {
    // An Odoo without the memo field: the method line and journal name still tell most of it.
    rows = (await client.call('account.payment', 'search_read', [domain], { fields: fields.filter((f) => f !== 'memo'), limit: 500 })) as Record<string, unknown>[];
  }
  const out: OdooPayTotals = { byMethod: { cash: 0, check: 0, cashapp: 0, venmo: 0, zelle: 0 }, other: 0, checks: 0, count: 0 };
  for (const r of Array.isArray(rows) ? rows : []) {
    const cents = Math.round((typeof r.amount === 'number' ? r.amount : 0) * 100);
    if (cents <= 0) continue;
    const m = methodOf(r);
    out.count++;
    if (m) {
      out.byMethod[m] += cents;
      if (m === 'check') out.checks++;
    } else out.other += cents;
  }
  return out;
}
