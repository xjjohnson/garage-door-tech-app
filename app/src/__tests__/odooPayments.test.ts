import { dayText, daySummary, withOdooPayments } from '../lib/endOfDay';
import { methodOf, odooPaymentsFor } from '../lib/odooPayments';

const pay = (amount: number, memo: string, journal = 'Bank', line = 'Manual Payment') => ({ amount, memo, journal_id: [1, journal], payment_method_line_id: [2, line] });

describe('Odoo payments for the end-of-day summary', () => {
  it('reads each way from the memo, the method line or the journal', () => {
    expect(methodOf(pay(1, 'Cash App $abc'))).toBe('cashapp');
    expect(methodOf(pay(1, 'Venmo'))).toBe('venmo');
    expect(methodOf(pay(1, 'Zelle 123'))).toBe('zelle');
    expect(methodOf(pay(1, 'Check 1042'))).toBe('check');
    expect(methodOf(pay(1, '', 'Cash'))).toBe('cash');
    expect(methodOf(pay(1, 'INV/2026/0007'))).toBeUndefined();
  });

  it('totals today by method and counts checks', async () => {
    const calls: unknown[][] = [];
    const client = {
      call: async (model: string, method: string, args: unknown[]) => {
        calls.push([model, method, args]);
        return [pay(100, 'Cash'), pay(50.5, 'Check 9'), pay(20, 'Check 10'), pay(30, 'Zelle'), pay(5, 'Other thing')];
      },
    };
    const r = await odooPaymentsFor(client, new Date(2026, 10, 14, 9).getTime());
    expect(r.byMethod).toEqual({ cash: 10000, check: 7050, cashapp: 0, venmo: 0, zelle: 3000 });
    expect(r.other).toBe(500);
    expect(r.checks).toBe(2);
    expect(JSON.stringify(calls[0][2])).toContain('2026-11-14');
  });

  it('puts Odoo figures into the summary text', () => {
    const base = daySummary({ jobs: [], invoices: [], shifts: [], appointments: [], stock: { items: [], used: [], purchases: [] } as never }, new Date(2026, 10, 14, 9).getTime());
    const s = withOdooPayments(base, { byMethod: { cash: 10000, check: 7050, cashapp: 0, venmo: 0, zelle: 3000 }, other: 500, checks: 2 });
    expect(s.taken).toBe(20550);
    expect(dayText(s, '')).toMatch(/Check \(2\): \$70\.50[\s\S]*Other: \$5[\s\S]*To deposit: \$170\.50/);
  });
});
