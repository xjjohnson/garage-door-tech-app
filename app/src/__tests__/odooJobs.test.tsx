import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { OdooJobSync } from '../components/OdooJobSync';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { createJob, Job, JOBS_STORAGE_KEY, parseJobs } from '../lib/jobs';
import { Fetch, ODOO_STORAGE_KEY, OdooClient, toOdooTime } from '../lib/odoo';
import { applyState, createOdooJob, jobChanged, JOBS_SINCE_KEY, olderJobs, partnerFor, pullSchedule, pushJobChanges, readJobStates, sentAtCreate, shouldSend, whatOf, writeVisit } from '../lib/odooJobs';
import type { OdooTask } from '../lib/odoo';
import { fetchFsmTemplates, FSM_TEMPLATES_STORAGE_KEY } from '../lib/fsmTemplates';
import { resetJobsSince } from '../lib/useJobsSince';
import { renderApp } from '../testing/renderApp';
import { router } from 'expo-router';
import { pendingSync } from '../lib/pending';
import { Appointment, parseSchedule, SCHEDULE_STORAGE_KEY } from '../lib/schedule';
import { CUSTOMERS_STORAGE_KEY, parseCustomers } from '../lib/customers';
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
  const locations: Row[] = [{ id: 70, name: 'Pat Smith', partner_id: 7, owner_id: 7, street: '1 Oak St' }];
  const partners: Row[] = [];
  const templates: Row[] = [];
  const calls: { model: string; method: string; args: unknown[]; kw: Row }[] = [];
  const fetchFn: Fetch = async (_url, init) => {
    const { params } = JSON.parse(init.body);
    const reply = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) });
    const error = (message: string) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'Odoo Server Error', data: { name: 'builtins.KeyError', message } } }) });
    if (params.service === 'common') return reply(2);
    const [, , , model, method, args, kw = {}] = params.args as [string, number, string, string, string, unknown[], Row];
    calls.push({ model, method, args, kw });
    if (method === 'fields_get') {
      if (model === 'fsm.order') return reply({ name: {}, location_id: {}, person_id: {}, scheduled_date_start: {}, scheduled_duration: {}, stage_id: {}, description: {}, todo: {}, template_id: {}, type: {}, date_start: {}, date_end: {} });
      if (model === 'fsm.template') return reply({ name: {}, instructions: {}, duration: {}, type_id: {}, active: {} });
      if (model === 'fsm.stage') return reply({ name: {}, is_closed: {} });
      if (model === 'res.partner') return reply({ name: {}, customer_rank: {} });
      return error(`Object ${model} doesn't exist`);
    }
    if (model === 'res.users') return reply([{ id: 2, name: 'Justin', partner_id: [90, 'Justin'] }]);
    if (model === 'fsm.person') return reply([{ id: 40, name: 'Justin' }]);
    if (model === 'res.partner' && method === 'search_read') return reply(partners);
    if (model === 'fsm.order' && method === 'search_read') {
      const domain = args[0] as unknown[];
      const marker = domain.length === 1 && Array.isArray(domain[0]) && domain[0][0] === 'description';
      if (marker) {
        const text = String((domain[0] as unknown[])[2]);
        return reply(orders.filter((o) => String(o.description ?? '').toLowerCase().includes(text.toLowerCase())).map((o) => ({ id: o.id, name: o.name })));
      }
      // Jobs given to someone, open or not: enough of a domain for the schedule and the Jobs tab.
      const test = (o: Row, [f, op, v]: unknown[]) => {
        if (f === 'person_id' && op === '=') return (o.person_id || false) === v;
        if (f === 'stage_id.is_closed') return (Array.isArray(o.stage_id) && o.stage_id[0] === 9) === v;
        return true;
      };
      const loc = (id: unknown) => locations.find((l) => l.id === id);
      return reply(
        orders
          .filter((o) => domain.every((d) => !Array.isArray(d) || test(o, d)))
          .map((o) => ({ ...o, location_id: o.location_id ? [o.location_id, String(loc(o.location_id)?.name ?? 'Place')] : false, person_id: typeof o.person_id === 'number' ? [o.person_id, 'Someone'] : false })),
      );
    }
    if (model === 'fsm.template' && method === 'search_read') return reply(templates);
    if (model === 'fsm.location' && method === 'read') return reply(locations.filter((l) => (args[0] as number[]).includes(l.id as number)));
    if (model === 'res.partner' && method === 'create') {
      partners.push({ id: 100 + partners.length, ...(args[0] as Row) });
      return reply(100 + partners.length - 1);
    }
    if (model === 'fsm.location' && method === 'search_read') {
      const [, a, b] = args[0] as [string, [string, string, number], [string, string, number]];
      return reply(locations.filter((l) => l.partner_id === a[2] || l.owner_id === b[2]));
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
      // Like Odoo: the whole read is refused when one of the orders was deleted.
      if (ids.some((id) => !orders.some((o) => o.id === id))) return error('Record does not exist or has been deleted.\n(Record: fsm.order, User: 2)');
      return reply(
        orders
          .filter((o) => ids.includes(o.id as number))
          .map((o) => ({ ...o, person_id: typeof o.person_id === 'number' ? [o.person_id, 'Someone'] : o.person_id })),
      );
    }
    if (model === 'fsm.order' && method === 'message_post') return reply(1);
    if (model === 'fsm.order' && method === 'action_complete') {
      for (const id of args[0] as number[]) Object.assign(orders.find((o) => o.id === id)!, { stage_id: [9, 'Done'] });
      return reply(true);
    }
    if (model === 'fsm.order' && method === 'write') {
      const [[id], vals] = args as [number[], Row];
      Object.assign(orders.find((o) => o.id === id)!, vals);
      return reply(true);
    }
    return error(`${model}.${method}`);
  };
  return { fetchFn, orders, locations, partners, calls, templates };
}

