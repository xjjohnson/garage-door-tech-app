import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { cleanUrl, Fetch, guessDb, odooTime, OdooClient, OdooError, plainText, taskToAppointment } from '../lib/odoo';
import { parseSchedule, SCHEDULE_STORAGE_KEY } from '../lib/schedule';
import { renderApp } from '../testing/renderApp';

type Task = Record<string, unknown> & { id: number };

/** A tiny pretend Odoo: two users, a few tasks, Field Service on or off. */
function fakeOdoo({ fsm = true, assignField = 'user_ids' as 'user_ids' | 'user_id', secret = 'key123', project = true, oca = false, planning = true } = {}) {
  const tasks: Task[] = [
    { id: 11, name: 'Broken spring', partner_id: [7, 'Pat Smith'], planned_date_begin: '2026-11-12 15:00:00', date_deadline: false, stage_id: [1, 'New'], description: '<p>Left spring <b>snapped</b></p>', [assignField]: assignField === 'user_ids' ? [2] : [2, 'Justin'], partner_phone: '555-123-4567', fsm_done: false, active: true },
    { id: 12, name: 'Tune-up', partner_id: [8, 'Lee Park'], planned_date_begin: false, date_deadline: '2026-11-14', stage_id: [1, 'New'], description: '', [assignField]: assignField === 'user_ids' ? [] : false, fsm_done: false, active: true },
  ];
  const orders: { id: number; name: string; location_id: [number, string] | false; person_id: [number, string] | false; scheduled_date_start: string | false; stage_id: [number, string]; description: string; todo: string; date_end: string | false; closed: boolean }[] = [
    { id: 501, name: 'SO-501', location_id: [70, 'Pat Smith'], person_id: [40, 'Justin'], scheduled_date_start: '2026-11-12 15:00:00', stage_id: [1, 'Scheduled'], description: 'Spring snapped', todo: '<p>Bring 2 springs</p>', date_end: false, closed: false },
    { id: 502, name: 'SO-502', location_id: [70, 'Pat Smith'], person_id: false, scheduled_date_start: false, stage_id: [1, 'New'], description: '', todo: '', date_end: false, closed: false },
  ];
  const calls: { model?: string; method: string; args: unknown[] }[] = [];
  const has = (t: Task, d: unknown[]) =>
    (d as [string, string, unknown][]).every(([f, op, v]) => {
      const x = t[f];
      if (op === 'in') return Array.isArray(x) && (v as number[]).some((n) => (x as number[]).includes(n));
      if (op === '=' && v === false) return x === false || (Array.isArray(x) && x.length === 0);
      if (op === '=' && Array.isArray(x)) return x[0] === v;
      return x === v;
    });
  const fetchFn: Fetch = async (_url, init) => {
    const { params } = JSON.parse(init.body);
    const reply = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) });
    const error = (name: string, message: string) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'Odoo Server Error', data: { name, message } } }) });
    if (params.service === 'common') {
      calls.push({ method: params.method, args: params.args });
      return reply(params.args[2] === secret ? 2 : false);
    }
    const [, , pw, model, method, args] = params.args as [string, number, string, string, string, unknown[], Record<string, unknown>];
    calls.push({ model, method, args });
    if (pw !== secret) return error('odoo.exceptions.AccessDenied', 'Access Denied');
    if (!project && model === 'project.task') return error('builtins.KeyError', "Object project.task doesn't exist");
    if (model.startsWith('fsm.') && !oca) return error('builtins.KeyError', `Object ${model} doesn't exist`);
    if (model === 'project.task' && method === 'fields_get') {
      if (!planning) return reply({ name: {}, date_deadline: {}, description: {}, [assignField]: {} });
      return reply({ name: {}, [assignField]: {}, planned_date_begin: {}, date_deadline: {}, description: {}, ...(fsm ? { is_fsm: {}, fsm_done: {}, partner_phone: {} } : {}) });
    }
    if (model === 'fsm.order' && method === 'fields_get') return reply({ name: {}, location_id: {}, person_id: {}, scheduled_date_start: {}, stage_id: {}, description: {}, todo: {}, date_end: {} });
    if (model === 'fsm.stage' && method === 'fields_get') return reply({ name: {}, is_closed: {} });
    if (model === 'fsm.person' && method === 'search_read') {
      const d = args[0] as [string, string, unknown][];
      const people = [{ id: 40, name: 'Justin', email: 'j@x.test', partner_id: 90 }, { id: 41, name: 'Sam', email: 's@x.test', partner_id: 91 }];
      return reply(people.filter((p) => d.every(([f, , v]) => f !== 'partner_id' || p.partner_id === v)));
    }
    if (model === 'fsm.location' && method === 'read') return reply([{ id: 70, name: 'Pat Smith', street: '1 Oak St', city: 'Springfield', zip: '12345', phone: '555-123-4567', mobile: '' }]);
    if (model === 'fsm.order' && method === 'search_read') {
      const d = args[0] as [string, string, unknown][];
      return reply(orders.filter((o) => !o.closed && d.every(([f, , v]) => f !== 'person_id' || (v === false ? o.person_id === false : Array.isArray(o.person_id) && o.person_id[0] === v))));
    }
    if (model === 'fsm.order' && method === 'write') {
      const [[id], vals] = args as [number[], Record<string, unknown>];
      const o = orders.find((x) => x.id === id)!;
      if ('person_id' in vals) o.person_id = [vals.person_id as number, 'x'];
      if ('date_end' in vals) o.date_end = vals.date_end as string;
      return reply(true);
    }
    if (model === 'fsm.order' && method === 'action_complete') {
      const o = orders.find((x) => x.id === (args[0] as number[])[0])!;
      if (!o.date_end) return error('odoo.exceptions.ValidationError', "Cannot move to Complete until 'Actual End' is filled in");
      o.closed = true;
      return reply(true);
    }
    if (model === 'res.users' && method === 'read') return reply([{ id: 2, name: 'Justin', partner_id: [90, 'Justin'] }]);
    if (model === 'res.users' && method === 'search_read') return reply([{ id: 2, name: 'Justin', login: 'j@x.test' }, { id: 3, name: 'Sam', login: 's@x.test' }]);
    if (model === 'res.partner') return reply([{ id: 7, name: 'Pat Smith', street: '1 Oak St', city: 'Springfield', zip: '12345', phone: '', mobile: '' }, { id: 8, name: 'Lee Park', street: '', city: '', zip: '', phone: '555-999-0000', mobile: '' }]);
    if (model === 'project.task' && method === 'search_read') {
      const kw = params.args[6] as { fields?: string[] };
      if (!planning && kw?.fields?.includes('planned_date_begin')) return error('ValueError', "Invalid field 'planned_date_begin' on model 'project.task'");
      const domain = (args[0] as unknown[]).filter((c) => !(Array.isArray(c) && c[0] === 'is_fsm'));
      if (!fsm && (args[0] as unknown[]).some((c) => Array.isArray(c) && c[0] === 'is_fsm')) return error('ValueError', 'Invalid field is_fsm');
      return reply(tasks.filter((t) => has(t, domain)));
    }
    if (model === 'project.task' && method === 'write') {
      const [[id], vals] = args as [number[], Record<string, unknown>];
      const t = tasks.find((x) => x.id === id)!;
      const v = vals[assignField];
      t[assignField] = Array.isArray(v) ? (v[0] as [number, number, number[]])[2] : [v, 'x'];
      return reply(true);
    }
    if (model === 'project.task' && method === 'action_fsm_validate') {
      tasks.find((x) => x.id === (args[0] as number[])[0])!.fsm_done = true;
      return reply(true);
    }
    return error('NotImplemented', `${model}.${method}`);
  };
  return { fetchFn, tasks, calls };
}

