import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AddressPicker } from '../components/AddressPicker';
import { OdooProvider } from '../lib/useOdoo';
import { router } from 'expo-router';
import { Customer, CUSTOMERS_STORAGE_KEY, parseCustomers } from '../lib/customers';
import { finishCustomerSync, OdooPartner, planCustomerSync } from '../lib/customerSync';
import { addressVals, Fetch, OdooClient } from '../lib/odoo';
import { addAddress, ADDRESSES_STORAGE_KEY, fetchAddresses } from '../lib/odooContacts';
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
    if (model === 'res.partner' && method === 'search_read') {
      const [first] = args[0] as [string, string, unknown][];
      if (first?.[0] === 'parent_id') return reply(partners.filter((p) => p.parent_id === first[2]));
      return reply(partners.filter((p) => (p.customer_rank as number) > 0));
    }
    if (model === 'res.partner' && method === 'create') {
      const id = 100 + partners.length;
      partners.push({ id, write_date: '2026-11-11 20:00:00', street2: false, city: false, zip: false, ...(args[0] as object) });
      return reply(id);
    }
    if (model === 'res.partner' && method === 'write') {
      const [[id], vals] = args as [number[], object];
      Object.assign(partners.find((p) => p.id === id) ?? {}, vals);
      return reply(true);
    }
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

describe('a customer\'s addresses in Odoo', () => {
  const settle = async (n = 8) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };
  beforeEach(async () => {
    await AsyncStorage.clear();
  });
  afterEach(() => jest.restoreAllMocks());

  it('splits a typed address into Odoo\'s street, city and ZIP', () => {
    expect(addressVals('400 Main St, Kyle, TX 78640')).toEqual({ street: '400 Main St', street2: false, city: 'Kyle', zip: '78640' });
    expect(addressVals('')).toEqual({ street: false, street2: false, city: false, zip: false });
  });

  it('lists houses first and adds one under the customer\'s contact', async () => {
    const o = fakeOdoo();
    o.partners.push({ id: 20, parent_id: 7, type: 'invoice', name: 'Accounts', street: '1 Pay Ln', city: 'Austin', zip: '78701' }, { id: 21, parent_id: 7, type: 'delivery', name: false, street: '9 Elm St', street2: 'Unit 4', city: 'Buda', zip: '78610', phone: '512' });
    const c = await OdooClient.signIn(o.fetchFn, { url: 'x.test', db: 'x', login: 'j' }, 'k');
    expect(await fetchAddresses(c, 7)).toEqual([
      { id: 21, type: 'delivery', name: '', address: '9 Elm St Unit 4, Buda 78610', phone: '512', email: '' },
      { id: 20, type: 'invoice', name: 'Accounts', address: '1 Pay Ln, Austin 78701', phone: '', email: '' },
    ]);
    await addAddress(c, 7, { type: 'delivery', name: '', address: '400 Main St, Kyle 78640', phone: '', email: '' });
    expect(o.calls.filter((x) => x.method === 'create').at(-1)!.args[0]).toEqual({ parent_id: 7, type: 'delivery', street: '400 Main St', city: 'Kyle', zip: '78640' });
  });

  it('adds a customer by hand, then adds and edits their house address in Odoo', async () => {
    const o = fakeOdoo();
    jest.spyOn(globalThis, 'fetch').mockImplementation(((url: string, init: Parameters<Fetch>[1]) => o.fetchFn(url, init)) as unknown as typeof fetch);
    // Pat, already linked to Odoo contact 7.
    await AsyncStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify([cust('p', { name: 'Pat Smith', odooId: 7, syncedAt: T0 })]));
    const app = await renderApp('/customers');
    await settle();
    await fireEvent.press(screen.getByTestId('customers-add'));
    await fireEvent.changeText(screen.getByTestId('customer-field-name'), 'Oak Property Mgmt');
    await fireEvent.changeText(screen.getByTestId('customer-field-phone'), '512 555 0100');
    await fireEvent.press(screen.getByTestId('customer-sheet-save'));
    await settle();
    expect(app.getPathname()).toMatch(/^\/customer\//);
    expect(parseCustomers(await AsyncStorage.getItem(CUSTOMERS_STORAGE_KEY)).map((x) => [x.name, x.phone])).toEqual([
      ['Pat Smith', ''],
      ['Oak Property Mgmt', '512 555 0100'],
    ]);

    await act(async () => router.push('/team'));
    await settle();
    await fireEvent.changeText(screen.getByTestId('team-url'), 'x.test');
    await fireEvent.changeText(screen.getByTestId('team-db'), 'x');
    await fireEvent.changeText(screen.getByTestId('team-login'), 'j');
    await fireEvent.changeText(screen.getByTestId('team-secret'), 'k');
    await fireEvent.press(screen.getByTestId('team-signin-go'));
    await settle();
    await act(async () => router.push({ pathname: '/customer/[id]', params: { id: 'p' } }));
    await settle();
    expect(screen.getByTestId('customer-addresses')).toHaveTextContent(/No other addresses in Odoo/);

    await fireEvent.press(screen.getByTestId('customer-address-add'));
    await fireEvent.changeText(screen.getByTestId('address-field-address'), '400 Main St, Kyle, TX 78640');
    await fireEvent.press(screen.getByTestId('address-sheet-save'));
    await settle();
    const house = o.partners.find((p) => p.parent_id === 7)!;
    expect(house).toMatchObject({ type: 'delivery', street: '400 Main St', city: 'Kyle', zip: '78640' });
    expect(screen.getByTestId(`customer-address-${house.id}`)).toHaveTextContent(/House \(delivery\).*400 Main St, Kyle 78640/);

    await fireEvent.press(screen.getByTestId(`customer-address-${house.id}`));
    await fireEvent.changeText(screen.getByTestId('address-field-name'), 'Unit B');
    await fireEvent.press(screen.getByTestId('address-sheet-save'));
    await settle();
    expect(house.name).toBe('Unit B');
    expect(screen.getByTestId(`customer-address-${house.id}`)).toHaveTextContent(/Unit B · 400 Main St/);
  });
});