const login = { url: 'acme.odoo.com', db: 'acme', login: 'j@x.test' };

describe('jobs in Odoo (logic)', () => {
  it('makes an order at the customer’s location, given to me when it has a visit', async () => {
    const o = fakeOdoo();
    const c = await OdooClient.signIn(o.fetchFn, login, 'k');
    const ref = await createOdooJob(c, 7, { jobId: 'j1', customer: 'Pat', address: '1 Oak', phone: '', what: 'Tune-up', notes: 'Dog in yard' }, { start: at(9, 1), minutes: 90 });
    expect(ref).toEqual({ model: 'fsm.order', id: 500, name: 'FSO500' });
    expect(o.orders[0]).toMatchObject({ location_id: 70, person_id: 40, description: 'Tune-up\nDog in yard\nApp job j1', scheduled_date_start: toOdooTime(at(9, 1)), scheduled_duration: 1.5 });

    // No visit, and a customer with no location yet: a new location named by the street, and nobody assigned.
    await createOdooJob(c, 8, { jobId: 'j2', customer: 'Lee', address: '2 Elm', phone: '', what: 'Opener', notes: '' });
    expect(o.locations.at(-1)).toMatchObject({ name: '2 Elm', owner_id: 8, street: '2 Elm' });
    expect(o.orders[1]).toMatchObject({ location_id: o.locations.at(-1)!.id, person_id: false, scheduled_date_start: false });

    // One location per house: Pat's other house gets its own, and the next job there reuses it.
    await createOdooJob(c, 7, { jobId: 'j3', customer: 'Pat', address: '9 Pine Rd, Kyle, TX 78640', phone: '', what: '', notes: '' });
    expect(o.locations.at(-1)).toMatchObject({ name: '9 Pine Rd', owner_id: 7, street: '9 Pine Rd', city: 'Kyle', zip: '78640' });
    const pine = o.locations.at(-1)!.id;
    await createOdooJob(c, 7, { jobId: 'j4', customer: 'Pat', address: '9 pine road kyle', phone: '', what: '', notes: '' });
    expect(o.orders[3].location_id).toBe(pine);
    expect(o.locations).toHaveLength(3);
  });

  it('a job whose kind is a Field Service template carries it, like picking it in Odoo', async () => {
    const o = fakeOdoo();
    o.templates.push({ id: 3, name: 'Broken spring', instructions: 'Check both cables', duration: 1.5, type_id: [2, 'Repair'] });
    const c = await OdooClient.signIn(o.fetchFn, login, 'k');
    await createOdooJob(c, 7, { jobId: 'j1', customer: 'Pat', address: '', phone: '', what: 'broken spring', notes: '' });
    expect(o.orders[0]).toMatchObject({ template_id: 3, todo: 'Check both cables', type: 2, scheduled_duration: 1.5 });
    // A booked visit keeps its own length; a kind with no template sets none.
    await createOdooJob(c, 7, { jobId: 'j2', customer: 'Pat', address: '', phone: '', what: 'Broken spring', notes: '' }, { start: at(9, 1), minutes: 60 });
    expect(o.orders[1]).toMatchObject({ template_id: 3, scheduled_duration: 1 });
    await createOdooJob(c, 7, { jobId: 'j3', customer: 'Pat', address: '', phone: '', what: 'Gate', notes: '' });
    expect(o.orders[2].template_id).toBeUndefined();
    expect(await fetchFsmTemplates(c)).toEqual([{ id: 3, name: 'Broken spring', instructions: 'Check both cables', minutes: 90, typeId: 2 }]);
  });

  it('moves the order, and reads back time, worker and done', async () => {
    const o = fakeOdoo();
    const c = await OdooClient.signIn(o.fetchFn, login, 'k');
    const ref = await createOdooJob(c, 7, { jobId: 'j1', customer: 'Pat', address: '', phone: '', what: '', notes: '' });
    await writeVisit(c, ref, { start: at(14), minutes: 60 });
    expect(o.orders[0]).toMatchObject({ scheduled_date_start: toOdooTime(at(14)), scheduled_duration: 1 });
    o.orders[0].person_id = 41;
    o.orders[0].stage_id = [9, 'Done'];
    expect(await readJobStates(c, 'fsm.order', [500])).toEqual([{ id: 500, start: at(14), minutes: 60, personId: 41, done: true }]);
  });

  it('tells the order about later note edits, steps and Close job', async () => {
    const o = fakeOdoo();
    const c = await OdooClient.signIn(o.fetchFn, login, 'k');
    const ref = await createOdooJob(c, 7, { jobId: 'j1', customer: 'Pat', address: '', phone: '', what: 'Tune-up', notes: 'Gate code 12' });
    const job = { id: 'j1', what: 'Tune-up', notes: 'Gate code 12', status: 'open' as const, odooJob: ref, odooSent: sentAtCreate('Gate code 12') };
    expect(jobChanged(job)).toBe(false);
    const edited = { ...job, notes: 'Gate code 34', steps: { onMyWayAt: at(9), arrivedAt: at(10), workDoneAt: at(11) } };
    expect(jobChanged(edited)).toBe(true);
    const sent = await pushJobChanges(c, edited);
    expect(o.orders[0]).toMatchObject({ description: 'Tune-up\nGate code 34\nApp job j1', date_start: toOdooTime(at(10)), date_end: toOdooTime(at(11)) });
    const notes = o.calls.filter((x) => x.method === 'message_post').map((x) => x.kw.body);
    expect(notes).toEqual([expect.stringMatching(/^On my way at/), expect.stringMatching(/^Arrived at/), expect.stringMatching(/^Work done at/)]);
    expect(jobChanged({ ...edited, odooSent: sent })).toBe(false);
    const closed = await pushJobChanges(c, { ...edited, status: 'done', odooSent: sent });
    expect(o.orders[0].stage_id).toEqual([9, 'Done']);
    expect(closed.done).toBe(true);
    // Already done in Odoo (say from Jobs › Team): not completed twice.
    const before = o.calls.filter((x) => x.method === 'action_complete').length;
    await pushJobChanges(c, { ...edited, status: 'done', odooSent: sent });
    expect(o.calls.filter((x) => x.method === 'action_complete')).toHaveLength(before);
  });

  it('sends nothing for a job with nothing recorded, and takes its state now as Odoo\'s', async () => {
    const o = fakeOdoo();
    const c = await OdooClient.signIn(o.fetchFn, login, 'k');
    o.orders.push({ id: 500, name: 'FSO500', person_id: 40, stage_id: [1, 'New'], description: 'Written in Odoo' });
    const before = o.calls.length;
    const steps = { arrivedAt: at(10), workDoneAt: at(11) };
    const sent = await pushJobChanges(c, { id: 'j1', notes: 'Old note', steps, status: 'done', odooJob: { model: 'fsm.order', id: 500, name: 'FSO500' } });
    expect(o.calls.length).toBe(before);
    expect(o.orders[0]).toMatchObject({ description: 'Written in Odoo', stage_id: [1, 'New'] });
    expect(sent).toEqual({ notes: 'Old note', steps, done: true });
  });

  it('works out what the phone’s visit becomes', () => {
    const v: Appointment = { id: 'odoo-5', start: at(9), minutes: 60, name: 'Pat', address: '', phone: '', what: '', status: 'booked', createdAt: 1, updatedAt: 1, syncedAt: 1 };
    expect(applyState(v, { id: 5, start: at(9), minutes: 60, personId: 40, done: false }, 40, 9)).toBeNull();
    expect(applyState(v, { id: 5, start: at(11), personId: 40, done: false }, 40, 9)).toEqual({ keep: { ...v, start: at(11), updatedAt: 9, syncedAt: 9 } });
    expect(applyState(v, { id: 5, personId: 41, done: false }, 40, 9)).toEqual({ keep: null });
    expect(applyState(v, { id: 5, personId: 0, done: true }, 40, 9)?.keep?.status).toBe('done');
  });

  it('builds the schedule from the jobs Odoo gives me', () => {
    const t = (id: number, over: Partial<OdooTask> = {}): OdooTask => ({ id, name: `FO${id}`, customer: 'Atx', phone: '512', address: '1 Oak St, Kyle', start: at(10), stage: 'New', notes: 'Help door trapped\nApp job x', assignees: [40], ...over });
    const kept: Appointment = { id: 'odoo-3', start: at(8), minutes: 60, name: 'Old', address: '', phone: '', what: 'Tune-up', status: 'booked', createdAt: 1, updatedAt: 1, syncedAt: 1 };
    const gone: Appointment = { ...kept, id: 'odoo-4' };
    const started: Appointment = { ...kept, id: 'odoo-6', jobId: 'j6' };
    const moved: Appointment = { ...kept, id: 'odoo-7', updatedAt: 5 };
    const { add, drop } = pullSchedule([kept, gone, started, moved], [t(1), t(2, { start: undefined }), t(3, { start: at(11) }), t(5), t(7, { start: at(12) })], new Set([5]), 9);
    // New: FO1. Moved in Odoo: FO3. No time: FO2. The phone's own job owns FO5. FO7 was moved on the phone and isn't sent yet.
    expect(add.map((a) => [a.id, a.start, a.name, a.what, a.odooName])).toEqual([
      ['odoo-1', at(10), 'Atx', 'Help door trapped', 'FO1'],
      ['odoo-3', at(11), 'Atx', 'Tune-up', 'FO3'],
    ]);
    // FO4 is no longer mine and open; the started one stays for the job sync.
    expect(drop).toEqual(['odoo-4']);
    expect(whatOf(t(9, { notes: 'App job x' }))).toBe('FO9');
  });

  it('counts open jobs not in Odoo yet', () => {
    const j = createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Pat', address: '', phone: '', notes: '' }, { title: '' }, 1, 'j1');
    expect(pendingSync([], [j], []).jobs).toBe(1);
    expect(pendingSync([], [{ ...j, status: 'done' }], []).jobs).toBe(0);
    // Saved before sending started: not counted (or sent) until picked.
    expect(pendingSync([], [j], [], 5).jobs).toBe(0);
    expect(pendingSync([], [{ ...j, sendToOdoo: true }], [], 5).jobs).toBe(1);
    expect(olderJobs([j, { ...j, id: 'j2', sendToOdoo: false }], 5).map((x) => x.id)).toEqual(['j1']);
    expect(shouldSend(j, null)).toBe(false);
  });

  it('finds the order already made for a phone job instead of making another', async () => {
    const o = fakeOdoo();
    const c = await OdooClient.signIn(o.fetchFn, login, 'k');
    const job = { jobId: 'j-abc', customer: 'Pat', address: '', phone: '', what: 'Opener', notes: '' };
    const first = await createOdooJob(c, 7, job);
    // The phone lost the answer (killed before saving): the next try finds it.
    expect(await createOdooJob(c, 7, job)).toEqual(first);
    expect(o.orders).toHaveLength(1);
    expect(o.orders[0].description).toBe('Opener\nApp job j-abc');
  });

  it('uses the Odoo contact with the same phone, then the same name, before making one', async () => {
    const o = fakeOdoo();
    const c = await OdooClient.signIn(o.fetchFn, login, 'k');
    o.partners.push({ id: 7, name: 'Pat Smith', phone: '(512) 555-0101', customer_rank: 1 }, { id: 8, name: 'Lee Park', phone: false, customer_rank: 1 });
    const f = (name: string, phone: string) => ({ name, phone, email: '', address: '', notes: '' });
    expect(await partnerFor(c, f('P. Smith', '1-512-555-0101'))).toBe(7);
    expect(await partnerFor(c, f(' lee park ', ''))).toBe(8);
    expect(await partnerFor(c, f('Kim Ortega', '512 555 0199'))).toBe(102);
    expect(o.partners.map((p) => p.name)).toEqual(['Pat Smith', 'Lee Park', 'Kim Ortega']);
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
    resetJobsSince();
    await AsyncStorage.clear();
    await AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(login));
    // Sending started before these tests' jobs were saved (savedAt 1000).
    await AsyncStorage.setItem(JOBS_SINCE_KEY, '500');
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

  it('leaves jobs from before sending started on the phone until they are picked', async () => {
    await AsyncStorage.setItem(JOBS_SINCE_KEY, '5000');
    const o = fakeOdoo();
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([base('j1'), base('j2', { customer: 'Lee Park', sendToOdoo: true }), base('j3', { customer: 'Kim', sendToOdoo: false })]));
    await renderSync(o.fetchFn);
    await settle();
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY)).map((j) => j.odooJob?.id)).toEqual([undefined, 500, undefined]);
    expect(o.orders).toHaveLength(1);
  });

  it('waits for a customer name, and remembers the contact it made on the phone customer', async () => {
    const o = fakeOdoo();
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([base('j1'), base('j2', { customer: '', phone: '', address: '1365 George Street' })]));
    await renderSync(o.fetchFn);
    await settle(20);
    // Only the named job went; no contact named after the street.
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY)).map((j) => j.odooJob?.id)).toEqual([500, undefined]);
    expect(o.partners.map((p) => p.name)).toEqual(['Pat Smith']);
    // The phone's customer knows its Odoo contact, so Customers' sync won't make a second one.
    const pat = parseCustomers(await AsyncStorage.getItem(CUSTOMERS_STORAGE_KEY)).find((c) => c.name === 'Pat Smith');
    expect(pat?.odooId).toBe(100);
  });

  it('takes a job deleted in Odoo, and its visit, off the phone', async () => {
    const o = fakeOdoo();
    o.orders.push({ id: 500, name: 'FSO500', person_id: 40, scheduled_date_start: toOdooTime(at(15, 1)), scheduled_duration: 1, stage_id: [1, 'New'] });
    await AsyncStorage.setItem(
      JOBS_STORAGE_KEY,
      JSON.stringify([base('j1', { odooJob: { model: 'fsm.order', id: 500, name: 'FSO500' } }), base('j2', { odooJob: { model: 'fsm.order', id: 501, name: 'FSO501' } })]),
    );
    await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify([{ id: 'odoo-501', jobId: 'j2', start: at(9, 1), minutes: 60, name: 'Pat', address: '', phone: '', what: '', status: 'booked', createdAt: 1, updatedAt: 1, syncedAt: 1 }]));
    await renderSync(o.fetchFn);
    await settle(20);
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY)).map((j) => j.id)).toEqual(['j1']);
    expect(parseSchedule(await AsyncStorage.getItem(SCHEDULE_STORAGE_KEY)).map((v) => v.id)).toEqual(['odoo-500']);
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

  it('puts jobs given to me in Odoo on the schedule, and takes them off when they go to someone else', async () => {
    const o = fakeOdoo();
    o.locations.push({ id: 71, name: 'Atx', street: '9 Elm St', city: 'Austin', zip: '78701', phone: '512 555 0100' });
    o.orders.push({ id: 600, name: 'FO0001', location_id: 71, person_id: 40, scheduled_date_start: toOdooTime(at(10, 1)), scheduled_duration: 1.5, stage_id: [1, 'New'], description: 'Help door trapped' });
    o.orders.push({ id: 601, name: 'FO0002', location_id: 71, person_id: 41, scheduled_date_start: toOdooTime(at(11, 1)), scheduled_duration: 1, stage_id: [1, 'New'] });
    await renderSync(o.fetchFn);
    await settle();
    let visits = parseSchedule(await AsyncStorage.getItem(SCHEDULE_STORAGE_KEY));
    expect(visits.map((v) => [v.id, v.start, v.minutes, v.name, v.address, v.what, v.odooName])).toEqual([['odoo-600', at(10, 1), 90, 'Atx', '9 Elm St, Austin 78701', 'Help door trapped', 'FO0001']]);

    // Given to someone else in Odoo: off my schedule on the next pass.
    o.orders[0].person_id = 41;
    await act(async () => shown?.unmount());
    await renderSync(o.fetchFn);
    await settle();
    visits = parseSchedule(await AsyncStorage.getItem(SCHEDULE_STORAGE_KEY));
    expect(visits).toEqual([]);
  });

  it('sends steps and Close job tapped on the phone to the order', async () => {
    const o = fakeOdoo();
    o.orders.push({ id: 500, name: 'FSO500', person_id: 40, scheduled_date_start: false, scheduled_duration: 1, stage_id: [1, 'New'] });
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([base('j1', { odooJob: { model: 'fsm.order', id: 500, name: 'FSO500' }, odooSent: sentAtCreate(''), steps: { arrivedAt: at(10) }, status: 'done' })]));
    await renderSync(o.fetchFn);
    await settle();
    expect(o.orders[0]).toMatchObject({ date_start: toOdooTime(at(10)), stage_id: [9, 'Done'] });
    const [j] = parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY));
    expect(j.odooSent).toEqual({ notes: '', steps: { arrivedAt: at(10) }, done: true });
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

