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
    expect(lines.map((l) => l.label)).toEqual(['CAP2D']);
    expect(lines[0]!.key).toBe('9:CAP2D');
  });
});
