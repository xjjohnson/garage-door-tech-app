/**
 * How the business is doing, worked out from what's on the phone: jobs,
 * quotes the customer picked, invoices and payments. Kept free of React so it
 * can be tested directly. Weeks start on Monday, in the phone's own time zone.
 */
import { balance, Invoice, invoiceStatus, PAY_METHODS, PayMethod } from './invoices';
import { Job } from './jobs';

export interface Period {
  start: number;
  end: number;
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function thisWeek(now: number): Period {
  const d = new Date(startOfDay(now));
  const back = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - back);
  const start = d.getTime();
  d.setDate(d.getDate() + 7);
  return { start, end: d.getTime() };
}

export function monthOf(now: number, offset = 0): Period {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth() + offset, 1).getTime();
  const end = new Date(d.getFullYear(), d.getMonth() + offset + 1, 1).getTime();
  return { start, end };
}

const inside = (ms: number | undefined, p: Period) => ms !== undefined && ms >= p.start && ms < p.end;

export interface PeriodStats {
  /** Payments received, in cents. */
  collected: number;
  /** Invoices made (not void), total in cents. */
  invoiced: number;
  invoices: number;
  jobsSaved: number;
  /** Quotes the customer said yes to. */
  accepted: number;
  /** Accepted quotes as a share of jobs saved, 0 to 1, or null with no jobs. */
  closeRate: number | null;
  /** Average invoice total, in cents, or null with no invoices. */
  averageTicket: number | null;
  byMethod: Record<PayMethod, number>;
}

export function periodStats(jobs: Job[], invoices: Invoice[], p: Period): PeriodStats {
  const live = invoices.filter((i) => invoiceStatus(i) !== 'void');
  const byMethod = Object.fromEntries(PAY_METHODS.map((m) => [m, 0])) as Record<PayMethod, number>;
  let collected = 0;
  for (const i of live)
    for (const pay of i.payments)
      if (inside(pay.at, p)) {
        collected += pay.amount;
        byMethod[pay.method] += pay.amount;
      }
  const made = live.filter((i) => inside(i.createdAt, p));
  const invoiced = made.reduce((n, i) => n + i.total, 0);
  const jobsSaved = jobs.filter((j) => inside(j.savedAt, p)).length;
  const accepted = jobs.filter((j) => inside(j.accepted?.at, p)).length;
  return {
    collected,
    invoiced,
    invoices: made.length,
    jobsSaved,
    accepted,
    closeRate: jobsSaved > 0 ? Math.min(1, accepted / jobsSaved) : null,
    averageTicket: made.length > 0 ? Math.round(invoiced / made.length) : null,
    byMethod,
  };
}

export interface Snapshot {
  openJobs: number;
  /** Still owed on unpaid and part-paid invoices, in cents. */
  owed: number;
  owedInvoices: number;
  /** The oldest unpaid invoice, for a nudge. */
  oldestOwed?: Invoice;
  week: PeriodStats;
  month: PeriodStats;
  /** Collected per month, oldest first, ending with this month. */
  months: { start: number; collected: number }[];
}

export function snapshot(jobs: Job[], invoices: Invoice[], now: number, monthsBack = 6): Snapshot {
  const owing = invoices.filter((i) => ['unpaid', 'partial'].includes(invoiceStatus(i)));
  const months = Array.from({ length: monthsBack }, (_, k) => {
    const p = monthOf(now, k - monthsBack + 1);
    return { start: p.start, collected: periodStats(jobs, invoices, p).collected };
  });
  return {
    openJobs: jobs.filter((j) => j.status === 'open').length,
    owed: owing.reduce((n, i) => n + balance(i), 0),
    owedInvoices: owing.length,
    ...(owing.length > 0 ? { oldestOwed: [...owing].sort((a, b) => a.createdAt - b.createdAt)[0] } : {}),
    week: periodStats(jobs, invoices, thisWeek(now)),
    month: periodStats(jobs, invoices, monthOf(now)),
    months,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (ms: number) => MONTHS[new Date(ms).getMonth()];

export function percent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}