describe('picking the delivery address', () => {
  it('offers the main address and the houses read last time, and says which contact it is', async () => {
    // The tests above render the whole app, which leaves Jest on fake timers.
    jest.useRealTimers();
    await AsyncStorage.clear();
    await AsyncStorage.setItem(ADDRESSES_STORAGE_KEY, JSON.stringify({ 7: [{ id: 21, type: 'delivery', name: 'Unit B', address: '400 Main St, Kyle 78640', phone: '', email: '' }, { id: 20, type: 'invoice', name: 'Accounts', address: '1 Pay Ln', phone: '', email: '' }] }));
    const picked = jest.fn();
    const secrets = { get: async () => null, set: async () => undefined, remove: async () => undefined };
    const shown = await render(
      <OdooProvider fetchFn={async () => ({ ok: false, status: 500, json: async () => ({}) })} secrets={secrets}>
        <AddressPicker partnerId={7} mainAddress="1 Office Rd" onChange={picked} />
      </OdooProvider>,
    );
    for (let i = 0; i < 5; i++) await act(() => new Promise<void>((r) => setTimeout(r, 0)));
    expect(screen.getByTestId('address-picker-7')).toHaveTextContent(/Main address.*1 Office Rd/);
    expect(screen.getByTestId('address-picker-7').props.accessibilityState).toEqual({ checked: true });
    // Billing addresses aren't places to send a tech.
    expect(screen.queryByTestId('address-picker-20')).toBeNull();
    await fireEvent.press(screen.getByTestId('address-picker-21'));
    expect(picked).toHaveBeenCalledWith(21, '400 Main St, Kyle 78640');
    await act(async () => shown.unmount());
  });
});
