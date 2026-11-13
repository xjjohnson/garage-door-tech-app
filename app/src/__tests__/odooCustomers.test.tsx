import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AddressPicker } from '../components/AddressPicker';
import { OdooProvider } from '../lib/useOdoo';
import { router } from 'expo-router';
import { Customer, CUSTOMERS_STORAGE_KEY, parseCustomers } from '../lib/customers';
import { finishCustomerSync, OdooPartner, planCustomerSync } from '../lib/customerSync';
import { addressVals, Fetch, OdooClient } from '../lib/odoo';
import { addAddress, addressLine, ADDRESSES_STORAGE_KEY, addressChoices, searchCustomers, crampedAddresses, fetchAddresses, splitAddresses, splitStreet } from '../lib/odooContacts';
import { renderApp } from '../testing/renderApp';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { createJob, JOBS_STORAGE_KEY } from '../lib/jobs';

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
function fakeOdoo(withApps = false) {
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
    if (withApps) {
      if (['fsm.order', 'sale.order', 'account.move'].includes(model) && method === 'fields_get') return reply({ name: {}, scheduled_date_start: {}, todo: {} });
      if (model === 'fsm.person') return reply([]);
      if (model === 'fsm.order' && method === 'search_read') return reply([{ id: 5, name: 'FSO/0005', location_id: [3, '9 Elm St'], person_id: false, scheduled_date_start: '2026-11-12 15:00:00', todo: 'Match old spring' }]);
      if (model === 'fsm.location' && method === 'read') return reply([{ id: 3, name: '9 Elm St', phone: false, street: '9 Elm St', city: 'Buda', zip: '78610' }]);
      if (model === 'sale.order' && method === 'search_read') return reply([{ id: 40, name: 'S00040', partner_id: [7, 'Pat Smith'], date_order: '2026-11-10 12:00:00', amount_total: 420, state: 'sent', client_order_ref: false }]);
      if (model === 'account.move' && method === 'search_read')
        return reply([{ id: 60, name: 'INV/2026/00060', partner_id: [7, 'Pat Smith'], invoice_date: '2026-11-11', invoice_date_due: '2026-11-11', amount_total: 300, amount_residual: 300, state: 'posted', payment_state: 'not_paid', move_type: 'out_invoice', ref: false }]);
    }
    if (model === 'res.partner' && method === 'search_read') {
      const [first] = args[0] as [string, string, unknown][];
      if (first?.[0] === 'parent_id') return reply(partners.filter((p) => p.parent_id === first[2]));
      if (first?.[0] === 'street') return reply(partners.filter((p) => String(p.street ?? '').includes(',') && (!p.city || !p.zip)));
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

describe('a customer\'s page shows Odoo\'s jobs, quotes and invoices', () => {
  const settle = async (n = 10) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };
  beforeEach(async () => {
    await AsyncStorage.clear();
  });
  afterEach(() => jest.restoreAllMocks());

  it('lists Odoo\'s records in place of the phone\'s copies, keeping jobs not sent yet', async () => {
    const o = fakeOdoo(true);
    jest.spyOn(globalThis, 'fetch').mockImplementation(((url: string, init: Parameters<Fetch>[1]) => o.fetchFn(url, init)) as unknown as typeof fetch);
    const job = (id: string, over: object) => ({ ...createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Pat Smith', address: '9 Elm St', phone: '', notes: '' }, { title: 'Match old spring' }, 1000, id), customerId: 'p', ...over });
    await AsyncStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify([cust('p', { name: 'Pat Smith', odooId: 7, syncedAt: T0 })]));
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([job('sent', { odooJob: { model: 'fsm.order', id: 5, name: 'FSO/0005' } }), job('notyet', { summaryTitle: 'Not sent yet' })]));
    await renderApp('/team');
    await settle();
    await fireEvent.changeText(screen.getByTestId('team-url'), 'x.test');
    await fireEvent.changeText(screen.getByTestId('team-db'), 'x');
    await fireEvent.changeText(screen.getByTestId('team-login'), 'j');
    await fireEvent.changeText(screen.getByTestId('team-secret'), 'k');
    await fireEvent.press(screen.getByTestId('team-signin-go'));
    await settle();
    await act(async () => router.push({ pathname: '/customer/[id]', params: { id: 'p' } }));
    await settle(14);

    expect(screen.getByTestId('customer-odoo-job-5')).toHaveTextContent(/Match old spring.*9 Elm St.*FSO\/0005/);
    expect(screen.getByTestId('customer-odoo-quotations-40')).toHaveTextContent(/S00040.*\$420.*Quotation sent/);
    expect(screen.getByTestId('customer-odoo-invoices-60')).toHaveTextContent(/INV\/2026\/00060.*Not paid|Overdue/);
    expect(screen.getByTestId('customer-odoo-owed')).toHaveTextContent('Owes $300 in Odoo');
    expect(screen.queryByTestId('customer-job-sent')).toBeNull();
    expect(screen.getByTestId('customer-job-notyet')).toBeTruthy();
    expect(screen.getByText('Waiting to go to Odoo')).toBeTruthy();

    const orderSearch = o.calls.find((x) => x.model === 'fsm.order' && x.method === 'search_read' && JSON.stringify(x.args).includes('child_of'));
    expect(orderSearch?.args[0]).toEqual(['|', ['location_id.owner_id', 'child_of', 7], ['location_id.partner_id', 'child_of', 7]]);
    expect(o.calls.find((x) => x.model === 'account.move' && x.method === 'search_read')?.args[0]).toEqual([['move_type', 'in', ['out_invoice', 'out_refund']], ['partner_id', 'child_of', 7]]);
  });
});

describe('contacts with the whole address in Street', () => {
  it('splits only lines that clearly end in a town and ZIP', () => {
    expect(splitStreet('1300 Main St, Kyle, TX 78640')).toEqual({ street: '1300 Main St', street2: '', city: 'Kyle', zip: '78640' });
    expect(splitStreet('400 Main St, Suite 200, Kyle, TX 78640-1234')).toEqual({ street: '400 Main St', street2: 'Suite 200', city: 'Kyle', zip: '78640' });
    expect(splitStreet('5 Oak Ln, Buda', '78610')).toEqual({ street: '5 Oak Ln', street2: '', city: 'Buda', zip: '78610' });
    expect(splitStreet('Smith Plaza, Building B')).toBeNull();
    expect(splitStreet('Smith Plaza, Building B', '78640')).toBeNull();
    expect(splitStreet('9 Elm St, Unit 4 78610')).toBeNull();
    expect(splitStreet('5 Oak Ln, Suite 2, Buda', '78610')).toBeNull();
  });

  it('finds them and splits them when asked, never overwriting what Odoo has', async () => {
    const calls: { method: string; args: unknown[] }[] = [];
    const rows = [
      { id: 1, name: 'Walgreens', street: '1300 Main St, Kyle, TX 78640', street2: false, city: false, zip: false },
      { id: 2, name: 'Has city', street: '9 Elm St, Austin 78701', street2: false, city: 'Buda', zip: false },
      { id: 3, name: 'Zip only', street: '5 Oak Ln, Buda', street2: false, city: false, zip: '78610' },
      { id: 4, name: 'Plaza', street: 'Smith Plaza, Building B', street2: false, city: false, zip: false },
      { id: 5, name: 'Suite', street: '400 Main St, Suite 200, Kyle, TX 78640', street2: false, city: false, zip: false },
    ];
    const c = { call: async (_m: string, method: string, args: unknown[]) => (calls.push({ method, args }), method === 'search_read' ? rows : true) };
    const list = await crampedAddresses(c);
    expect(list.map((a) => [a.id, a.vals])).toEqual([
      [1, { street: '1300 Main St', street2: '', city: 'Kyle', zip: '78640' }],
      [3, { street: '5 Oak Ln', street2: '', city: 'Buda', zip: '78610' }],
      [5, { street: '400 Main St', street2: 'Suite 200', city: 'Kyle', zip: '78640' }],
    ]);
    expect(await splitAddresses(c, list.slice(1))).toBe(2);
    expect(calls.filter((x) => x.method === 'write').map((x) => x.args)).toEqual([
      [[3], { street: '5 Oak Ln', street2: false, city: 'Buda', zip: '78610' }],
      [[5], { street: '400 Main St', street2: 'Suite 200', city: 'Kyle', zip: '78640' }],
    ]);
  });
});

describe('splitting crammed addresses from the Customers tab', () => {
  const settle = async (n = 10) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };
  beforeEach(async () => {
    await AsyncStorage.clear();
  });
  afterEach(() => jest.restoreAllMocks());

  it('lists every one with what it becomes and splits only the ticked ones', async () => {
    const o = fakeOdoo();
    o.partners.push(
      { id: 8, name: 'Walgreens', street: '1300 Main St, Kyle, TX 78640', street2: false, city: false, zip: false, customer_rank: 1, write_date: '2026-11-10 12:00:00' },
      { id: 9, name: 'HEB', street: '400 Main St, Suite 200, Kyle, TX 78640', street2: false, city: false, zip: false, customer_rank: 1, write_date: '2026-11-10 12:00:00' },
    );
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
    await settle(14);
    expect(screen.getByTestId('odoo-cramped-8')).toHaveTextContent(/Walgreens.*Becomes: 1300 Main St · Kyle 78640/);
    expect(screen.getByTestId('odoo-cramped-9')).toHaveTextContent(/Becomes: 400 Main St, Suite 200 · Kyle 78640/);
    await fireEvent.press(screen.getByTestId('odoo-cramped-9'));
    expect(screen.getByTestId('odoo-cramped-fix')).toHaveTextContent('Split 1 ticked contact into street, city and ZIP');
    await fireEvent.press(screen.getByTestId('odoo-cramped-fix'));
    await settle();
    expect(o.partners.find((p) => p.id === 8)).toMatchObject({ street: '1300 Main St', street2: false, city: 'Kyle', zip: '78640' });
    expect(o.partners.find((p) => p.id === 9)).toMatchObject({ street: '400 Main St, Suite 200, Kyle, TX 78640', city: false });
    expect(screen.getByTestId('odoo-cramped-done')).toHaveTextContent(/^Split 1 address into street, city and ZIP in Odoo\.$/);
    expect(screen.getByTestId('odoo-cramped-9')).toBeTruthy();
  });
});

