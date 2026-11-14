import { DEFAULT_FOLLOW_UP } from '../lib/followups';
import { equipmentKind, equipmentReady, mergeNotes, orderLocation, sendEquipment, soldEquipment, warrantyLines } from '../lib/odooEquipment';

const book = [
  { id: 1, name: 'Genie 2028 Opener', category: ['Openers', 'Genie Operators'] },
  { id: 2, name: 'Clopay 16x7 Door', category: ['Doors'] },
  { id: 3, name: 'Door roller', category: ['Door Parts'] },
  { id: 4, name: 'Torsion spring', category: ['Springs'] },
];
const inv = (lines: object[], over: object = {}) => ({ id: 'i1', number: '1004', createdAt: Date.UTC(2026, 10, 14, 12), tier: 'good' as const, lines: lines as never, warranty: { partsMonths: 12, laborMonths: 6 }, ...over });
const line = (productId: number, qty = 1) => ({ label: 'x', cents: 100, taxable: true, productId, qty });

describe('what counts as equipment', () => {
  it('is a door or an opener, by category, not parts or springs', () => {
    expect(book.map((b) => equipmentKind(b))).toEqual(['opener', 'door', null, null]);
  });
});

describe('soldEquipment', () => {
  it('makes a record for each door and opener sold, with the job warranty', () => {
    const items = soldEquipment(inv([line(1), line(2), line(3), line(4)]), book, DEFAULT_FOLLOW_UP);
    expect(items.map((i) => [i.kind, i.name, i.productId])).toEqual([['opener', 'Genie 2028 Opener', 1], ['door', 'Clopay 16x7 Door', 2]]);
    expect(items[0].lines[0]).toBe('Sold: Nov 14, 2026 (invoice 1004)');
    expect(items[0].lines.some((l) => l.startsWith('Warranty on parts until Nov 14, 2027'))).toBe(true);
    expect(items[0].lines.some((l) => l.startsWith('Warranty on labor until May 14, 2027'))).toBe(true);
  });
  it('makes one per unit and ignores hand-typed lines', () => {
    expect(soldEquipment(inv([line(1, 2), { label: 'Opener install', cents: 15000, taxable: false }]), book, DEFAULT_FOLLOW_UP).map((i) => i.name)).toEqual(['Genie 2028 Opener 1', 'Genie 2028 Opener 2']);
  });
  it('has nothing when nothing sold is a door or opener', () => {
    expect(soldEquipment(inv([line(4)]), book, DEFAULT_FOLLOW_UP)).toEqual([]);
  });
});

describe('warrantyLines', () => {
  it('writes lines only for what is covered', () => {
    expect(warrantyLines({ partsUntil: null, laborUntil: null })).toEqual([]);
    expect(warrantyLines({ partsUntil: null, laborUntil: Date.UTC(2027, 5, 15, 12) })[0]).toMatch(/^Warranty on labor until Jun 15, 2027/);
  });
});

describe('mergeNotes', () => {
  const item = { key: 'd-1', lines: ['Sold: x'] };
  it('adds the block after notes typed in Odoo and replaces only its own block later', () => {
    const first = mergeNotes('Gate code 1234', item);
    expect(first.startsWith('Gate code 1234')).toBe(true);
    const next = mergeNotes(first, { key: 'd-1', lines: ['Warranty: y'] });
    expect(next).toContain('Gate code 1234');
    expect(next).toContain('Warranty: y');
    expect(next).not.toContain('Sold: x');
  });
});

describe('sending to Odoo', () => {
  it('skips Odoo without equipment', async () => {
    expect(await equipmentReady({ call: async () => { throw new Error("Object fsm.equipment doesn't exist"); } })).toBeNull();
  });
  it('updates a record found by its key and creates the rest with the product', async () => {
    const calls: [string, string, unknown[]][] = [];
    const items = soldEquipment(inv([line(1), line(2)]), book, DEFAULT_FOLLOW_UP);
    const rows = [{ id: 9, name: 'old name', notes: `Gate code 1234\n--- Johnsons app ---\njohnsons-equipment:${items[0].key}\nSold: old\n--- end ---` }];
    const client = {
      call: async (model: string, method: string, args: unknown[]) => {
        calls.push([model, method, args]);
        if (model === 'fsm.order' && method === 'read') return [{ location_id: [77, 'Oak St'] }];
        if (method === 'search_read') return rows;
        return 1;
      },
    };
    expect(await orderLocation(client, 5)).toBe(77);
    expect(await sendEquipment(client, 77, items, { htmlNotes: false, product: true })).toBe(2);
    const write = calls.find((c) => c[1] === 'write')!;
    expect(write[2][0]).toEqual([9]);
    expect((write[2][1] as { notes: string }).notes).toContain('Gate code 1234');
    expect((write[2][1] as { notes: string }).notes).not.toContain('Sold: old');
    const create = calls.find((c) => c[1] === 'create')!;
    expect(create[2][0]).toMatchObject({ name: 'Clopay 16x7 Door', location_id: 77, product_id: 2 });
  });
});
