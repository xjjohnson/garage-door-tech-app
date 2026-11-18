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

import { readInvoice } from '../lib/odooSales';

describe('part or labor comes from the Odoo product type', () => {
  const rows = [
    { id: 1, name: 'CAP2D', quantity: 1, price_subtotal: 100, display_type: 'product', sequence: 1, product_id: [5, 'CAP2D'], tax_ids: [] },
    { id: 2, name: 'Install', quantity: 1, price_subtotal: 50, display_type: 'product', sequence: 2, product_id: [6, 'Install'], tax_ids: [3] },
    { id: 3, name: 'Loose line', quantity: 1, price_subtotal: 20, display_type: 'product', sequence: 3, product_id: false, tax_ids: [3] },
  ];
  const client = (types: unknown) => ({
    call: jest.fn(async (model: string) => {
      if (model === 'account.move') return [{ name: 'INV/1', amount_total: 1, amount_residual: 1, payment_state: 'not_paid', invoice_line_ids: [1, 2, 3] }];
      if (model === 'account.move.line') return rows;
      if (model === 'product.product') return types;
      return true;
    }),
  });
  it('goods are parts and services are labor, whatever the tax says; no product falls back to tax', async () => {
    const st = await readInvoice(client([{ id: 5, type: 'consu' }, { id: 6, type: 'service' }]) as never, 9, []);
    expect(st.lines!.map((l) => l.taxable)).toEqual([true, false, true]);
  });
  it('falls back to the tax when Odoo gives no product types', async () => {
    const st = await readInvoice(client(true) as never, 9, []);
    expect(st.lines!.map((l) => l.taxable)).toEqual([false, true, true]);
  });
});

import { soldEquipment, TRACK_BY_DEFAULT_FROM, trackedKeys } from '../lib/odooEquipment';

describe('parts are kept as equipment by default', () => {
  const lines = [{ label: 'CAP2D', cents: 1000, taxable: true, productId: 9 }, { label: 'Install', cents: 500, taxable: false }, { label: 'Tune-up plan', cents: 500, taxable: true }];
  const mk = (createdAt: number, warranty?: object) => ({ id: 'e1', number: '1', lines, createdAt, warranty, source: 'ticket', tier: 'good' }) as never;
  const s = { warrantyMonths: { good: 0, better: 0, best: 0 }, laborWarrantyDays: 0 } as never;
  it('ticks every equipment part on a new invoice and leaves older ones alone', () => {
    expect(trackedKeys(mk(TRACK_BY_DEFAULT_FROM + 1))).toEqual(['9:CAP2D']);
    expect(soldEquipment(mk(TRACK_BY_DEFAULT_FROM + 1), s).map((e) => e.name)).toEqual(['CAP2D']);
    expect(trackedKeys(mk(TRACK_BY_DEFAULT_FROM - 1))).toEqual([]);
  });
  it('respects the tech unticking everything', () => {
    expect(trackedKeys(mk(TRACK_BY_DEFAULT_FROM + 1, { tracked: [] }))).toEqual([]);
  });
});
