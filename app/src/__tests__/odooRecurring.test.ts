import { createManualFollowUp, fetchTodos } from '../lib/odooFollowUps';
import { fetchMyTodos } from '../lib/odooFollowUps';
import { hasOpenTuneUp, isRepairJob, offerTuneUpPlan } from '../lib/odooRecurring';
import { agreementCode, createAgreement, createRepeat, editAgreement, endAgreement, fetchAgreements, fetchRepeats, recurringSupport, setRepeatState } from '../lib/odooRecurring';

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

describe('writing repeats and follow-ups', () => {
  type W = { model: string; method: string; args: unknown[] };
  const writer = (opts: { sets?: number[]; failAction?: boolean; locations?: unknown[] } = {}) => {
    const calls: W[] = [];
    return {
      calls,
      session: { uid: 5, kind: 'oca', fields: [] } as never,
      async call(model: string, method: string, args: unknown[]) {
        calls.push({ model, method, args });
        if (method === 'fields_get') return { name: {}, interval_type: {}, fsm_frequency_ids: {}, buffer_early: {}, description: {} };
        if (model === 'fsm.frequency.set' && method === 'search') return opts.sets ?? [];
        if (model === 'fsm.location' && method === 'search_read') return opts.locations ?? [{ id: 11, name: '1 Oak St', street: '1 Oak St' }];
        if (model === 'fsm.recurring' && method === 'action_start' && opts.failAction) throw new Error('no such method');
        if (method === 'create') return 99;
        if (model === 'ir.model') return [4];
        if (model === 'ir.model.data') return [{ res_id: 2 }];
        return true;
      },
    };
  };

  it('makes a yearly tune-up repeat 30 days ahead and starts it', async () => {
    const c = writer();
    const id = await createRepeat(c, 7, { customer: 'Pat', address: '1 Oak St', every: 'yearly', start: Date.UTC(2027, 0, 5), what: 'Annual tune-up' });
    expect(id).toBe(99);
    const set = c.calls.find((x) => x.model === 'fsm.frequency.set' && x.method === 'create');
    expect(set?.args[0]).toMatchObject({ name: 'Yearly', buffer_early: 30, fsm_frequency_ids: [[0, 0, { interval_type: 'yearly' }]] });
    const rec = c.calls.find((x) => x.model === 'fsm.recurring' && x.method === 'create');
    expect(rec?.args[0]).toMatchObject({ location_id: 11, fsm_frequency_set_id: 99, start_date: '2027-01-05 00:00:00' });
    expect(c.calls.some((x) => x.method === 'action_start')).toBe(true);
  });

  it('reuses an existing yearly set, and sets the state when the button is missing', async () => {
    const c = writer({ sets: [3], failAction: true });
    await createRepeat(c, 7, { customer: 'Pat', address: '1 Oak St', every: 'yearly', start: 0, what: 'Tune-up' });
    expect(c.calls.some((x) => x.model === 'fsm.frequency.set' && x.method === 'create')).toBe(false);
    expect(c.calls.find((x) => x.model === 'fsm.recurring' && x.method === 'write')?.args).toEqual([[99], { state: 'progress' }]);
  });

  it('pauses and stops', async () => {
    const c = writer();
    await setRepeatState(c, 3, 'pause');
    await setRepeatState(c, 3, 'stop');
    expect(c.calls.map((x) => x.method)).toEqual(['action_suspend', 'action_cancel']);
  });

  it('makes a manual follow-up as a to-do on the customer', async () => {
    const c = writer();
    const id = await createManualFollowUp(c, 7, { title: ' Check the opener ', note: 'Remote <b> acting up', due: Date.UTC(2026, 11, 1) });
    expect(id).toBe(99);
    expect(c.calls.find((x) => x.method === 'create')?.args[0]).toMatchObject({ res_id: 7, summary: 'Check the opener', date_deadline: '2026-12-01', note: '<p>Remote &lt;b&gt; acting up</p>', user_id: 5, activity_type_id: 2 });
  });
});

describe('agreements', () => {
  const rec = () => {
    const calls: { model: string; method: string; args: unknown[] }[] = [];
    return {
      calls,
      session: { uid: 5 } as never,
      async call(model: string, method: string, args: unknown[]) {
        calls.push({ model, method, args });
        if (method === 'fields_get') return { name: {}, code: {}, description: {}, domain: {}, agreement_id: {} };
        if (method === 'next_by_code') return 'AGR0007';
        return method === 'create' ? 41 : true;
      },
    };
  };

  it('makes a record-only agreement and links the repeat', async () => {
    const c = rec();
    const id = await createAgreement(c, 7, { name: 'Yearly tune-up plan', notes: 'Two visits <a year>', start: Date.UTC(2026, 10, 14), end: Date.UTC(2027, 10, 14), repeatId: 3 });
    expect(id).toBe(41);
    expect(c.calls.find((x) => x.model === 'agreement' && x.method === 'create')?.args[0]).toMatchObject({ name: 'Yearly tune-up plan', partner_id: 7, start_date: '2026-11-14', end_date: '2027-11-14', description: '<p>Two visits &lt;a year&gt;</p>', domain: 'sale' });
    expect(c.calls.find((x) => x.model === 'fsm.recurring' && x.method === 'write')?.args).toEqual([[3], { agreement_id: 41 }]);
  });

  it('edits and ends, stopping the repeats under it', async () => {
    const c = rec();
    await editAgreement(c, 41, { name: ' New name ', notes: '' });
    expect(c.calls.find((x) => x.method === 'write')?.args).toEqual([[41], { name: 'New name', description: false }]);
    const e = rec();
    await endAgreement(e, 41, Date.UTC(2026, 11, 1), [3]);
    expect(e.calls.filter((x) => x.method !== 'fields_get').map((x) => `${x.model}.${x.method}`)).toEqual(['agreement.write', 'fsm.recurring.action_cancel']);
    expect(e.calls[0].args).toEqual([[41], { end_date: '2026-12-01' }]);
  });
});

