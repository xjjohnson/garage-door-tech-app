import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render } from '@testing-library/react-native';
import { OdooJobSync } from '../components/OdooJobSync';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { createJob, Job, JOBS_STORAGE_KEY, parseJobs } from '../lib/jobs';
import { Fetch, ODOO_STORAGE_KEY, OdooClient, toOdooTime } from '../lib/odoo';
import { applyState, createOdooJob, readJobStates, writeVisit } from '../lib/odooJobs';
import { pendingSync } from '../lib/pending';
import { Appointment, parseSchedule, SCHEDULE_STORAGE_KEY } from '../lib/schedule';
import { CustomersProvider } from '../lib/useCustomers';
import { JobsProvider } from '../lib/useJobs';
import { OdooProvider } from '../lib/useOdoo';
import { ScheduleProvider } from '../lib/useSchedule';

const at = (h: number, dayOffset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, 0, 0, 0);
  return d.getTime();
};

type Row = Record<string, unknown>;

/** A pretend Odoo with OCA Field Service. This user is worker 40. */
function fakeOdoo() {
  const orders: Row[] = [];
  const locations: Row[] = [{ id: 70, partner_id: 7, owner_id: 7 }];
  const partners: Row[] = [];
  const calls: { model: string; method: string; args: unknown[]; kw: Row }[] = [];
  const fetchFn: Fetch = async (_url, init) => {
    const { params } = JSON.parse(init.body);
    const reply = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) });
    const error = (message: string) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'Odoo Server Error', data: { name: 'builtins.KeyError', message } } }) });
    if (params.service === 'common') return reply(2);
    const [, , , model, method, args, kw = {}] = params.args as [string, number, string, string, string, unknown[], Row];
    calls.push({ model, method, args, kw });
    if (method === 'fields_get') {
      if (model === 'fsm.order') return reply({ name: {}, location_id: {}, person_id: {}, scheduled_date_start: {}, scheduled_duration: {}, stage_id: {}, description: {} });
      if (model === 'fsm.stage') return reply({ name: {}, is_closed: {} });
      if (model === 'res.partner') return reply({ name: {}, customer_rank: {} });
      return error(`Object ${model} doesn't exist`);
    }
    if (model === 'res.users') return reply([{ id: 2, name: 'Justin', partner_id: [90, 'Justin'] }]);
    if (model === 'fsm.person') return reply([{ id: 40, name: 'Justin' }]);
    if (model === 'res.partner' && method === 'create') {
      partners.push({ id: 100 + partners.length, ...(args[0] as Row) });
      return reply(100 + partners.length - 1);
    }
    if (model === 'fsm.location' && method === 'search') {
      const [, a, b] = args[0] as [string, [string, string, number], [string, string, number]];
      return reply(locations.filter((l) => l.partner_id === a[2] || l.owner_id === b[2]).map((l) => l.id));
    }
    if (model === 'fsm.location' && method === 'create') {
      locations.push({ id: 80 + locations.length, ...(args[0] as Row) });
      return reply(80 + locations.length - 1);
    }
    if (model === 'fsm.stage' && method === 'search') return reply([9]);
    if (model === 'fsm.order' && method === 'create') {
      const id = 500 + orders.length;
      orders.push({ id, name: `FSO${id}`, person_id: false, scheduled_date_start: false, scheduled_duration: 0, stage_id: [1, 'New'], ...(args[0] as Row) });
      return reply(id);
    }
    if (model === 'fsm.order' && method === 'read') {
      const ids = args[0] as number[];
      return reply(
        orders
          .filter((o) => ids.includes(o.id as number))
          .map((o) => ({ ...o, person_id: typeof o.person_id === 'number' ? [o.person_id, 'Someone'] : o.person_id })),
      );
    }
    if (model === 'fsm.order' && method === 'write') {
      const [[id], vals] = args as [number[], Row];
      Object.assign(orders.find((o) => o.id === id)!, vals);
      return reply(true);
    }
    return error(`${model}.${method}`);
  };
  return { fetchFn, orders, locations, partners, calls };
}

const login = { url: 'acme.odoo.com', db: 'acme', login: 'j@x.test' };

