/**
 * Pure helpers for the Sales layouts (aging, chase list, grouped by what is
 * owed). They read Odoo's invoice rows and never change them.
 */
import type { OdooListRow } from './odooLists';

const DAY = 24 * 3600 * 1000;

/** Money still owed on a row (credit notes and paid ones owe nothing). */
export function owedOf(r: OdooListRow): number {
  if (r.refund || !isUnpaid(r)) return 0;
  return r.residual && r.residual > 0 ? r.residual : r.total;
}

/** An invoice that still wants payment: not paid, draft, cancelled, reversed or a credit note. */
export function isUnpaid(r: OdooListRow): boolean {
  if (r.refund) return false;
  return r.warn || /not paid|overdue|partial/i.test(r.status);
}

/** Whole days past due (0 when not yet due or no due date). */
export function daysLate(r: OdooListRow, now: number): number {
  if (!r.due || r.due >= now) return 0;
  return Math.floor((now - r.due) / DAY);
}

export type Bucket = 'Current' | '1-7 days' | '8-30 days' | '30+ days';
export const BUCKETS: Bucket[] = ['Current', '1-7 days', '8-30 days', '30+ days'];

export function bucketOf(r: OdooListRow, now: number): Bucket {
  const d = daysLate(r, now);
  return d === 0 ? 'Current' : d <= 7 ? '1-7 days' : d <= 30 ? '8-30 days' : '30+ days';
}

/** What is owed in each age bucket, oldest last. */
export function agingBuckets(rows: OdooListRow[], now: number): { bucket: Bucket; total: number; count: number }[] {
  return BUCKETS.map((bucket) => {
    const mine = rows.filter((r) => isUnpaid(r) && bucketOf(r, now) === bucket);
    return { bucket, total: mine.reduce((n, r) => n + owedOf(r), 0), count: mine.length };
  });
}

/** Unpaid rows, the longest overdue first. */
export function chaseOrder(rows: OdooListRow[], now: number): OdooListRow[] {
  return rows.filter(isUnpaid).sort((a, b) => daysLate(b, now) - daysLate(a, now) || owedOf(b) - owedOf(a));
}

export type Section = 'Overdue' | 'Not paid yet' | 'Paid and other';

/** Rows under Overdue, Not paid yet and Paid and other, each with what is owed. Empty sections are left out. */
export function sections(rows: OdooListRow[], now: number): { title: Section; rows: OdooListRow[]; owed: number }[] {
  const pick = (r: OdooListRow): Section => (!isUnpaid(r) ? 'Paid and other' : daysLate(r, now) > 0 ? 'Overdue' : 'Not paid yet');
  const order: Section[] = ['Overdue', 'Not paid yet', 'Paid and other'];
  return order
    .map((title) => {
      const mine = rows.filter((r) => pick(r) === title);
      return { title, rows: mine, owed: mine.reduce((n, r) => n + owedOf(r), 0) };
    })
    .filter((s) => s.rows.length > 0);
}
