/**
 * The few limits the Office, Sales and Owner pages use ("a quote is quiet
 * after 3 days", "an invoice is late the day after it is due"). Kept in Odoo,
 * as a small settings file on the company next to the business details, so
 * every phone uses the same numbers; the owner edits them in Management >
 * Departments. Kept free of React.
 */
import type { OdooClient } from './odoo';
import { myCompany } from './odooSettings';

type Caller = Pick<OdooClient, 'call' | 'session'>;

export const LIMITS_FILE = 'johnsons-department-limits.json';

export interface DeptLimits {
  /** A sent quote with no change for this many days is "gone quiet". */
  quoteQuietDays: number;
  /** An invoice is late once it is this many days past its due date. */
  lateInvoiceDays: number;
  /** Jobs closed and orders waiting to be invoiced are looked at this far back. */
  invoiceLookbackDays: number;
  /** A customer is "not seen" when their latest job was this many months ago. */
  notSeenMonths: number;
  /** A maintenance plan is "about to renew" this many days before it ends. */
  planRenewDays: number;
  /** The same house again within this many days is a callback. */
  callbackDays: number;
}

export const DEFAULT_LIMITS: DeptLimits = { quoteQuietDays: 3, lateInvoiceDays: 1, invoiceLookbackDays: 60, notSeenMonths: 12, planRenewDays: 60, callbackDays: 30 };

export const LIMIT_LABELS: Record<keyof DeptLimits, { label: string; unit: string }> = {
  quoteQuietDays: { label: 'Quote gone quiet after', unit: 'days' },
  lateInvoiceDays: { label: 'Invoice late after its due date by', unit: 'days' },
  invoiceLookbackDays: { label: 'Look back for jobs not invoiced', unit: 'days' },
  notSeenMonths: { label: 'Customer not seen for', unit: 'months' },
  planRenewDays: { label: 'Plan about to renew within', unit: 'days' },
  callbackDays: { label: 'Callback if the same house again within', unit: 'days' },
};

/** Numbers from a saved file; anything missing or not a sensible number falls back to the default. */
export function parseLimits(v: unknown): DeptLimits {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const out = { ...DEFAULT_LIMITS };
  for (const k of Object.keys(DEFAULT_LIMITS) as (keyof DeptLimits)[]) {
    const n = o[k];
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 3650) out[k] = Math.round(n);
  }
  return out;
}

const toBase64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
const fromBase64 = (b: string) => decodeURIComponent(escape(atob(b)));

async function findFile(c: Caller, company: number) {
  const rows = (await c.call('ir.attachment', 'search_read', [[['res_model', '=', 'res.company'], ['res_id', '=', company], ['name', '=', LIMITS_FILE]]], { fields: ['datas'], limit: 1, order: 'id desc' })) as { id: number; datas?: string | false }[];
  return rows[0];
}

/** The saved limits, or the defaults when none are saved or Odoo can't be read. */
export async function readLimits(c: Caller): Promise<DeptLimits> {
  try {
    const f = await findFile(c, await myCompany(c));
    if (f && typeof f.datas === 'string' && f.datas) return parseLimits(JSON.parse(fromBase64(f.datas)));
  } catch {
    // Use the defaults.
  }
  return DEFAULT_LIMITS;
}

export async function writeLimits(c: Caller, limits: DeptLimits): Promise<void> {
  const company = await myCompany(c);
  const datas = toBase64(JSON.stringify(parseLimits(limits)));
  const f = await findFile(c, company);
  if (f) await c.call('ir.attachment', 'write', [[f.id], { datas }]);
  else await c.call('ir.attachment', 'create', [{ name: LIMITS_FILE, type: 'binary', datas, res_model: 'res.company', res_id: company, mimetype: 'application/json' }]);
}
