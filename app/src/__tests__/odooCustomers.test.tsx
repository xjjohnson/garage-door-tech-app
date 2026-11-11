import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Customer, CUSTOMERS_STORAGE_KEY, parseCustomers } from '../lib/customers';
import { finishCustomerSync, OdooPartner, planCustomerSync } from '../lib/customerSync';
import { Fetch, OdooClient } from '../lib/odoo';
import { renderApp } from '../testing/renderApp';

const T0 = Date.UTC(2026, 10, 1);
const NOW = Date.UTC(2026, 10, 11, 20);

const cust = (id: string, f: Partial<Customer>): Customer => ({ id, name: '', phone: '', email: '', address: '', notes: '', createdAt: T0, updatedAt: T0, ...f });
const partner = (id: number, f: Partial<OdooPartner>): OdooPartner => ({ id, name: '', phone: '', email: '', address: '', notes: '', changedAt: T0, ...f });

describe('customer sync with Odoo (plain logic)', () => {
  it('brings in new Odoo customers, links matches, and finds what to send', () => {
    const phone = [
      cust('a', { name: 'Pat Smith', phone: '(555) 123-4567' }),
      cust('b', { name: 'New on phone', phone: '555-000-1111' }),
      cust('c', { name: 'Lee Park', phone: '555-999-0000', odooId: 8, syncedAt: T0, updatedAt: T0 + 5 }),
      cust('d', { name: 'Kim Old', odooId: 9, syncedAt: T0 }),
    ];
    const plan = planCustomerSync(
      phone,
      [
        partner(7, { name: 'Pat Smith', phone: '1-555-123-4567', email: 'pat@x.test', address: '1 Oak St, Springfield 12345' }),
        partner(8, { name: 'Lee Park', phone: '555-999-0001' }),
        partner(9, { name: 'Kim New', phone: '555-222-3333', changedAt: T0 + 9 }),
        partner(10, { name: 'Odoo Only', email: 'oo@x.test' }),
      ],
      NOW,
    );
    // Pat matched by phone: linked, and the email and address filled in.
    expect(plan.customers.find((c) => c.id === 'a')).toMatchObject({ odooId: 7, email: 'pat@x.test', address: '1 Oak St, Springfield 12345' });
    // Lee changed on the phone: the phone's number goes to Odoo.
    expect(plan.toWrite).toEqual([{ odooId: 8, customerId: 'c', fields: { phone: '555-999-0000' } }]);
    // Kim changed only in Odoo: takes Odoo's details.
    expect(plan.customers.find((c) => c.id === 'd')).toMatchObject({ name: 'Kim New', phone: '555-222-3333', updatedAt: NOW, syncedAt: NOW });
    expect(plan.customers.find((c) => c.id === 'odoo-10')).toMatchObject({ name: 'Odoo Only', odooId: 10 });
    expect(plan.toCreate.map((c) => c.id)).toEqual(['b']);
    expect([plan.added, plan.updated]).toEqual([1, 1]);

    // Lee is edited again while the sync runs; that edit is kept.
    const current = phone.map((c) => (c.id === 'c' ? { ...c, notes: 'gate code 12', updatedAt: NOW + 1 } : c));
    const done = finishCustomerSync(current, phone, plan, { b: 55 });
    expect(done.find((c) => c.id === 'b')).toMatchObject({ odooId: 55, syncedAt: T0 });
    expect(done.find((c) => c.id === 'c')).toMatchObject({ notes: 'gate code 12', syncedAt: T0 });
    expect(done.find((c) => c.id === 'odoo-10')).toBeTruthy();
    // A change that didn't reach Odoo stays unsent.
    const failed = finishCustomerSync(phone, phone, plan, { b: 55 }, new Set());
    expect(failed.find((c) => c.id === 'c')).toMatchObject({ syncedAt: T0, updatedAt: T0 + 5 });
    // Nothing left to do on the next sync once it all went through.
    const ok = finishCustomerSync(phone, phone, plan, { b: 55 });
    const again = planCustomerSync(ok, [partner(7, { name: 'Pat Smith', phone: '1-555-123-4567' }), partner(8, { name: 'Lee Park', phone: '555-999-0000', changedAt: T0 + 5 }), partner(55, { name: 'New on phone', phone: '555-000-1111' })], NOW);
    expect([again.toCreate.length, again.toWrite.length, again.added]).toEqual([0, 0, 0]);
  });
});

