import type { OdooClient } from '../lib/odoo';
import { mergeVendors, readVendors } from '../lib/odooStock';

const client = (rows: unknown, fail = false): OdooClient => ({ call: async () => { if (fail) throw new Error('no purchase'); return rows; } }) as unknown as OdooClient;

describe('Odoo vendors', () => {
  it('reads vendors and ignores bad rows', async () => {
    const v = await readVendors(client([{ id: 1, name: 'Texdoor', email: 'a@b.c', phone: false }, { id: 2, name: '  ' }, { id: 3, name: 'Westwin', email: false, phone: '555' }]));
    expect(v).toEqual([{ id: 1, name: 'Texdoor', email: 'a@b.c', phone: '' }, { id: 3, name: 'Westwin', email: '', phone: '555' }]);
  });
  it('is empty when Purchase cannot be read', async () => {
    expect(await readVendors(client(null, true))).toEqual([]);
  });
  it('merges into suppliers by name or id without losing phone-side details', () => {
    const s = [{ name: 'texdoor', phone: '111', email: '' }];
    mergeVendors(s, [{ id: 1, name: 'Texdoor', email: 'a@b.c', phone: '999' }, { id: 4, name: 'Westwinds', email: '', phone: '' }]);
    expect(s).toEqual([{ name: 'texdoor', phone: '111', email: 'a@b.c', odooId: 1 }, { name: 'Westwinds', phone: '', email: '', odooId: 4 }]);
  });
});
