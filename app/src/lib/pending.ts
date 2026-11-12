/**
 * What the phone has that Odoo doesn't yet, for the not-synced badge. Worked
 * out from the saved data itself, so it's always right without a separate
 * list to keep in step.
 */
import type { Customer } from './customers';
import type { Invoice } from './invoices';
import type { Job } from './jobs';
import { shouldSend } from './odooJobs';

export interface Pending {
  /** Customers new on the phone, or changed since the last sync. */
  customers: number;
  /** Open jobs not yet in Odoo as Field Service orders. */
  jobs: number;
  /** Accepted quotes not yet sent as sales orders. */
  quotes: number;
  /** Invoices not yet in Odoo. */
  invoices: number;
  /** Payments taken on the phone that Odoo hasn't recorded. */
  payments: number;
  total: number;
}

/** `since`: when the phone started sending jobs (src/lib/useJobsSince.ts); older jobs count only once picked. */
export function pendingSync(customers: Customer[], jobs: Job[], invoices: Invoice[], since: number | null = 0): Pending {
  const c = customers.filter((x) => !x.odooId || x.updatedAt > (x.syncedAt ?? 0)).length;
  const q = jobs.filter((j) => j.accepted && !j.odooOrder).length;
  const live = invoices.filter((i) => !i.voidedAt);
  const inv = live.filter((i) => !i.odoo).length;
  const pay = live.reduce((n, i) => n + (i.odoo ? i.payments.filter((p) => !i.odoo!.sentPayments.includes(p.id)).length : 0), 0);
  const j = jobs.filter((x) => shouldSend(x, since)).length;
  return { customers: c, jobs: j, quotes: q, invoices: inv, payments: pay, total: c + j + q + inv + pay };
}

/** "2 customers, 1 invoice" for the badge's detail. */
export function describePending(p: Pending): string {
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => n && parts.push(`${n} ${n === 1 ? one : many}`);
  add(p.customers, 'customer', 'customers');
  add(p.jobs, 'job', 'jobs');
  add(p.quotes, 'quote', 'quotes');
  add(p.invoices, 'invoice', 'invoices');
  add(p.payments, 'payment', 'payments');
  return parts.join(', ');
}