/** A pretend Odoo 19 with a few customers. */
function fakeOdoo() {
  const partners: Record<string, unknown>[] = [
    { id: 7, name: 'Pat Smith', phone: '555-123-4567', email: 'pat@x.test', street: '1 Oak St', street2: false, city: 'Springfield', zip: '12345', comment: '<p>Dog in yard</p>', write_date: '2026-11-10 12:00:00', customer_rank: 2 },
  ];
  const calls: { model: string; method: string; args: unknown[] }[] = [];
  const fetchFn: Fetch = async (_url, init) => {
    const { params } = JSON.parse(init.body);
    const reply = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) });
    const missing = (model: string) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'Odoo Server Error', data: { name: 'builtins.KeyError', message: `Object ${model} doesn't exist` } } }) });
    if (params.service === 'common') return reply(2);
    const [, , , model, method, args] = params.args as [string, number, string, string, string, unknown[]];
    calls.push({ model, method, args });
    if (model === 'res.users') return reply([{ id: 2, name: 'Justin', partner_id: [90, 'Justin'] }]);
    if (model === 'res.partner' && method === 'fields_get') return reply({ name: {}, phone: {}, email: {}, customer_rank: {}, comment: {} });
    if (model === 'res.partner' && method === 'search_read') return reply(partners.filter((p) => (p.customer_rank as number) > 0));
    if (model === 'res.partner' && method === 'create') {
      const id = 100 + partners.length;
      partners.push({ id, write_date: '2026-11-11 20:00:00', street2: false, city: false, zip: false, ...(args[0] as object) });
      return reply(id);
    }
    if (model === 'res.partner' && method === 'write') return reply(true);
    return missing(model);
  };
  return { fetchFn, calls, partners };
}

describe('Customers screen with Odoo', () => {
  const settle = async (n = 8) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };
  afterEach(() => jest.restoreAllMocks());

  it('reads Odoo 19 contacts and syncs both ways in one tap', async () => {
    const o = fakeOdoo();
    const c = await OdooClient.signIn(o.fetchFn, { url: 'x.test', db: 'x', login: 'j' }, 'k');
    expect(await c.partners()).toEqual([{ id: 7, name: 'Pat Smith', phone: '555-123-4567', email: 'pat@x.test', address: '1 Oak St, Springfield 12345', notes: 'Dog in yard', changedAt: Date.UTC(2026, 10, 10, 12) }]);
    expect(o.calls.find((x) => x.method === 'search_read' && x.model === 'res.partner')?.args[0]).toEqual([['customer_rank', '>', 0]]);

    await AsyncStorage.clear();
    await AsyncStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify([cust('mine', { name: 'Sam Lee', phone: '555-444-5555', address: '9 Elm St', notes: 'Side door' })]));
    jest.spyOn(globalThis, 'fetch').mockImplementation(((url: string, init: Parameters<Fetch>[1]) => o.fetchFn(url, init)) as unknown as typeof fetch);
    await renderApp('/team');
    await settle();
    await fireEvent.changeText(screen.getByTestId('team-url'), 'x.test');
    await fireEvent.changeText(screen.getByTestId('team-db'), 'x');
    await fireEvent.changeText(screen.getByTestId('team-login'), 'j');
    await fireEvent.changeText(screen.getByTestId('team-secret'), 'k');
    await fireEvent.press(screen.getByTestId('team-signin-go'));
    await settle();
    await act(async () => router.push('/customers'));
    await settle();
    await fireEvent.press(screen.getByTestId('odoo-customers-sync'));
    await settle(12);
    expect(screen.getByTestId('odoo-customers-result')).toHaveTextContent('Done: brought in 1 customer from Odoo, added 1 to Odoo.');
    const created = o.calls.find((x) => x.method === 'create')!.args[0];
    expect(created).toEqual({ name: 'Sam Lee', phone: '555-444-5555', email: false, street: '9 Elm St', comment: '<p>Side door</p>', customer_rank: 1 });
    const saved = parseCustomers(await AsyncStorage.getItem(CUSTOMERS_STORAGE_KEY));
    expect(saved.map((x) => [x.name, x.odooId])).toEqual([
      ['Sam Lee', 101],
      ['Pat Smith', 7],
    ]);
    expect(screen.getByTestId('customer-odoo-7')).toHaveTextContent(/Pat Smith/);

    // A second tap finds nothing to do.
    await fireEvent.press(screen.getByTestId('odoo-customers-sync'));
    await settle(12);
    expect(screen.getByTestId('odoo-customers-result')).toHaveTextContent('Customers already match Odoo.');
  });
});
