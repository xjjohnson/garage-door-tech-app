/**
 * Plain helpers for the Office board: dollar totals, the "Do next" pick, age groups for unpaid
 * invoices and search. No React, no Odoo calls: the pages read the rows and these sort and sum them.
 */
import type { MoneyRow } from './odooOffice';

export type Age = 'all' | 'current' | 'd30' | 'd60' | 'd60plus';

export const AGE_LABEL: Record<Age, string> = { all: 'All', current: 'Current', d30: '1-30', d60: '31-60', d60plus: '60+' };
export const AGES: Age[] = ['all', 'current', 'd30', 'd60', 'd60plus'];

/** Which age group an invoice is in. `days` on an invoice row is the days past its due date (0 = not late). */
export function ageOf(row: Pick<MoneyRow, 'days'>): Exclude<Age, 'all'> {
  if (row.days <= 0) return 'current';
  if (row.days <= 30) return 'd30';
  if (row.days <= 60) return 'd60';
  return 'd60plus';
}

export const sumCents = (rows: Pick<MoneyRow, 'cents'>[]): number => rows.reduce((n, r) => n + r.cents, 0);

export interface AgeTotal {
  count: number;
  cents: number;
}

/** Count and dollars for each age group, and for all of them. */
export function ageTotals(rows: MoneyRow[]): Record<Age, AgeTotal> {
  const out: Record<Age, AgeTotal> = { all: { count: 0, cents: 0 }, current: { count: 0, cents: 0 }, d30: { count: 0, cents: 0 }, d60: { count: 0, cents: 0 }, d60plus: { count: 0, cents: 0 } };
  for (const r of rows) {
    for (const k of ['all', ageOf(r)] as const) {
      out[k].count += 1;
      out[k].cents += r.cents;
    }
  }
  return out;
}

export const inAge = (rows: MoneyRow[], age: Age): MoneyRow[] => (age === 'all' ? rows : rows.filter((r) => ageOf(r) === age));

/** Rows whose customer, number or reference holds every word typed. Empty search keeps everything. */
export function searchRows(rows: MoneyRow[], term: string): MoneyRow[] {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((r) => {
    const hay = `${r.customer} ${r.name} ${r.ref ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/**
 * What to do first: the most overdue invoices, then approved orders still to invoice, biggest
 * first. At most `limit` rows in all.
 */
export function doNext(overdue: MoneyRow[], toInvoice: MoneyRow[], limit = 5): MoneyRow[] {
  const late = [...overdue].sort((a, b) => b.days - a.days || b.cents - a.cents).slice(0, Math.max(0, limit - Math.min(2, toInvoice.length)));
  const bill = [...toInvoice].sort((a, b) => b.cents - a.cents);
  return [...late, ...bill].slice(0, limit);
}

export type Tone = 'red' | 'amber' | 'green';

/** The small colored label on a row: how late an invoice is, or what an order is waiting for. */
export function pillFor(row: MoneyRow): { text: string; tone: Tone } {
  if (row.model === 'account.move') {
    if (row.days <= 0) return { text: 'Current', tone: 'green' };
    return { text: `${row.days}d late`, tone: row.days > 30 ? 'red' : 'amber' };
  }
  return { text: row.text.startsWith('Approved') ? 'To invoice' : `${row.days}d`, tone: row.days > 7 ? 'red' : 'amber' };
}
