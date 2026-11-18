import type { OdooClient } from '../lib/odoo';
import { forWhatText, listPurchases, nextStepText } from '../lib/odooPurchasing';
import { openReceipts } from '../lib/odooWarehouse';

const NOW = Date.parse('2026-11-18T20:00:00Z');

function client(h: Record<string, (args: unknown[]) => unknown>): OdooClient {
  return {
    session: { uid: 5, name: 'Sam', kind: 'oca' },
    call: async (model: string, method: string, args: unknown[] = []) => {
      const f = h[`${model}.${method}`];
      if (!f) throw new Error(`unexpected ${model}.${method}`);
      return f(args);
    },
  } as unknown as OdooClient;
}

describe('order details', () => {
  it('says plainly what an order is for and what is next', () => {
    expect(forWhatText('Job S00012')).toBe('For job S00012');
    expect(forWhatText('Johnsons app reorder')).toBe('Stock reorder');
    expect(forWhatText('')).toBe('');
    expect(nextStepText('draft', false)).toMatch(/confirm and email/);
    expect(nextStepText('receive', true)).toMatch(/past due/);
    expect(nextStepText('done', false)).toMatch(/received/);
  });

  it('purchase order rows carry parts, who ordered and what for', async () => {
    const c = client({
      'purchase.order.search_read': () => [{ id: 9, name: 'P00009', partner_id: [3, 'Westwinds'], state: 'purchase', amount_total: 120.5, date_planned: '2026-11-18 08:00:00', origin: 'Job S00012', create_uid: [5, 'Sam'], order_line: [41, 42] }],
      'purchase.order.line.read': () => [
        { id: 41, product_id: [1, 'Torsion spring'], product_qty: 2, price_unit: 40 },
        { id: 42, product_id: [2, 'Cable'], product_qty: 1, price_unit: 40.5 },
      ],
    });
    const [r] = await listPurchases(c, NOW);
    expect(r.items).toEqual([{ name: 'Torsion spring', qty: 2, priceCents: 4000 }, { name: 'Cable', qty: 1, priceCents: 4050 }]);
    expect(r.orderedBy).toBe('Sam');
    expect(r.forWhat).toBe('For job S00012');
    expect(r.late).toBe(true);
    expect(r.next).toMatch(/past due/);
  });

  it('receipts show who ordered, what for, and the amount when the order can be read', async () => {
    const base = {
      'stock.picking.search_read': () => [{ id: 1, name: 'JHS/IN/00007', partner_id: [3, 'Westwinds'], origin: 'P00009', scheduled_date: '2026-11-18 08:00:00' }],
      'stock.move.search_read': () => [{ id: 7, picking_id: [1, 'x'], product_id: [1, 'Torsion spring'], product_uom_qty: 2 }],
    };
    const [r] = await openReceipts(client({ ...base, 'purchase.order.search_read': () => [{ name: 'P00009', origin: 'Johnsons app reorder', create_uid: [5, 'Sam'], amount_total: 80 }] }), NOW);
    expect(r).toMatchObject({ orderedBy: 'Sam', forWhat: 'Stock reorder', totalCents: 8000 });
    // If Odoo will not let the phone read the order, the receipt still lists its parts.
    const [plain] = await openReceipts(client(base), NOW);
    expect(plain.lines).toHaveLength(1);
    expect(plain.orderedBy).toBeUndefined();
  });
});
