import { isTrackable } from '../lib/odooEquipment';
import { odooSnapshot } from '../lib/odooStats';

describe('isTrackable', () => {
  it('never tracks visits or labor', () => {
    for (const l of ['Annual Tune-Up', 'Safety Inspection', 'Service call', 'Labor']) expect(isTrackable(l)).toBe(false);
    for (const l of ['Garage door opener', '16x7 insulated door', 'Torsion spring']) expect(isTrackable(l)).toBe(true);
  });
});

describe('odooSnapshot', () => {
  it('counts only what Odoo has', async () => {
    const now = new Date(2026, 10, 15, 12).getTime();
    const call = jest.fn(async (model: string, method: string) => {
      if (method === 'search_count') return 2;
      if (model === 'account.payment') return [{ amount: 100.5, date: '2026-11-14', memo: 'Venmo' }];
      if (model === 'account.move') return [{ amount_total: 200, amount_residual: 50, invoice_date: '2026-11-10', name: 'INV/1', partner_id: [1, 'Ann'] }];
      return [];
    });
    const s = await odooSnapshot({ call, session: { kind: 'oca' } } as never, now);
    expect(s.openJobs).toBe(2);
    expect(s.week.collected).toBe(10050);
    expect(s.week.byMethod.venmo).toBe(10050);
    expect(s.owed).toBe(5000);
    expect(s.oldestText).toContain('INV/1');
    expect(s.months).toHaveLength(6);
  });
});
