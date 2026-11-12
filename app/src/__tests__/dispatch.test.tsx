import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Linking } from 'react-native';
import { Fetch, OdooClient, toOdooTime } from '../lib/odoo';
import { bookedText } from '../screens/DispatchScreen';
import { renderApp } from '../testing/renderApp';

type Order = { id: number; name: string; location_id: [number, string]; person_id: [number, string] | false; scheduled_date_start: string | false; scheduled_duration: number; stage_id: [number, string] };

const at = (h: number, m = 0, dayOffset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

/** A pretend Odoo with OCA Field Service: two workers, two orders on today, one nobody has. */
function fakeOdoo({ groups = ['fieldservice.group_fsm_dispatcher'], legacyHasGroup = false, noHasGroup = false, groupField = 'group_ids' } = {}) {
  const GROUP_IDS: Record<string, number> = { 'fieldservice.group_fsm_dispatcher': 31, 'fieldservice.group_fsm_manager': 32, 'base.group_system': 4 };
  const orders: Order[] = [
    { id: 601, name: 'Broken spring', location_id: [70, 'Pat Smith'], person_id: [40, 'Justin'], scheduled_date_start: toOdooTime(at(9)), scheduled_duration: 1.5, stage_id: [1, 'Scheduled'] },
    { id: 602, name: 'Tune-up', location_id: [71, 'Lee Park'], person_id: [41, 'Sam Ruiz'], scheduled_date_start: toOdooTime(at(13)), scheduled_duration: 1, stage_id: [1, 'Scheduled'] },
    { id: 603, name: 'Opener noisy', location_id: [72, 'Kim Ortega'], person_id: false, scheduled_date_start: false, scheduled_duration: 0, stage_id: [1, 'New'] },
    { id: 604, name: 'Cable off', location_id: [70, 'Pat Smith'], person_id: [40, 'Justin'], scheduled_date_start: toOdooTime(at(10, 0, 1)), scheduled_duration: 1, stage_id: [1, 'Scheduled'] },
  ];
  const calls: { model: string; method: string; args: unknown[] }[] = [];
  const fetchFn: Fetch = async (_url, init) => {
    const { params } = JSON.parse(init.body);
    const reply = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) });
    const error = (message: string) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'Odoo Server Error', data: { name: 'builtins.KeyError', message } } }) });
    if (params.service === 'common') return reply(2);
    const [, , , model, method, args] = params.args as [string, number, string, string, string, unknown[]];
    calls.push({ model, method, args });
    if (method === 'fields_get') {
      if (model === 'fsm.order') return reply({ name: {}, location_id: {}, person_id: {}, scheduled_date_start: {}, scheduled_duration: {}, stage_id: {} });
      if (model === 'fsm.stage') return reply({ name: {} });
      if (model === 'res.partner') return reply({ name: {}, partner_latitude: {}, partner_longitude: {} });
      if (model === 'sale.order' || model === 'account.move') return reply({ name: {} });
      return error(`Object ${model} doesn't exist`);
    }
    if (model === 'sale.order' && method === 'search_read') return reply([{ id: 9, name: 'S00009', partner_id: [7, 'Pat Smith'], amount_total: 412.5 }]);
    if (model === 'account.move' && method === 'search_read') return reply([{ id: 21, name: 'INV/2026/00021', partner_id: [8, 'Lee Park'], amount_residual: 80 }]);
    if (model === 'res.partner' && method === 'read')
      return reply([
        { id: 7, name: 'Pat Smith', phone: '555-1', street: '1 Oak St', street2: false, city: 'Springfield', zip: '12345', partner_latitude: 40.1, partner_longitude: -75.1 },
        { id: 8, name: 'Lee Park', phone: '', street: '2 Elm St', street2: false, city: '', zip: '', partner_latitude: 0, partner_longitude: 0 },
      ]);
    if (model === 'res.users' && method === 'read') {
      const kw = params.args[6] as { fields: string[] };
      if (kw.fields[0] === 'group_ids' || kw.fields[0] === 'groups_id') {
        if (kw.fields[0] !== groupField) return error(`Invalid field '${kw.fields[0]}' on model 'res.users'`);
        return reply([{ id: 2, [groupField]: groups.map((g) => GROUP_IDS[g]) }]);
      }
      return reply([{ id: 2, name: 'Justin', partner_id: [90, 'Justin'] }]);
    }
    if (model === 'ir.model.data') return reply(Object.entries(GROUP_IDS).map(([x, res_id]) => ({ module: x.split('.')[0], name: x.split('.')[1], res_id })));
    if (model === 'res.users' && method === 'has_group' && noHasGroup) return error('Private methods (such as has_group) cannot be called remotely.');
    if (model === 'res.users' && method === 'has_group') {
      const [first, second] = args as [unknown, unknown];
      if (legacyHasGroup) return Array.isArray(first) ? error('has_group() takes 2 positional arguments') : reply(groups.includes(first as string));
      return reply(groups.includes(second as string));
    }
    if (model === 'fsm.person') {
      const d = args[0] as [string, string, unknown][];
      const people = [{ id: 40, name: 'Justin', email: 'j@x.test', partner_id: 90 }, { id: 41, name: 'Sam Ruiz', email: 's@x.test', partner_id: 91 }];
      return reply(people.filter((p) => d.every(([f, , v]) => f !== 'partner_id' || p.partner_id === v)));
    }
    // Odoo 19: contacts (and so Field Service locations) have no mobile field.
    if (model === 'fsm.location' && (params.args[6] as { fields: string[] }).fields.includes('mobile')) return error("Invalid field 'mobile' on 'fsm.location'");
    if (model === 'fsm.location') return reply([{ id: 70, street: '1 Oak St', city: 'Springfield', zip: '12345', phone: '' }, { id: 71, street: '2 Elm St', city: 'Springfield', zip: '', phone: '' }, { id: 72, street: '3 Cedar Way', city: 'Springfield', zip: '', phone: '555-222-3333' }]);
    if (model === 'fsm.order' && method === 'search_read') {
      const d = args[0] as [string, string, unknown][];
      return reply(
        orders.filter((o) =>
          d.every(([f, op, v]) => {
            const x = (o as unknown as Record<string, unknown>)[f];
            if (f === 'person_id' && op === '=') return v === false ? x === false : Array.isArray(x) && x[0] === v;
            if (f === 'person_id' && op === '!=') return x !== false;
            if (f === 'scheduled_date_start' && op === '>=') return typeof x === 'string' && x >= (v as string);
            if (f === 'scheduled_date_start' && op === '<') return typeof x === 'string' && x < (v as string);
            return true;
          }),
        ),
      );
    }
    if (model === 'fsm.order' && method === 'write') {
      const [[id], vals] = args as [number[], Record<string, unknown>];
      const o = orders.find((x) => x.id === id)!;
      if ('person_id' in vals) o.person_id = [vals.person_id as number, vals.person_id === 40 ? 'Justin' : 'Sam Ruiz'];
      if ('scheduled_date_start' in vals) o.scheduled_date_start = vals.scheduled_date_start as string;
      return reply(true);
    }
    return error(`${model}.${method}`);
  };
  return { fetchFn, orders, calls };
}