describe('jobs in Odoo (logic)', () => {
  it('makes an order at the customer’s location, given to me when it has a visit', async () => {
    const o = fakeOdoo();
    const c = await OdooClient.signIn(o.fetchFn, login, 'k');
    const ref = await createOdooJob(c, 7, { customer: 'Pat', address: '1 Oak', phone: '', what: 'Tune-up', notes: 'Dog in yard' }, { start: at(9, 1), minutes: 90 });
    expect(ref).toEqual({ model: 'fsm.order', id: 500, name: 'FSO500' });
    expect(o.orders[0]).toMatchObject({ location_id: 70, person_id: 40, description: 'Tune-up\nDog in yard', scheduled_date_start: toOdooTime(at(9, 1)), scheduled_duration: 1.5 });

    // No visit, and a customer with no location yet: a new location, and nobody assigned.
    await createOdooJob(c, 8, { customer: 'Lee', address: '2 Elm', phone: '', what: 'Opener', notes: '' });
    expect(o.locations.at(-1)).toMatchObject({ partner_id: 8, owner_id: 8 });
    expect(o.orders[1]).toMatchObject({ location_id: o.locations.at(-1)!.id, person_id: false, scheduled_date_start: false });
  });

  it('moves the order, and reads back time, worker and done', async () => {
    const o = fakeOdoo();
    const c = await OdooClient.signIn(o.fetchFn, login, 'k');
    const ref = await createOdooJob(c, 7, { customer: 'Pat', address: '', phone: '', what: '', notes: '' });
    await writeVisit(c, ref, { start: at(14), minutes: 60 });
    expect(o.orders[0]).toMatchObject({ scheduled_date_start: toOdooTime(at(14)), scheduled_duration: 1 });
    o.orders[0].person_id = 41;
    o.orders[0].stage_id = [9, 'Done'];
    expect(await readJobStates(c, 'fsm.order', [500])).toEqual([{ id: 500, start: at(14), minutes: 60, personId: 41, done: true }]);
  });

  it('works out what the phone’s visit becomes', () => {
    const v: Appointment = { id: 'odoo-5', start: at(9), minutes: 60, name: 'Pat', address: '', phone: '', what: '', status: 'booked', createdAt: 1, updatedAt: 1, syncedAt: 1 };
    expect(applyState(v, { id: 5, start: at(9), minutes: 60, personId: 40, done: false }, 40, 9)).toBeNull();
    expect(applyState(v, { id: 5, start: at(11), personId: 40, done: false }, 40, 9)).toEqual({ keep: { ...v, start: at(11), updatedAt: 9, syncedAt: 9 } });
    expect(applyState(v, { id: 5, personId: 41, done: false }, 40, 9)).toEqual({ keep: null });
    expect(applyState(v, { id: 5, personId: 0, done: true }, 40, 9)?.keep?.status).toBe('done');
  });

  it('counts open jobs not in Odoo yet', () => {
    const j = createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Pat', address: '', phone: '', notes: '' }, { title: '' }, 1, 'j1');
    expect(pendingSync([], [j], []).jobs).toBe(1);
    expect(pendingSync([], [{ ...j, status: 'done' }], []).jobs).toBe(0);
  });
});

/** Lets sign-in and a sync pass finish: they wait on real timers too. */
async function settle(n = 30) {
  for (let i = 0; i < n; i++) await act(() => new Promise<void>((r) => setTimeout(r, 0)));
}

const SECRETS = { get: async () => 'k', set: async () => undefined, remove: async () => undefined };

let shown: Awaited<ReturnType<typeof render>> | null = null;

async function renderSync(fetchFn: Fetch) {
  shown = await render(
    <JobsProvider>
      <CustomersProvider>
        <ScheduleProvider>
          <OdooProvider fetchFn={fetchFn} secrets={SECRETS}>
            <OdooJobSync />
          </OdooProvider>
        </ScheduleProvider>
      </CustomersProvider>
    </JobsProvider>,
  );
  return shown;
}

