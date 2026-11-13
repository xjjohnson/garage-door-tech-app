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

/** The records themselves, for the Waiting for Odoo list. */
export interface PendingItems {
  customers: Customer[];
  jobs: Job[];
  quotes: Job[];
  invoices: Invoice[];
  /** Invoices in Odoo with payments Odoo hasn't recorded, and how many. */
  payments: { invoice: Invoice; count: number }[];
}

/** `since`: when the phone started sending jobs (src/lib/useJobsSince.ts); older jobs count only once picked. */
export function pendingItems(customers: Customer[], jobs: Job[], invoices: Invoice[], since: number | null = 0): PendingItems {
  const live = invoices.filter((i) => !i.voidedAt);
  return {
    customers: customers.filter((x) => !x.odooId || x.updatedAt > (x.syncedAt ?? 0)),
    jobs: jobs.filter((x) => shouldSend(x, since)),
    quotes: jobs.filter((j) => j.accepted && !j.odooOrder),
    invoices: live.filter((i) => !i.odoo),
    payments: live.flatMap((i) => {
      const count = i.odoo ? i.payments.filter((p) => !i.odoo!.sentPayments.includes(p.id)).length : 0;
      return count ? [{ invoice: i, count }] : [];
    }),
  };
}

export function pendingSync(customers: Customer[], jobs: Job[], invoices: Invoice[], since: number | null = 0): Pending {
  const it = pendingItems(customers, jobs, invoices, since);
  const c = it.customers.length;
  const j = it.jobs.length;
  const q = it.quotes.length;
  const inv = it.invoices.length;
  const pay = it.payments.reduce((n, x) => n + x.count, 0);
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