describe('picking the delivery address', () => {
  it('finds customers in Odoo by name, one per name, and lists all of a customer\'s addresses', async () => {
    const calls: unknown[][] = [];
    const client = {
      call: async (...a: unknown[]) => (
        calls.push(a),
        [
          { id: 39, name: 'Caliber Collision', type: 'contact', street: false, city: false, zip: false, child_ids: [] },
          { id: 40, name: 'Caliber  collision', type: 'contact', street: '6222 Menchaca Rd', city: 'Austin', zip: '78745', child_ids: [50, 51] },
          { id: 41, name: 'Cal Smith', type: 'contact', street: '', city: '', zip: '', child_ids: [] },
        ]
      ),
    };
    expect(await searchCustomers(client, 'c')).toEqual([]);
    expect(await searchCustomers(client, 'ca')).toEqual([
      { id: 40, ids: [40, 39], name: 'Caliber  collision', address: '6222 Menchaca Rd, Austin 78745', under: 2 },
      { id: 41, ids: [41], name: 'Cal Smith', address: '', under: 0 },
    ]);
    expect((calls[0][2] as unknown[][])[0]).toEqual(expect.arrayContaining([['parent_id', '=', false]]));
    const list = addressChoices(
      { id: 40, address: '' },
      [
        { id: 50, type: 'delivery', name: '1901 S Bell Blvd', address: '1901 S Bell Blvd, Cedar Park 78613', phone: '', email: '' },
        { id: 51, type: 'contact', name: 'Pat', address: '', phone: '', email: '' },
        { id: 52, type: 'invoice', name: '', address: 'PO Box 9, Austin', phone: '', email: '' },
        { id: 53, type: 'other', name: '', address: '1901 s bell blvd, cedar park 78613', phone: '', email: '' },
      ],
      [{ id: 39, address: '7 Elm St' }],
    );
    expect(list.map((c) => [c.id, c.title, c.line])).toEqual([
      [40, 'Main address', 'No address in Odoo'],
      [39, 'Main address', '7 Elm St'],
      [50, 'House (delivery)', '1901 S Bell Blvd, Cedar Park 78613'],
      [52, 'Billing', 'PO Box 9, Austin'],
    ]);
  });

  it('leaves out an address name that only repeats the street', () => {
    expect(addressLine({ name: '1901 south bell boulevard', address: '1901 South Bell Boulevard, Cedar Park 78613' })).toBe('1901 South Bell Boulevard, Cedar Park 78613');
    expect(addressLine({ name: 'Rental', address: '9 Elm St, Austin' })).toBe('Rental · 9 Elm St, Austin');
    expect(addressLine({ name: '', address: '9 Elm St' })).toBe('9 Elm St');
  });

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
