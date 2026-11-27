/**
 * Small money sums for the owner's screens. Plain logic over rows the app already reads from Odoo,
 * so it is tested without Odoo.
 */
import type { OdooClient } from './odoo';

/** Owed amounts (cents) by how late the invoice is: not late yet, 1 to 30 days late, over 30 days late. */
export function ageBuckets(rows: { cents: number; days: number }[]): { current: number; late30: number; late: number } {
  const out = { current: 0, late30: 0, late: 0 };
  for (const r of rows) {
    if (r.days <= 0) out.current += r.cents;
    else if (r.days <= 30) out.late30 += r.cents;
    else out.late += r.cents;
  }
  return out;
}

/** How much this is up or down from last time, in whole percent. Null when there is nothing to compare with. */
export function changePercent(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/** Whole dollars with commas, from cents: 1842000 becomes "$18,420". */
export const dollars = (cents: number): string => `${cents < 0 ? '-' : ''}$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;

/** Who is clocked in right now: open Odoo Attendance records. */
export async function clockedIn(client: Pick<OdooClient, 'call'>): Promise<number> {
  return Number(await client.call('hr.attendance', 'search_count', [[['check_out', '=', false]]]));
}
