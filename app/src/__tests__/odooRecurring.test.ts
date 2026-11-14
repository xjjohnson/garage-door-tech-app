import { fetchAgreements, fetchRepeats, recurringSupport } from '../lib/odooRecurring';

type Call = { model: string; method: string; args: unknown[]; kwargs?: Record<string, unknown> };

function fake(models: Record<string, { fields: string[]; rows: Record<string, unknown>[] }>) {
  const calls: Call[] = [];
  return {
    calls,
    session: {} as never,
    async call(model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) {
      calls.push({ model, method, args, kwargs });
      const m = models[model];
      if (!m) throw new Error('Object does not exist');
      if (method === 'fields_get') return Object.fromEntries(m.fields.map((f) => [f, {}]));
      return m.rows;
    },
  };
}

describe('repeating visits and agreements', () => {
  it('finds which apps exist', async () => {
    expect(await recurringSupport(fake({}))).toEqual({ repeats: false, agreements: false });
    const c = fake({ 'fsm.recurring': { fields: ['location_id'], rows: [] }, agreement: { fields: ['partner_id'], rows: [] } });
    expect(await recurringSupport(c)).toEqual({ repeats: true, agreements: true });
  });

  it('reads repeats with only the fields Odoo has', async () => {
    const c = fake({ 'fsm.recurring': { fields: ['name', 'state', 'location_id', 'fsm_frequency_set_id'], rows: [{ id: 3, name: 'FSM/REC/1', state: 'progress', fsm_frequency_set_id: [2, 'Yearly'], location_id: [5, '1 Oak St'] }] } });
    const rows = await fetchRepeats(c, 7);
    expect(rows).toEqual([{ id: 3, name: 'FSM/REC/1', status: 'Active', active: true, every: 'Yearly', start: undefined, end: undefined, place: '1 Oak St' }]);
    const read = c.calls.find((x) => x.method === 'search_read');
    expect(read?.kwargs?.fields).toEqual(['name', 'state', 'fsm_frequency_set_id', 'location_id']);
  });

  it('shows nothing without the app, and reads agreements', async () => {
    expect(await fetchRepeats(fake({}), 7)).toEqual([]);
    expect(await fetchAgreements(fake({}), 7)).toEqual([]);
    const c = fake({ agreement: { fields: ['name', 'partner_id', 'start_date', 'stage_id'], rows: [{ id: 1, name: 'Yearly tune-up', stage_id: [1, 'Active'], start_date: '2026-11-14', end_date: false }] } });
    expect(await fetchAgreements(c, 7)).toEqual([{ id: 1, name: 'Yearly tune-up', code: undefined, status: 'Active', start: '2026-11-14', end: undefined, active: true }]);
  });
});