describe('job sync in the background', () => {
  const base = (id: string, over: Partial<Job> = {}): Job => ({ ...createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Pat Smith', address: '1 Oak St', phone: '555', notes: '' }, { title: '' }, 1000, id), what: 'Tune-up', ...over }) as Job;

  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
  });

  // Stop the sync and let anything it started finish before the next test's storage.
  afterEach(async () => {
    await act(async () => shown?.unmount());
    shown = null;
    await settle(5);
  });

  it('sends new jobs to Odoo, and the booked visit takes the order’s id and time', async () => {
    const o = fakeOdoo();
    const visit: Appointment = { id: 'a-1', jobId: 'j1', start: at(10, 1), minutes: 60, name: 'Pat Smith', address: '1 Oak St', phone: '555', what: 'Tune-up', status: 'booked', createdAt: 1, updatedAt: 1 };
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([base('j1'), base('j2', { customer: 'Lee Park' }), base('j3', { status: 'done' })]));
    await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify([visit]));
    await renderSync(o.fetchFn);
    await settle();

    const jobs = parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY));
    expect(jobs.map((j) => j.odooJob?.id)).toEqual([500, 501, undefined]);
    expect(o.orders[0]).toMatchObject({ person_id: 40, scheduled_date_start: toOdooTime(at(10, 1)) });
    expect(o.orders[1]).toMatchObject({ person_id: false });
    // Contacts were made for the customers that weren't in Odoo.
    expect(o.partners.map((p) => p.name)).toEqual(['Pat Smith', 'Lee Park']);
    const visits = parseSchedule(await AsyncStorage.getItem(SCHEDULE_STORAGE_KEY));
    expect(visits.map((v) => [v.id, v.jobId])).toEqual([['odoo-500', 'j1']]);
  });

  it('brings a time and worker set in Odoo back to the phone', async () => {
    const o = fakeOdoo();
    o.orders.push({ id: 500, name: 'FSO500', person_id: 40, scheduled_date_start: toOdooTime(at(15, 1)), scheduled_duration: 2, stage_id: [1, 'New'] });
    o.orders.push({ id: 501, name: 'FSO501', person_id: 41, scheduled_date_start: toOdooTime(at(9, 1)), scheduled_duration: 1, stage_id: [1, 'New'] });
    await AsyncStorage.setItem(
      JOBS_STORAGE_KEY,
      JSON.stringify([base('j1', { odooJob: { model: 'fsm.order', id: 500, name: 'FSO500' } }), base('j2', { odooJob: { model: 'fsm.order', id: 501, name: 'FSO501' } })]),
    );
    // j2's visit is on this phone, but Odoo gave the job to someone else.
    await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify([{ id: 'odoo-501', jobId: 'j2', start: at(9, 1), minutes: 60, name: 'Pat', address: '', phone: '', what: '', status: 'booked', createdAt: 1, updatedAt: 1, syncedAt: 1 }]));
    await renderSync(o.fetchFn);
    await settle();
    const visits = parseSchedule(await AsyncStorage.getItem(SCHEDULE_STORAGE_KEY));
    expect(visits.map((v) => [v.id, v.jobId, v.start, v.minutes])).toEqual([['odoo-500', 'j1', at(15, 1), 120]]);
  });

  it('sends a visit moved on the phone to Odoo', async () => {
    const o = fakeOdoo();
    o.orders.push({ id: 500, name: 'FSO500', person_id: 40, scheduled_date_start: toOdooTime(at(9, 1)), scheduled_duration: 1, stage_id: [1, 'New'] });
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([base('j1', { odooJob: { model: 'fsm.order', id: 500, name: 'FSO500' } })]));
    await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify([{ id: 'odoo-500', jobId: 'j1', start: at(16, 1), minutes: 60, name: 'Pat', address: '', phone: '', what: '', status: 'booked', createdAt: 1, updatedAt: 5, syncedAt: 1 }]));
    await renderSync(o.fetchFn);
    await settle();
    expect(o.orders[0].scheduled_date_start).toBe(toOdooTime(at(16, 1)));
    const [v] = parseSchedule(await AsyncStorage.getItem(SCHEDULE_STORAGE_KEY));
    expect(v.start).toBe(at(16, 1));
    expect(v.syncedAt).toBe(5);
  });
});