describe('picking older jobs to send', () => {
  // renderApp runs on fake timers, so this waits on promises only.
  const settle = async (n = 10) => {
    for (let i = 0; i < n; i++) await act(async () => undefined);
  };

  beforeEach(async () => {
    resetJobsSince();
    await AsyncStorage.clear();
    await AsyncStorage.setItem(JOBS_SINCE_KEY, '5000');
  });

  it('sends the ticked ones and keeps the rest on the phone', async () => {
    const job = (id: string, customer: string) => createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer, address: '1 Oak St', phone: '', notes: '' }, { title: '' }, 1000, id);
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([job('j1', 'Pat Smith'), job('j2', 'john smith'), job('j3', 'Atx')]));
    await renderApp('/odoo-older-jobs');
    await settle(5);
    expect(screen.getByTestId('older-done')).toHaveTextContent('Keep them all on the phone');
    await fireEvent.press(screen.getByTestId('older-j1'));
    expect(screen.getByTestId('older-done')).toHaveTextContent('Send 1 to Odoo, keep 2 on the phone');
    await fireEvent.press(screen.getByTestId('older-done'));
    await settle(5);
    const saved = parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY));
    expect(saved.map((j) => j.sendToOdoo)).toEqual([true, false, false]);
    expect(olderJobs(saved, 5000)).toEqual([]);
  });
});

