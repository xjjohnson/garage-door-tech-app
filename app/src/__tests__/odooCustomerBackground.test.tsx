import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render } from '@testing-library/react-native';
import { OdooCustomerBackgroundSync } from '../components/OdooCustomerBackgroundSync';
import { Customer, CUSTOMERS_STORAGE_KEY, parseCustomers } from '../lib/customers';
import { OdooPartner, planCustomerSync } from '../lib/customerSync';
import { Fetch, ODOO_STORAGE_KEY } from '../lib/odoo';
import { JOBS_SINCE_KEY } from '../lib/odooJobs';
import { CustomersProvider } from '../lib/useCustomers';
import { JobsProvider } from '../lib/useJobs';
import { resetJobsSince } from '../lib/useJobsSince';
import { OdooProvider } from '../lib/useOdoo';

const SINCE = 5000;
const cust = (id: string, f: Partial<Customer>): Customer => ({ id, name: '', phone: '', email: '', address: '', notes: '', createdAt: 9000, updatedAt: 9000, ...f });
const partner = (id: number, f: Partial<OdooPartner>): OdooPartner => ({ id, name: '', phone: '', email: '', address: '', notes: '', changedAt: 1000, ...f });

describe('customer sync, background run (plain logic)', () => {
  it('leaves old customers and old waiting edits alone, and sends new ones', () => {
    const phone = [
      cust('old-new', { name: 'Old unlinked', createdAt: 1000, updatedAt: 1000 }),
      cust('fresh', { name: 'Fresh', createdAt: 9000, updatedAt: 9000 }),
      cust('old-edit', { name: 'Old edit', phone: '555-000-1111', odooId: 8, syncedAt: 500, updatedAt: 1000 }),
      cust('new-edit', { name: 'New edit', phone: '555-000-2222', odooId: 9, syncedAt: 500, updatedAt: 9500 }),
    ];
    const partners = [partner(8, { name: 'Old edit', phone: '555-111-1111', changedAt: 9999 }), partner(9, { name: 'New edit', phone: '555-222-2222' })];
    const plan = planCustomerSync(phone, partners, 20000, SINCE);
    expect(plan.toCreate.map((c) => c.id)).toEqual(['fresh']);
    expect(plan.toWrite.map((w) => w.customerId)).toEqual(['new-edit']);
    // The old edit is neither sent nor overwritten by Odoo's newer copy.
    expect(plan.customers.find((c) => c.id === 'old-edit')).toMatchObject({ phone: '555-000-1111', updatedAt: 1000, syncedAt: 500 });
    // The manual button (no since) still sends everything.
    const all = planCustomerSync(phone, partners, 20000);
    expect(all.toCreate.map((c) => c.id)).toEqual(['old-new', 'fresh']);
    expect(all.toWrite.map((w) => w.customerId)).toEqual(['old-edit', 'new-edit']);
  });

  it('Odoo wins when the phone has nothing waiting', () => {
    const phone = [cust('a', { name: 'Kim', phone: '555-000-0000', odooId: 7, syncedAt: 9000, updatedAt: 9000 })];
    const plan = planCustomerSync(phone, [partner(7, { name: 'Kim', phone: '555-999-9999', changedAt: 9500 })], 20000, SINCE);
    expect(plan.customers[0]).toMatchObject({ phone: '555-999-9999' });
    expect(plan.toWrite).toEqual([]);
  });
});

const login = { url: 'acme.odoo.com', db: 'acme', login: 'j@x.test' };
const SECRETS = { get: async () => 'k', set: async () => undefined, remove: async () => undefined };

async function settle(n = 30) {
  for (let i = 0; i < n; i++) await act(() => new Promise<void>((r) => setTimeout(r, 0)));
}

function fakeOdoo() {
  const partners: Record<string, unknown>[] = [{ id: 7, name: 'Pat Smith', phone: '555-123-4567', email: false, street: '1 Oak St', city: 'Buda', zip: '78610', comment: false, write_date: '2026-11-10 12:00:00', customer_rank: 1 }];
  const calls: { model: string; method: string; args: unknown[] }[] = [];
  const fetchFn: Fetch = async (_url, init) => {
    const { params } = JSON.parse(init.body);
    const reply = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) });
    if (params.service === 'common') return reply(2);
    const [, , , model, method, args] = params.args as [string, number, string, string, string, unknown[]];
    calls.push({ model, method, args });
    if (model === 'res.users') return reply([{ id: 2, name: 'Justin', partner_id: [90, 'Justin'] }]);
    if (model === 'res.partner' && method === 'fields_get') return reply({ name: {}, phone: {}, email: {}, customer_rank: {}, comment: {} });
    if (model === 'res.partner' && method === 'search_read') return reply(partners);
    if (model === 'res.partner' && method === 'create') {
      const id = 100 + partners.length;
      partners.push({ id, customer_rank: 1, write_date: '2026-11-13 20:00:00', ...(args[0] as object) });
      return reply(id);
    }
    if (model === 'res.partner' && method === 'write') return reply(true);
    return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'Odoo Server Error', data: { name: 'builtins.KeyError', message: `Object ${model} doesn't exist` } } }) };
  };
  return { fetchFn, partners, calls };
}

let shown: Awaited<ReturnType<typeof render>> | null = null;

describe('customer sync in the background', () => {
  beforeEach(async () => {
    resetJobsSince();
    await AsyncStorage.clear();
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    await AsyncStorage.setItem(JOBS_SINCE_KEY, String(SINCE));
  });
  afterEach(async () => {
    await act(async () => shown?.unmount());
    shown = null;
    await settle(5);
  });

  it('brings Odoo customers in on its own and sends only new ones up', async () => {
    const o = fakeOdoo();
    await AsyncStorage.setItem(
      CUSTOMERS_STORAGE_KEY,
      JSON.stringify([cust('old', { name: 'Old phone only', createdAt: 1000, updatedAt: 1000 }), cust('fresh', { name: 'Fresh Customer', phone: '555-777-8888' })]),
    );
    shown = await render(
      <JobsProvider>
        <CustomersProvider>
          <OdooProvider fetchFn={o.fetchFn} secrets={SECRETS}>
            <OdooCustomerBackgroundSync />
          </OdooProvider>
        </CustomersProvider>
      </JobsProvider>,
    );
    await settle();
    const saved = parseCustomers(await AsyncStorage.getItem(CUSTOMERS_STORAGE_KEY));
    expect(saved.map((c) => [c.name, c.odooId])).toEqual([
      ['Old phone only', undefined],
      ['Fresh Customer', 101],
      ['Pat Smith', 7],
    ]);
    // Only the new customer was created in Odoo.
    expect(o.partners.map((p) => p.name)).toEqual(['Pat Smith', 'Fresh Customer']);
  });
});
