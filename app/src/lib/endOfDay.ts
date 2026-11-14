/**
 * The end-of-day wrap-up: what got done today, the money taken by how it was
 * paid (cash and checks to take to the bank), what's still owed, hours and
 * miles, and what to finish before closing the day. Kept free of React.
 */
import { checkCounts } from './inspection';
import { balance, Invoice, PAY_LABEL, PayMethod } from './invoices';
import type { Job } from './jobs';
import { formatMoney } from './prices';
import { addDays, Appointment, startOfDay } from './schedule';
import { orders, onOrder, StockStore, usedTotals } from './stock';
import { formatHours, Shift, shiftMiles, shiftMs } from './worklog';

export const DAY_CLOSE_STORAGE_KEY = 'day-close/v1';

export interface DaySummary {
  day: number;
  /** Jobs worked today (arrived, done, or booked today). */
  jobs: number;
  jobsDone: number;
  /** Invoices made today, cents. */
  billed: number;
  /** Payments taken today, cents, by how. */
  byMethod: Record<PayMethod, number>;
  checks: number;
  /** Payments Odoo has that match none of the five ways, cents. */
  other?: number;
  /** The money figures came from Odoo's payments, not the phone's. */
  fromOdoo?: true;
  taken: number;
  /** Still owed on today's invoices, cents. */
  owed: number;
  ms: number;
  miles: number;
  /** Today's jobs with an inspection, and how many of those are finished. */
  inspections: number;
  inspectionsDone: number;
  /** Parts lines on the supplier orders waiting to go out. */
  toOrder: number;
  partsUsed: number;
  /** A shift still on the clock. */
  onClock: boolean;
}

const today = (ms: number | undefined, day: number) => ms !== undefined && ms >= day && ms < addDays(day, 1);

export function daySummary(data: { jobs: Job[]; invoices: Invoice[]; shifts: Shift[]; appointments: Appointment[]; stock: StockStore }, now: number): DaySummary {
  const day = startOfDay(now);
  const booked = new Set(data.appointments.filter((a) => a.status !== 'cancelled' && today(a.start, day) && a.jobId).map((a) => a.jobId!));
  const worked = data.jobs.filter((j) => booked.has(j.id) || today(j.steps?.arrivedAt, day) || today(j.steps?.workDoneAt, day) || (j.status === 'done' && today(j.updatedAt, day)));
  const done = worked.filter((j) => today(j.steps?.workDoneAt, day) || j.status === 'done');
  const live = data.invoices.filter((i) => !i.voidedAt);
  const made = live.filter((i) => today(i.createdAt, day));
  const byMethod: Record<PayMethod, number> = { cash: 0, check: 0, cashapp: 0, venmo: 0, zelle: 0 };
  let checks = 0;
  for (const i of live)
    for (const p of i.payments)
      if (today(p.at, day)) {
        byMethod[p.method] += p.amount;
        if (p.method === 'check') checks++;
      }
  const shifts = data.shifts.filter((s) => today(s.start, day));
  const withInspection = worked.filter((j) => j.inspection);
  const ordered = onOrder(data.stock.purchases);
  return {
    day,
    jobs: worked.length,
    jobsDone: done.length,
    billed: made.reduce((n, i) => n + i.total, 0),
    byMethod,
    checks,
    taken: Object.values(byMethod).reduce((a, b) => a + b, 0),
    owed: made.reduce((n, i) => n + balance(i), 0),
    ms: shifts.reduce((n, s) => n + shiftMs(s, now), 0),
    miles: shifts.reduce((n, s) => n + shiftMiles(s), 0),
    inspections: withInspection.length,
    inspectionsDone: withInspection.filter((j) => {
      const c = checkCounts(j.inspection);
      return c.done >= c.total;
    }).length,
    toOrder: orders(data.stock.items, ordered).reduce((n, o) => n + o.lines.length, 0),
    partsUsed: usedTotals(data.stock.used, { from: day, to: addDays(day, 1) }).reduce((n, u) => n + u.qty, 0),
    onClock: shifts.some((s) => s.end === undefined),
  };
}

/** Swaps the phone's money figures for what Odoo's payments say was taken today. */
export function withOdooPayments(s: DaySummary, o: { byMethod: Record<PayMethod, number>; other: number; checks: number }): DaySummary {
  return { ...s, byMethod: o.byMethod, checks: o.checks, other: o.other, fromOdoo: true, taken: Object.values(o.byMethod).reduce((a, b) => a + b, 0) + o.other };
}

/** The phone-pay apps together, as the wrap-up shows them. */
export const appMoney = (s: Pick<DaySummary, 'byMethod'>) => s.byMethod.cashapp + s.byMethod.venmo + s.byMethod.zelle;

/** A plain-text summary to keep or send (to a bookkeeper, or yourself). */
export function dayText(s: DaySummary, who: string): string {
  const d = new Date(s.day);
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const lines = [`${who ? `${who} · ` : ''}${date}`, `Jobs: ${s.jobsDone} of ${s.jobs} done`, `Billed: ${formatMoney(s.billed)}`];
  for (const m of ['cash', 'check', 'cashapp', 'venmo', 'zelle'] as PayMethod[]) if (s.byMethod[m] > 0) lines.push(`${PAY_LABEL[m]}${m === 'check' ? ` (${s.checks})` : ''}: ${formatMoney(s.byMethod[m])}`);
  if (s.other) lines.push(`Other: ${formatMoney(s.other)}`);
  if (s.byMethod.cash + s.byMethod.check > 0) lines.push(`To deposit: ${formatMoney(s.byMethod.cash + s.byMethod.check)}`);
  if (s.owed > 0) lines.push(`Still owed: ${formatMoney(s.owed)}`);
  lines.push(`Hours: ${formatHours(s.ms)}`, `Miles: ${s.miles}`);
  if (s.partsUsed > 0) lines.push(`Parts used: ${s.partsUsed}`);
  return lines.join('\n');
}

export interface ClosedDay {
  day: number;
  at: number;
  text: string;
  /** Closed after summaries started going to Odoo, and not noted on the employee record yet. Older summaries are never sent. */
  toOdoo?: true;
  /** When the summary was noted on the tech's employee record in Odoo. */
  odooAt?: number;
}

export function parseClosedDays(raw: string | null): ClosedDay[] {
  try {
    const d = raw ? JSON.parse(raw) : [];
    return Array.isArray(d)
      ? d
          .filter((x): x is ClosedDay => x && typeof x.day === 'number' && typeof x.at === 'number' && typeof x.text === 'string')
          .map((x) => ({ day: x.day, at: x.at, text: x.text, ...(x.toOdoo === true ? { toOdoo: true as const } : {}), ...(typeof x.odooAt === 'number' ? { odooAt: x.odooAt } : {}) }))
      : [];
  } catch {
    return [];
  }
}