const login = { url: 'acme.odoo.com', db: 'acme', login: 'j@x.test' };

describe('Odoo (plain logic)', () => {
  it('tidies the address and guesses the database', () => {
    expect(cleanUrl(' acme.odoo.com/odoo/action-123 ')).toBe('https://acme.odoo.com');
    expect(cleanUrl('http://10.0.0.5:8069/web#home')).toBe('http://10.0.0.5:8069');
    expect(guessDb('https://acme.odoo.com/')).toBe('acme');
    expect(guessDb('erp.acme.com')).toBe('');
  });

  it('reads Odoo times and notes', () => {
    expect(odooTime('2026-11-12 15:00:00')).toBe(Date.UTC(2026, 10, 12, 15));
    expect(new Date(odooTime('2026-11-14')!).getDate()).toBe(14);
    expect(odooTime(false)).toBeUndefined();
    expect(plainText('<p>Left spring <b>snapped</b></p><p>Gate &amp; code 1234</p>')).toBe('Left spring snapped\nGate & code 1234');
  });

  it('signs in, finds Field Service, and reads my jobs with the customer', async () => {
    const o = fakeOdoo();
    const c = await OdooClient.signIn(o.fetchFn, login, 'key123');
    expect(c.session).toMatchObject({ url: 'https://acme.odoo.com', uid: 2, name: 'Justin', fsm: true, assignField: 'user_ids' });
    const mine = await c.myTasks();
    expect(mine).toEqual([
      { id: 11, name: 'Broken spring', customer: 'Pat Smith', customerId: 7, phone: '555-123-4567', address: '1 Oak St, Springfield 12345', start: Date.UTC(2026, 10, 12, 15), stage: 'New', notes: 'Left spring snapped', assignees: [2] },
    ]);
    const search = o.calls.find((x) => x.method === 'search_read' && x.model === 'project.task')!;
    expect(search.args[0]).toEqual([['user_ids', 'in', [2]], ['is_fsm', '=', true], ['fsm_done', '=', false], ['active', '=', true]]);
    const appt = taskToAppointment(mine[0], 1);
    expect(appt).toMatchObject({ id: 'odoo-11', start: Date.UTC(2026, 10, 12, 15), name: 'Pat Smith', what: 'Broken spring', status: 'booked' });
  });

  it('dispatches an unassigned job and marks a job done', async () => {
    const o = fakeOdoo();
    const c = await OdooClient.signIn(o.fetchFn, login, 'key123');
    expect((await c.unassignedTasks()).map((t) => t.id)).toEqual([12]);
    await c.assign(12, 3);
    expect(o.calls.at(-1)).toEqual({ model: 'project.task', method: 'write', args: [[12], { user_ids: [[6, 0, [3]]] }] });
    expect((await c.myTasks(3)).map((t) => [t.id, t.phone])).toEqual([[12, '555-999-0000']]);
    await c.markDone(11);
    expect(await c.myTasks()).toEqual([]);
  });

  it('works without Field Service on an older Odoo', async () => {
    const o = fakeOdoo({ fsm: false, assignField: 'user_id' });
    const c = await OdooClient.signIn(o.fetchFn, login, 'key123');
    expect(c.session).toMatchObject({ fsm: false, assignField: 'user_id' });
    expect((await c.myTasks()).map((t) => [t.id, t.assignees])).toEqual([[11, [2]]]);
    await c.assign(12, 3);
    expect(o.calls.at(-1)?.args).toEqual([[12], { user_id: 3 }]);
    await expect(c.markDone(11)).rejects.toThrow(/Field Service/);
  });

  it('signs in when Odoo has no Project or Field Service app yet', async () => {
    const c = await OdooClient.signIn(fakeOdoo({ project: false }).fetchFn, login, 'key123');
    expect(c.session).toMatchObject({ uid: 2, name: 'Justin', kind: 'none' });
  });

  it('reads Project tasks on community Odoo without asking for Enterprise-only fields', async () => {
    const c = await OdooClient.signIn(fakeOdoo({ fsm: false, planning: false }).fetchFn, login, 'key123');
    expect(c.session).toMatchObject({ kind: 'task', fields: ['date_deadline', 'description'] });
    expect((await c.myTasks()).map((t) => [t.id, t.name])).toEqual([[11, 'Broken spring']]);
    expect(c.canMarkDone).toBe(false);
  });

  it('uses community Field Service orders, workers and locations', async () => {
    const o = fakeOdoo({ oca: true, project: false });
    const c = await OdooClient.signIn(o.fetchFn, login, 'key123', () => Date.UTC(2026, 10, 12, 17));
    expect(c.session).toMatchObject({ kind: 'oca', me: 40, closedStage: true });
    expect(await c.myTasks()).toEqual([
      { id: 501, name: 'SO-501', customer: 'Pat Smith', phone: '555-123-4567', address: '1 Oak St, Springfield 12345', start: Date.UTC(2026, 10, 12, 15), stage: 'Scheduled', notes: 'Spring snapped\nBring 2 springs', assignees: [40] },
    ]);
    expect((await c.unassignedTasks()).map((t) => t.id)).toEqual([502]);
    expect((await c.techs()).map((t) => [t.id, t.name])).toEqual([[40, 'Justin'], [41, 'Sam']]);
    await c.assign(502, 41);
    expect((await c.myTasks(41)).map((t) => t.id)).toEqual([502]);
    expect(c.canMarkDone).toBe(true);
    await c.markDone(501);
    expect(o.calls.find((x) => x.method === 'write' && x.model === 'fsm.order' && 'date_end' in (x.args[1] as object))?.args[1]).toEqual({ date_end: '2026-11-12 17:00:00' });
    expect(await c.myTasks()).toEqual([]);
  });

  it('says plainly when the sign-in is wrong or Odoo is unreachable', async () => {
    const o = fakeOdoo();
    await expect(OdooClient.signIn(o.fetchFn, login, 'nope')).rejects.toEqual(new OdooError('Wrong email, password or API key.', 'login'));
    await expect(OdooClient.signIn(async () => Promise.reject(new Error('offline')), login, 'x')).rejects.toThrow(/Couldn't reach Odoo/);
    await expect(OdooClient.signIn(async () => ({ ok: false, status: 404, json: async () => ({}) }), login, 'x')).rejects.toThrow(/404/);
    await expect(OdooClient.signIn(o.fetchFn, { ...login, db: '' }, 'x')).rejects.toThrow(/Fill in/);
  });
});

describe('Team screen', () => {
  const settle = async (n = 8) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };
  afterEach(() => jest.restoreAllMocks());

  it('signs in, puts my Odoo job on the schedule and gives an open job to a tech', async () => {
    await AsyncStorage.clear();
    const o = fakeOdoo();
    jest.spyOn(globalThis, 'fetch').mockImplementation(((url: string, init: Parameters<Fetch>[1]) => o.fetchFn(url, init)) as unknown as typeof fetch);
    const app = await renderApp('/jobs');
    await settle();
    await fireEvent.press(screen.getByTestId('open-team'));
    expect(app.getPathname()).toBe('/team');
    await settle();
    await fireEvent.changeText(screen.getByTestId('team-url'), 'acme.odoo.com');
    expect(screen.getByTestId('team-db').props.value).toBe('acme');
    await fireEvent.changeText(screen.getByTestId('team-login'), 'j@x.test');
    await fireEvent.changeText(screen.getByTestId('team-secret'), 'wrong');
    await fireEvent.press(screen.getByTestId('team-signin-go'));
    await settle();
    expect(screen.getByTestId('team-error')).toHaveTextContent('Wrong email, password or API key.');
    await fireEvent.changeText(screen.getByTestId('team-secret'), 'key123');
    await fireEvent.press(screen.getByTestId('team-signin-go'));
    await settle();
    expect(screen.getByTestId('team-who')).toHaveTextContent('Signed in as Justin · acme.odoo.com');
    expect(screen.getByTestId('task-11')).toHaveTextContent(/Broken spring.*Pat Smith.*1 Oak St/);

    await fireEvent.press(screen.getByTestId('team-schedule-11'));
    await settle(3);
    const saved = parseSchedule(await AsyncStorage.getItem(SCHEDULE_STORAGE_KEY));
    expect(saved.map((a) => [a.id, a.name, a.what])).toEqual([['odoo-11', 'Pat Smith', 'Broken spring']]);
    expect(screen.getByTestId('team-schedule-11')).toHaveTextContent('On schedule ✓');

    await fireEvent.press(screen.getByTestId('team-assign-12-3'));
    await settle();
    expect(o.tasks.find((t) => t.id === 12)!.user_ids).toEqual([3]);
    expect(screen.queryByTestId('team-assign-12-3')).toBeNull();
    // The password or key never goes into AsyncStorage.
    expect(JSON.stringify(await AsyncStorage.multiGet(await AsyncStorage.getAllKeys()))).not.toContain('key123');
  });

  it('explains which Odoo app to install when there are no jobs yet', async () => {
    await AsyncStorage.clear();
    const o = fakeOdoo({ project: false });
    jest.spyOn(globalThis, 'fetch').mockImplementation(((url: string, init: Parameters<Fetch>[1]) => o.fetchFn(url, init)) as unknown as typeof fetch);
    await renderApp('/team');
    await settle();
    await fireEvent.changeText(screen.getByTestId('team-url'), 'acme.odoo.com');
    await fireEvent.changeText(screen.getByTestId('team-login'), 'j@x.test');
    await fireEvent.changeText(screen.getByTestId('team-secret'), 'key123');
    await fireEvent.press(screen.getByTestId('team-signin-go'));
    await settle();
    expect(screen.getByTestId('team-who')).toHaveTextContent(/^Signed in as Justin/);
    expect(screen.getByTestId('team-no-tasks')).toHaveTextContent(/install Field Service/);
    expect(screen.queryByTestId('team-error')).toBeNull();
  });
});
