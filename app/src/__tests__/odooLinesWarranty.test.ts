import { Invoice, trackKey, withOdoo } from '../lib/invoices';
import { partWarranties } from '../lib/followups';

describe('Odoo lines keep the parts for warranty', () => {
  it('still lists a taxable part after Odoo sends its own lines back', () => {
    const inv = {
      id: 'i1',
      createdAt: Date.UTC(2026, 10, 17),
      source: 'ticket',
      tier: 'good',
      lines: [
        { label: 'CAP2D', cents: 207870, taxable: true, productId: 9 },
        { label: '3rd Party Op Install', cents: 30000, taxable: false },
      ],
    } as unknown as Invoice;
    const out = withOdoo(inv, { name: '26-11-04', lines: [{ label: '3rd Party Op Install', cents: 30000, qty: 1 }, { label: 'CAP2D', cents: 207870, qty: 1 }] } as never);
    const lines = partWarranties(out, { warrantyMonths: { good: 0, better: 0, best: 0 } } as never, trackKey);
    expect(lines.map((l) => [l.label, l.part])).toEqual([['3rd Party Op Install', false], ['CAP2D', true]]);
    expect(lines[1]!.key).toBe('9:CAP2D');
  });
});

describe('Odoo says which lines are taxed', () => {
  it('treats a line Odoo taxed as a part even when the phone has lost its own copy', () => {
    const inv = { id: 'i2', createdAt: Date.UTC(2026, 10, 17), source: 'ticket', tier: 'good', lines: [{ label: 'CAP2D', cents: 207870, taxable: false }] } as unknown as Invoice;
    const out = withOdoo(inv, { name: 'X', lines: [{ label: 'CAP2D', cents: 207870, qty: 1, taxable: true }, { label: 'Install', cents: 30000, qty: 1, taxable: false }] } as never);
    expect(out.lines.map((l) => l.taxable)).toEqual([true, false]);
  });
});

describe('labor lines follow the job labor warranty', () => {
  const inv = { id: 'i3', createdAt: Date.UTC(2026, 10, 17), source: 'ticket', tier: 'good', warranty: { partsMonths: 24, laborDays: 30, partMonths: { ':Install': 24 } }, lines: [{ label: 'CAP2D', cents: 1000, taxable: true }, { label: 'Install', cents: 500, taxable: false }] } as unknown as Invoice;
  const s = { warrantyMonths: { good: 0, better: 0, best: 0 }, laborWarrantyDays: 0 } as never;
  it('uses the labor days, not a parts length, and a part keeps its years', () => {
    const [part, labor] = partWarranties(inv, s, trackKey);
    expect(part!.months).toBe(24);
    expect(labor!.part).toBe(false);
    expect(labor!.until).toBe(Date.UTC(2026, 10, 17) + 30 * 86400000);
  });
  it('can be switched off on its own', () => {
    const off = { ...inv, warranty: { ...inv.warranty, partMonths: { ':Install': 0 } } } as Invoice;
    expect(partWarranties(off, s, trackKey)[1]!.until).toBeNull();
  });
});