describe('the Jobs tab, signed in to Odoo', () => {
  const settle = async (n = 10) => {
    for (let i = 0; i < n; i++) await act(async () => undefined);
  };

  beforeEach(async () => {
    resetJobsSince();
    await AsyncStorage.clear();
  });
  afterEach(() => jest.restoreAllMocks());

  it("lists Odoo's jobs, and opening one makes the phone's job for it", async () => {
    const o = fakeOdoo();
    o.locations.push({ id: 71, name: 'Atx', street: '9 Elm St', city: 'Austin', zip: '78701', phone: '512 555 0100' });
    o.orders.push({ id: 600, name: 'FO0001', location_id: 71, person_id: 41, scheduled_date_start: toOdooTime(at(10, 1)), scheduled_duration: 1, stage_id: [1, 'New'], description: 'Help door trapped' });
    o.orders.push({ id: 601, name: 'FO0002', location_id: 71, person_id: 41, stage_id: [9, 'Done'] });
    jest.spyOn(globalThis, 'fetch').mockImplementation(((url: string, init: Parameters<Fetch>[1]) => o.fetchFn(url, init)) as unknown as typeof fetch);
    const app = await renderApp('/team');
    await settle();
    await fireEvent.changeText(screen.getByTestId('team-url'), 'acme.odoo.com');
    await fireEvent.changeText(screen.getByTestId('team-login'), 'j@x.test');
    await fireEvent.changeText(screen.getByTestId('team-secret'), 'key123');
    await fireEvent.press(screen.getByTestId('team-signin-go'));
    await settle();
    await act(async () => router.navigate('/jobs'));
    await settle();

    expect(screen.getByTestId('odoo-job-600')).toHaveTextContent(/Atx.*9 Elm St, Austin 78701.*Help door trapped.*FO0001/);
    // Open is the default filter: the done one isn't listed.
    expect(screen.queryByTestId('odoo-job-601')).toBeNull();
    expect(screen.queryByTestId('jobs-empty')).toBeNull();

    await fireEvent.press(screen.getByTestId('odoo-job-600'));
    await settle();
    expect(app.getPathname()).toMatch(/^\/job\//);
    const jobs = parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY));
    expect(jobs).toEqual([expect.objectContaining({ customer: 'Atx', address: '9 Elm St, Austin 78701', what: 'Help door trapped', odooJob: { model: 'fsm.order', id: 600, name: 'FO0001' } })]);
    // Nothing new went to Odoo for it.
    expect(o.calls.filter((c) => c.method === 'create')).toEqual([]);
  });
});

describe('New job offers Odoo\'s Field Service templates', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('lists the templates read last time as the kinds of job, and saves the picked one', async () => {
    await AsyncStorage.setItem(FSM_TEMPLATES_STORAGE_KEY, JSON.stringify([{ id: 3, name: 'Broken spring', instructions: '' }, { id: 4, name: 'Gate service', instructions: '' }]));
    await renderApp('/new-job');
    for (let i = 0; i < 5; i++) await act(async () => undefined);
    expect(screen.getByTestId('new-job-what')).toHaveTextContent(/Broken spring.*Gate service/);
    expect(screen.queryByText('Off track')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('new-job-name'), 'Sam Ortiz');
    await fireEvent.press(screen.getByText('Gate service'));
    await fireEvent.press(screen.getByTestId('new-job-start'));
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].what).toBe('Gate service');
  });
});
