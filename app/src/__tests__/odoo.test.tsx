import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { cleanUrl, Fetch, guessDb, odooTime, OdooClient, OdooError, plainText, taskToAppointment } from '../lib/odoo';
import { parseSchedule, SCHEDULE_STORAGE_KEY } from '../lib/schedule';
import { renderApp } from '../testing/renderApp';

type Task = Record<string, unknown> & { id: number };

/** A tiny pretend Odoo: two users, a few tasks, Field Service on or off. */
function fakeOdoo({ fsm = true, assignField = 'user_ids' as 'user_ids' | 'user_id', secret = 'key123' } = {}) {
  const tasks: Task[] = [
    { id: 11, name: 'Broken spring', partner_id: [7, 'Pat Smith'], planned_date_begin: '2026-11-12 15:00:00', date_deadline: false, stage_id: [1, 'New'], description: '<p>Left spring <b>snapped</b></p>', [assignField]: assignField === 'user_ids' ? [2] : [2, 'Justin'], partner_phone: '555-123-4567', fsm_done: false, active: true },
    { id: 12, name: 'Tune-up', partner_id: [8, 'Lee Park'], planned_date_begin: false, date_deadline: '2026-11-14', stage_id: [1, 'New'], description: '', [assignField]: assignField === 'user_ids' ? [] : false, fsm_done: false, active: true },
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
    if (model === 'project.task' && method === 'fields_get') return reply({ name: {}, [assignField]: {}, ...(fsm ? { is_fsm: {} } : {}) });
    if (model === 'res.users' && method === 'read') return reply([{ id: 2, name: 'Justin' }]);
    if (model === 'res.users' && method === 'search_read') return reply([{ id: 2, name: 'Justin', login: 'j@x.test' }, { id: 3, name: 'Sam', login: 's@x.test' }]);
    if (model === 'res.partner') return reply([{ id: 7, name: 'Pat Smith', street: '1 Oak St', city: 'Springfield', zip: '12345', phone: '', mobile: '' }, { id: 8, name: 'Lee Park', street: '', city: '', zip: '', phone: '555-999-0000', mobile: '' }]);
    if (model === 'project.task' && method === 'search_read') {
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
    expect(search.args[0]).toEqual([['is_fsm', '=', true], ['user_ids', 'in', [2]], ['fsm_done', '=', false], ['active', '=', true]]);
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
});
