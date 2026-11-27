import { ageOf, ageTotals, doNext, inAge, pillFor, searchRows, sumCents } from '../lib/officeBoard';
import type { MoneyRow } from '../lib/odooOffice';
import { hoursText, summarizeHours, weekStart } from '../lib/odooPeople';

const inv = (id: number, customer: string, cents: number, days: number): MoneyRow => ({ model: 'account.move', id, name: `INV/${id}`, partnerId: id, customer, cents, days, text: '', phone: '' });
const ord = (id: number, customer: string, cents: number, days = 3): MoneyRow => ({ model: 'sale.order', id, name: `S${id}`, partnerId: id, customer, cents, days, text: 'Approved 3 days ago', phone: '' });

describe('Office board helpers', () => {
  const rows = [inv(1, 'Kim Ortega', 124750, 34), inv(2, 'Lee Park', 118000, 21), inv(3, 'Pat Smith', 41250, 9), inv(4, 'Rita Moss', 14900, 0), inv(5, 'Old Debt', 5000, 75)];

  it('puts invoices in age groups by days late', () => {
    expect(rows.map(ageOf)).toEqual(['d60', 'd30', 'd30', 'current', 'd60plus']);
  });

  it('totals the dollars for each age group and for all', () => {
    const t = ageTotals(rows);
    expect(t.all).toEqual({ count: 5, cents: 124750 + 118000 + 41250 + 14900 + 5000 });
    expect(t.d30).toEqual({ count: 2, cents: 159250 });
    expect(t.current.count).toBe(1);
    expect(inAge(rows, 'd60plus').map((r) => r.id)).toEqual([5]);
    expect(inAge(rows, 'all')).toHaveLength(5);
  });

  it('searches by customer, number or reference, every word must match', () => {
    expect(searchRows(rows, 'kim').map((r) => r.id)).toEqual([1]);
    expect(searchRows(rows, 'inv/3').map((r) => r.id)).toEqual([3]);
    expect(searchRows(rows, 'lee smith')).toEqual([]);
    expect(searchRows(rows, '  ')).toBe(rows);
  });

  it('picks the most overdue invoices first, then the biggest orders to invoice, at most five', () => {
    const next = doNext(rows, [ord(10, 'Ann Lee', 64000), ord(11, 'Dave Cruz', 9000), ord(12, 'Third', 100)]);
    expect(next).toHaveLength(5);
    expect(next.map((r) => r.id)).toEqual([5, 1, 2, 10, 11]);
  });

  it('keeps room for orders to invoice when many invoices are late', () => {
    const many = Array.from({ length: 9 }, (_, i) => inv(100 + i, `C${i}`, 1000, 10 + i));
    const next = doNext(many, [ord(1, 'A', 5), ord(2, 'B', 4)]);
    expect(next.filter((r) => r.model === 'sale.order')).toHaveLength(2);
  });

  it('labels rows: late invoices by how late, orders as to invoice', () => {
    expect(pillFor(inv(1, 'x', 1, 0))).toEqual({ text: 'Current', tone: 'green' });
    expect(pillFor(inv(1, 'x', 1, 9))).toEqual({ text: '9d late', tone: 'amber' });
    expect(pillFor(inv(1, 'x', 1, 34))).toEqual({ text: '34d late', tone: 'red' });
    expect(pillFor(ord(1, 'x', 1)).text).toBe('To invoice');
  });

  it('adds up cents', () => {
    expect(sumCents(rows)).toBe(303900);
  });
});

describe('People hours', () => {
  const MON = new Date(2026, 10, 23, 0, 0, 0).getTime(); // Monday Nov 23, 2026
  const h = (days: number, hours: number) => MON + days * 86_400_000 + hours * 3_600_000;

  it('finds Monday as the start of the week from any day', () => {
    expect(weekStart(h(3, 15))).toBe(MON);
    expect(weekStart(h(6, 23))).toBe(MON);
    expect(weekStart(MON)).toBe(MON);
  });

  it('sums hours per day, counts an open shift up to now, and marks who is clocked in', () => {
    const people = [{ id: 1, name: 'Sam', job: 'Tech' }, { id: 2, name: 'Dana', job: '' }, { id: 3, name: 'Jo', job: '' }];
    const punches = [
      { employeeId: 1, start: h(0, 8), end: h(0, 16.5) },
      { employeeId: 1, start: h(1, 8), end: h(1, 12) },
      { employeeId: 1, start: h(2, 8) },
      { employeeId: 2, start: h(0, 9), end: h(0, 17) },
    ];
    const out = summarizeHours(people, punches, MON, h(2, 10.5));
    expect(out[0].days.slice(0, 3)).toEqual([8.5, 4, 2.5]);
    expect(out[0].hours).toBe(15);
    expect(out[0].in).toBe(true);
    expect(out[0].since).toBe(h(2, 8));
    expect(out[1].in).toBe(false);
    expect(out[1].hours).toBe(8);
    expect(out[2].hours).toBe(0);
    expect(hoursText(out[2].hours)).toBe('–');
    expect(hoursText(8.5)).toBe('8.5 h');
  });

  it('ignores punches outside the week', () => {
    const out = summarizeHours([{ id: 1, name: 'Sam', job: '' }], [{ employeeId: 1, start: MON - 86_400_000, end: MON - 80_000_000 }], MON, h(1, 0));
    expect(out[0].hours).toBe(0);
  });
});