describe('agreement code and to-dos', () => {
  it('makes a code when Odoo has no sequence', async () => {
    const c = { session: {} as never, call: async () => { throw new Error('no sequence'); } };
    expect(await agreementCode(c, Date.UTC(2026, 10, 14))).toMatch(/^JOH-261114-[A-Z0-9]{4}$/);
  });

  it('reads the open to-dos without the app marker', async () => {
    const c = { session: {} as never, call: async () => [{ id: 4, summary: 'Call back', date_deadline: '2026-11-21', note: '<p>Opener</p><p><small>johnsons-followup:x</small></p>' }, { id: 5, summary: false, date_deadline: false, note: false }] };
    expect(await fetchTodos(c, 7)).toEqual([{ id: 4, title: 'Call back', due: '2026-11-21', note: 'Opener' }, { id: 5, title: 'To-do', due: undefined, note: undefined }]);
  });
});

describe('my to-dos across customers', () => {
  it('lists mine, leaves out the app\'s invoice follow-ups, and names the customer', async () => {
    const c = {
      session: { uid: 5 } as never,
      call: async () => [
        { id: 1, summary: false, activity_type_id: [2, 'Call'], date_deadline: '2026-11-21', note: false, res_id: 7, res_name: 'john smith' },
        { id: 2, summary: 'Springs near end', date_deadline: '2026-11-22', note: '<p>x</p><p><small>johnsons-followup:springs:1</small></p>', res_id: 8, res_name: 'Kim' },
      ],
    };
    expect(await fetchMyTodos(c)).toEqual([{ id: 1, title: 'Call', partnerId: 7, customer: 'john smith', due: '2026-11-21', note: undefined }]);
  });
});

describe('tune-up plan after a repair', () => {
  it('offers only after repairs, and not where a repeat is already open', () => {
    expect(isRepairJob('Broken spring')).toBe(true);
    expect(isRepairJob(undefined)).toBe(true);
    expect(isRepairJob('Tune-up')).toBe(false);
    const r = { id: 1, name: 'R', status: 'Active', active: true, place: '12 Oak St' };
    expect(hasOpenTuneUp([r], '12 Oak St, Austin')).toBe(true);
    expect(hasOpenTuneUp([r], '99 Elm Ave')).toBe(false);
    expect(hasOpenTuneUp([{ ...r, status: 'Closed' }], '12 Oak St')).toBe(false);
    expect(hasOpenTuneUp([r], '')).toBe(true);
  });

  const odoo = (agreement: boolean) => {
    const calls: { model: string; method: string; args: unknown[] }[] = [];
    return {
      calls,
      session: { uid: 5, kind: 'oca' } as never,
      async call(model: string, method: string, args: unknown[]) {
        calls.push({ model, method, args });
        if (method === 'fields_get') {
          if (model === 'agreement' && !agreement) throw new Error('Object does not exist');
          return { name: {}, code: {}, partner_id: {}, location_id: {}, description: {}, domain: {}, agreement_id: {}, buffer_early: {} };
        }
        if (model === 'fsm.frequency.set' && method === 'search') return [3];
        if (model === 'fsm.location' && method === 'search_read') return [{ id: 11, name: '1 Oak St', street: '1 Oak St' }];
        if (model === 'agreement' && method === 'create') return 55;
        if (method === 'create') return 99;
        if (method === 'next_by_code') return 'AGR9';
        return true;
      },
    };
  };

  it('makes the yearly repeat a year out and a record-only agreement under it', async () => {
    const c = odoo(true);
    const now = Date.UTC(2026, 10, 14);
    const plan = await offerTuneUpPlan(c, 7, { customer: 'Pat', address: '1 Oak St' }, now);
    expect(plan).toEqual({ repeatId: 99, agreementId: 55 });
    const rep = c.calls.find((x) => x.model === 'fsm.recurring' && x.method === 'create');
    expect(rep?.args[0]).toMatchObject({ location_id: 11, fsm_frequency_set_id: 3, start_date: '2027-11-14 00:00:00' });
    expect(c.calls.find((x) => x.model === 'agreement' && x.method === 'create')?.args[0]).toMatchObject({ partner_id: 7, name: 'Yearly tune-up plan' });
    expect(c.calls.find((x) => x.model === 'fsm.recurring' && x.method === 'write' && JSON.stringify(x.args).includes('agreement_id'))?.args).toEqual([[99], { agreement_id: 55 }]);
  });

  it('makes just the repeat when there is no Agreement app', async () => {
    const c = odoo(false);
    expect(await offerTuneUpPlan(c, 7, { customer: 'Pat', address: '1 Oak St' }, 0)).toEqual({ repeatId: 99 });
    expect(c.calls.some((x) => x.model === 'agreement' && x.method === 'create')).toBe(false);
  });
});