const login = { url: 'acme.odoo.com', db: 'acme', login: 'j@x.test' };

describe('dispatch (Odoo logic)', () => {
  it('reads a day of assigned orders with their length, and schedules an order', async () => {
    const o = fakeOdoo();
    const c = await OdooClient.signIn(o.fetchFn, login, 'k');
    const day = await c.jobsBetween(at(0), at(0, 0, 1));
    expect(day.map((t) => [t.id, t.assignees, t.minutes])).toEqual([[601, [40], 90], [602, [41], 60]]);
    expect(o.calls.filter((x) => x.model === 'fsm.order' && x.method === 'search_read').at(-1)?.args[0]).toEqual([['person_id', '!=', false], ['scheduled_date_start', '>=', toOdooTime(at(0))], ['scheduled_date_start', '<', toOdooTime(at(0, 0, 1))]]);
    expect(c.canSchedule).toBe(true);
    await c.scheduleJob(603, 41, at(15));
    expect(o.calls.at(-1)).toEqual({ model: 'fsm.order', method: 'write', args: [[603], { person_id: 41, scheduled_date_start: toOdooTime(at(15)) }] });
    await c.scheduleJob(603, 40);
    expect(o.calls.at(-1)?.args).toEqual([[603], { person_id: 40 }]);
  });

  it("reads job addresses on Odoo 19, where contacts have no mobile field", async () => {
    const o = fakeOdoo();
    const c = await OdooClient.signIn(o.fetchFn, login, 'k');
    expect((await c.unassignedTasks()).map((t) => [t.id, t.address, t.phone])).toEqual([[603, '3 Cedar Way, Springfield', '555-222-3333']]);
    expect((await c.myTasks()).map((t) => t.id)).toEqual([601, 604]);
  });

  it('lets dispatchers, managers and admins dispatch, and nobody else', async () => {
    expect(await (await OdooClient.signIn(fakeOdoo().fetchFn, login, 'k')).canDispatch()).toBe(true);
    expect(await (await OdooClient.signIn(fakeOdoo({ groups: ['fieldservice.group_fsm_manager'] }).fetchFn, login, 'k')).canDispatch()).toBe(true);
    expect(await (await OdooClient.signIn(fakeOdoo({ groups: ['base.group_system'] }).fetchFn, login, 'k')).canDispatch()).toBe(true);
    expect(await (await OdooClient.signIn(fakeOdoo({ groups: ['base.group_system'], legacyHasGroup: true }).fetchFn, login, 'k')).canDispatch()).toBe(true);
    expect(await (await OdooClient.signIn(fakeOdoo({ groups: [] }).fetchFn, login, 'k')).canDispatch()).toBe(false);
    // When has_group is refused over RPC, the user's own groups decide (group_ids on Odoo 19, groups_id before).
    expect(await (await OdooClient.signIn(fakeOdoo({ noHasGroup: true }).fetchFn, login, 'k')).canDispatch()).toBe(true);
    expect(await (await OdooClient.signIn(fakeOdoo({ noHasGroup: true, groupField: 'groups_id', groups: ['base.group_system'] }).fetchFn, login, 'k')).canDispatch()).toBe(true);
    expect(await (await OdooClient.signIn(fakeOdoo({ noHasGroup: true, groups: [] }).fetchFn, login, 'k')).canDispatch()).toBe(false);
  });

  it('reads open quotes and money owed with where the customer is', async () => {
    const c = await OdooClient.signIn(fakeOdoo().fetchFn, login, 'k');
    expect(await c.openQuotes()).toEqual([{ kind: 'quote', id: 9, ref: 'S00009', cents: 41250, partnerId: 7, customer: 'Pat Smith', address: '1 Oak St, Springfield 12345', phone: '555-1', lat: 40.1, lon: -75.1 }]);
    expect(await c.owedInvoices()).toEqual([{ kind: 'owed', id: 21, ref: 'INV/2026/00021', cents: 8000, partnerId: 8, customer: 'Lee Park', address: '2 Elm St', phone: '' }]);
  });

  it('writes the booking text for the customer to send by hand', () => {
    expect(bookedText({ customer: 'Kim Ortega', name: 'Opener noisy' }, 'Sam Ruiz', at(15), at(8), 'Johnsons Home Services')).toBe(
      "Hi Kim, it's Johnsons Home Services. Sam is booked to come today at 3:00 pm for Opener noisy. Reply here if that time doesn't work.",
    );
  });
});

