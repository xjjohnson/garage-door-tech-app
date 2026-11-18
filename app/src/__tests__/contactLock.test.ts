import { withContactLock } from '../lib/odooContactLock';
import { partnerFor } from '../lib/odooJobs';
import type { OdooPartner } from '../lib/customerSync';

describe('contact lock', () => {
  it('lets only one contact lookup run at a time, so a new customer is made in Odoo once', async () => {
    const partners: OdooPartner[] = [];
    const client = {
      partners: async () => {
        await Promise.resolve();
        return [...partners];
      },
      createPartner: async (f: { name: string }) => {
        await new Promise((r) => setTimeout(r, 5));
        partners.push({ id: partners.length + 1, name: f.name, phone: '', email: '', address: '', notes: '', changedAt: 0 });
        return partners.length;
      },
    };
    const who = { name: 'Kelly jones', phone: '', email: '', address: '', notes: '' };
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => withContactLock(async () => partnerFor(client, who, client.partners()))));
    expect(partners).toHaveLength(1);
    expect([a, b, c]).toEqual([1, 1, 1]);
  });

  it('keeps going after one lookup fails', async () => {
    await expect(withContactLock(async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    await expect(withContactLock(async () => 7)).resolves.toBe(7);
  });
});
