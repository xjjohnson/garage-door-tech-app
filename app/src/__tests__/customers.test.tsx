import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import {
  Customer,
  CUSTOMERS_STORAGE_KEY,
  emailLink,
  findCustomer,
  linkJobs,
  mergeCustomers,
  parseCustomers,
  phoneKey,
  searchCustomers,
  suggestCustomers,
  summarize,
} from '../lib/customers';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { createJob, Job, JOBS_STORAGE_KEY, parseJobs } from '../lib/jobs';
import { renderApp } from '../testing/renderApp';

const MATCH = { mode: 'match' as const, form: { ...DEFAULT_MATCH_FORM, twentyCoil: '4 1/2', length: '24' } };
const job = (id: string, d: { customer?: string; address?: string; phone?: string }, at: number): Job =>
  createJob(MATCH, { customer: d.customer ?? '', address: d.address ?? '', phone: d.phone ?? '', notes: '' }, { title: '.225 × 2" × 24"' }, at, id);

const customer = (id: string, f: Partial<Customer>): Customer => ({ id, name: '', phone: '', email: '', address: '', notes: '', createdAt: 1, updatedAt: 1, ...f });

let n = 0;
const ids = () => `c${++n}`;

describe('customers (plain logic)', () => {
  beforeEach(() => {
    n = 0;
  });

  it('compares phone numbers by their digits', () => {
    expect(phoneKey('(555) 123-4567')).toBe('5551234567');
    expect(phoneKey('+1 555.123.4567')).toBe('5551234567');
  });

  it('finds a customer by phone first, then by name', () => {
    const list = [customer('a', { name: 'Ann Smith', phone: '555-123-4567' }), customer('b', { name: 'Bob Jones' })];
    expect(findCustomer(list, { customer: 'Mrs Smith', address: '', phone: '5551234567' })?.id).toBe('a');
    expect(findCustomer(list, { customer: 'bob  jones', address: '', phone: '' })?.id).toBe('b');
    // Same name but a different phone number is someone else.
    expect(findCustomer(list, { customer: 'Ann Smith', address: '', phone: '555-999-0000' })).toBeUndefined();
    expect(findCustomer(list, { customer: 'Cy Young', address: '', phone: '' })).toBeUndefined();
  });

  it('links every job to a customer, grouping repeat customers, and then has nothing to do', () => {
    const jobs = [
      job('j1', { customer: 'Ann Smith', address: '12 Oak St', phone: '555-123-4567' }, 100),
      job('j2', { customer: 'Ann S.', address: '40 Elm Rd', phone: '(555) 123-4567' }, 200),
      job('j3', { customer: 'Bob Jones', address: '9 Pine Ave' }, 300),
      job('j4', { address: '77 Lake Dr' }, 400),
    ];
    const first = linkJobs(jobs, [], 1000, ids);
    expect(first.customers.map((c) => [c.id, c.name, c.address])).toEqual([
      ['c1', 'Ann Smith', '12 Oak St'],
      ['c2', 'Bob Jones', '9 Pine Ave'],
      ['c3', '', '77 Lake Dr'],
    ]);
    expect(first.links).toEqual({ j1: 'c1', j2: 'c1', j3: 'c2', j4: 'c3' });
    const linked = jobs.map((j) => ({ ...j, customerId: first.links[j.id] }));
    expect(linkJobs(linked, first.customers, 2000, ids).links).toEqual({});
  });

  it('relinks a job whose customer is gone', () => {
    const j = { ...job('j1', { customer: 'Ann' }, 1), customerId: 'gone' };
    expect(linkJobs([j], [customer('a', { name: 'Ann' })], 5).links).toEqual({ j1: 'a' });
  });

  it('adds up a customer’s jobs', () => {
    const jobs = [
      { ...job('j1', {}, 100), customerId: 'a', accepted: { tier: 'good' as const, total: 36890, at: 1 } },
      { ...job('j2', {}, 200), customerId: 'a', status: 'done' as const },
      { ...job('j3', {}, 300), customerId: 'b' },
    ];
    const s = summarize(customer('a', { name: 'Ann' }), jobs);
    expect(s.jobs.map((j) => j.id)).toEqual(['j2', 'j1']);
    expect(s.openJobs).toBe(1);
    expect(s.acceptedTotal).toBe(36890);
    expect(s.lastJobAt).toBe(200);
  });

  it('searches and suggests', () => {
    const a = customer('a', { name: 'Ann Smith', phone: '555-123-4567', address: '12 Oak St' });
    const b = customer('b', { name: 'Bob Jones' });
    const list = [summarize(a, []), summarize(b, [])];
    expect(searchCustomers(list, 'oak').map((s) => s.customer.id)).toEqual(['a']);
    expect(searchCustomers(list, '1234567').map((s) => s.customer.id)).toEqual(['a']);
    expect(suggestCustomers([a, b], 'an').map((c) => c.id)).toEqual(['a']);
    expect(suggestCustomers([a, b], 'a')).toEqual([]);
    // Already typed in full: nothing to suggest.
    expect(suggestCustomers([a, b], 'Bob Jones')).toEqual([]);
  });

  it('reads saved customers safely and merges backups by last change', () => {
    expect(parseCustomers('nope')).toEqual([]);
    expect(parseCustomers(JSON.stringify([{ id: 'a', name: 'Ann' }, { name: 'no id' }, 3])).map((c) => c.name)).toEqual(['Ann']);
    const merged = mergeCustomers([customer('a', { name: 'Phone', updatedAt: 5 })], [customer('a', { name: 'Old', updatedAt: 2 }), customer('b', { name: 'New' })]);
    expect(merged.map((c) => c.name)).toEqual(['Phone', 'New']);
    expect(emailLink('ann@example.com')).toBe('mailto:ann@example.com');
    expect(emailLink('ann at example')).toBeUndefined();
  });
});