describe('Jobs › Team', () => {
  const settle = async (n = 10) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };
  afterEach(() => jest.restoreAllMocks());

  async function signInAndOpenJobs(o: ReturnType<typeof fakeOdoo>) {
    await AsyncStorage.clear();
    jest.spyOn(globalThis, 'fetch').mockImplementation(((url: string, init: Parameters<Fetch>[1]) => o.fetchFn(url, init)) as unknown as typeof fetch);
    await renderApp('/team');
    await settle();
    await fireEvent.changeText(screen.getByTestId('team-url'), 'acme.odoo.com');
    await fireEvent.changeText(screen.getByTestId('team-login'), 'j@x.test');
    await fireEvent.changeText(screen.getByTestId('team-secret'), 'k');
    await fireEvent.press(screen.getByTestId('team-signin-go'));
    await settle();
    await act(async () => router.navigate('/jobs'));
    await settle();
  }

  it('shows unassigned orders and a lane per worker, and assigns one at a time with a text', async () => {
    const o = fakeOdoo();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await signInAndOpenJobs(o);
    await fireEvent.press(within(screen.getByTestId('jobs-whose')).getByText('Team'));
    await settle();
    expect(screen.getByTestId('dispatch-day')).toHaveTextContent('Today');
    expect(screen.getByTestId('dispatch-unassigned')).toHaveTextContent(/Not assigned · 1.*Kim Ortega · Opener noisy.*3 Cedar Way/);
    expect(screen.getByTestId('dispatch-lane-40')).toHaveTextContent(/Justin \(me\).*1 job · free after 10:30 am.*9:00 am.*Pat Smith/);
    expect(screen.getByTestId('dispatch-lane-41')).toHaveTextContent(/Sam Ruiz.*1 job · free after 2:00 pm.*Lee Park/);

    await fireEvent.press(screen.getByTestId('dispatch-assign-603'));
    const sheet = screen.getByTestId('dispatch-sheet');
    await fireEvent.press(within(sheet).getByText(/^Sam Ruiz/));
    await fireEvent.press(within(sheet).getByText('3:00 pm'));
    await fireEvent.press(screen.getByTestId('dispatch-save-text'));
    await settle();
    expect(o.orders.find((x) => x.id === 603)).toMatchObject({ person_id: [41, 'Sam Ruiz'], scheduled_date_start: toOdooTime(at(15)) });
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^sms:5552223333\?body=Hi%20Kim.*Sam%20is%20booked%20to%20come%20today%20at%203%3A00%20pm/));
    expect(screen.queryByTestId('dispatch-sheet')).toBeNull();
    expect(screen.getByTestId('dispatch-unassigned')).toHaveTextContent(/Not assigned · 0/);
    expect(screen.getByTestId('dispatch-lane-41')).toHaveTextContent(/2 jobs · free after 4:00 pm.*Kim Ortega/);

    // Tomorrow has Justin's other order.
    await fireEvent.press(screen.getByTestId('dispatch-next'));
    await settle();
    expect(screen.getByTestId('dispatch-day')).toHaveTextContent('Tomorrow');
    expect(screen.getByTestId('dispatch-lane-40')).toHaveTextContent(/10:00 am.*Pat Smith/);
    expect(screen.getByTestId('dispatch-lane-41')).toHaveTextContent(/Nothing booked/);

    // Moving a job from a lane keeps its time when none is picked.
    await fireEvent.press(screen.getByTestId('dispatch-job-604'));
    await fireEvent.press(within(screen.getByTestId('dispatch-sheet')).getByText(/^Sam Ruiz/));
    await fireEvent.press(screen.getByTestId('dispatch-save'));
    await settle();
    expect(o.calls.filter((c) => c.method === 'write').at(-1)).toEqual({ model: 'fsm.order', method: 'write', args: [[604], { person_id: 41, scheduled_date_start: toOdooTime(at(10, 0, 1)) }] });
    expect(screen.getByTestId('dispatch-lane-41')).toHaveTextContent(/Pat Smith/);

    await fireEvent.press(within(screen.getByTestId('jobs-whose')).getByText('Mine'));
    expect(screen.queryByTestId('dispatch')).toBeNull();
    expect(screen.getByTestId('jobs-search')).toBeTruthy();
  });

  it("doesn't offer Team to a tech who isn't a dispatcher", async () => {
    await signInAndOpenJobs(fakeOdoo({ groups: [] }));
    expect(screen.queryByTestId('jobs-whose')).toBeNull();
    expect(screen.getByTestId('jobs-search')).toBeTruthy();
  });
});