async function settle() {
  for (let i = 0; i < 5; i++) await act(async () => undefined);
}

describe('Customers in the app', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('builds customers from saved jobs and shows a repeat customer’s history', async () => {
    await AsyncStorage.setItem(
      JOBS_STORAGE_KEY,
      JSON.stringify([
        job('j1', { customer: 'Ann Smith', address: '12 Oak St', phone: '555-123-4567' }, 100),
        job('j2', { customer: 'Ann Smith', address: '40 Elm Rd', phone: '555-123-4567' }, 200),
        job('j3', { customer: 'Bob Jones', address: '9 Pine Ave' }, 300),
      ]),
    );
    const app = await renderApp('/jobs');
    await settle();
    const saved = parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY));
    const customers = parseCustomers(await AsyncStorage.getItem(CUSTOMERS_STORAGE_KEY));
    expect(customers).toHaveLength(2);
    const ann = customers.find((c) => c.name === 'Ann Smith')!;
    expect(saved.filter((j) => j.customerId === ann.id).map((j) => j.id).sort()).toEqual(['j1', 'j2']);

    await fireEvent.press(screen.getByTestId('open-customers'));
    expect(app.getPathname()).toBe('/customers');
    expect(screen.getByTestId('customers-count')).toHaveTextContent('2 customers');
    expect(screen.getByTestId(`customer-${ann.id}`)).toHaveTextContent(/2 jobs/);

    await fireEvent.press(screen.getByTestId(`customer-${ann.id}`));
    expect(app.getPathname()).toBe(`/customer/${ann.id}`);
    expect(screen.getByTestId('customer-job-j1')).toBeTruthy();
    expect(screen.getByTestId('customer-job-j2')).toHaveTextContent(/40 Elm Rd/);
    expect(screen.getByTestId('customer-call')).toBeTruthy();
  });

  it('copies an edited name and phone onto the customer’s jobs', async () => {
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([job('j1', { customer: 'Ann', phone: '555-123-4567' }, 100)]));
    await renderApp('/jobs');
    await settle();
    const [ann] = parseCustomers(await AsyncStorage.getItem(CUSTOMERS_STORAGE_KEY));
    await fireEvent.press(screen.getByTestId('open-customers'));
    await fireEvent.press(screen.getByTestId(`customer-${ann.id}`));
    await fireEvent.press(screen.getByTestId('customer-edit'));
    await fireEvent.changeText(screen.getByTestId('customer-field-name'), 'Ann Smith ');
    await fireEvent.changeText(screen.getByTestId('customer-field-email'), 'ann@example.com');
    await fireEvent.press(screen.getByTestId('customer-sheet-save'));
    await settle();
    const [saved] = parseCustomers(await AsyncStorage.getItem(CUSTOMERS_STORAGE_KEY));
    expect(saved).toMatchObject({ name: 'Ann Smith', email: 'ann@example.com' });
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].customer).toBe('Ann Smith');
    expect(screen.getByTestId('customer-email')).toBeTruthy();
  });

  it('links a job card to its customer', async () => {
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([job('j1', { customer: 'Ann' }, 100)]));
    const app = await renderApp('/jobs');
    await settle();
    await fireEvent.press(screen.getByTestId('job-toggle-j1'));
    await fireEvent.press(screen.getByTestId('job-customer-j1'));
    expect(app.getPathname()).toMatch(/^\/customer\//);
  });
});
