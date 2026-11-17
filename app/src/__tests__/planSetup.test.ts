import { addMonths, activePlanFor, PlanSetupError, planEnd, planFrequencySet, setUpPlan } from '../lib/planSetup';
import { blankPlan } from '../lib/maintenancePlans';
import { toTicketPlan } from '../components/PlanRow';
import { EMPTY_TICKET, parseTicket, planDone, planKey, planLineNotes, setPlan, signedNow, signKeyOf } from '../lib/ticket';
import { signEstimate } from '../lib/estimates';

type Call = { model: string; method: string; args: unknown[]; kwargs?: Record<string, unknown> };

function fake(opts: { failAgreement?: boolean } = {}) {
  const calls: Call[] = [];
  const fields: Record<string, string[]> = {
    'fsm.recurring': ['location_id', 'name', 'fsm_order_template_id', 'end_date', 'description', 'agreement_id'],
    agreement: ['name', 'partner_id', 'description', 'start_date', 'end_date', 'code', 'active'],
    'fsm.frequency.set': ['name', 'fsm_frequency_ids', 'buffer_early'],
    'fsm.frequency': ['name', 'interval_type', 'interval'],
  };
  return {
    calls,
    session: {} as never,
    async call(model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) {
      calls.push({ model, method, args, kwargs });
      if (method === 'fields_get') return Object.fromEntries((fields[model] ?? []).map((f) => [f, {}]));
      if (model === 'fsm.frequency.set' && method === 'search') return [];
      if (model === 'fsm.frequency.set' && method === 'create') return 40;
      if (model === 'fsm.recurring' && method === 'create') return 50;
      if (model === 'agreement' && method === 'create') {
        if (opts.failAgreement) throw new Error('agreement refused');
        return 60;
      }
      if (model === 'ir.sequence') return 'AGR9';
      if (model === 'fsm.location' || model === 'res.partner') return [{ id: 8 }];
      if (method === 'search_read') return [{ id: 8, name: 'x' }];
      return true;
    },
  };
}

const plan = toTicketPlan({ ...blankPlan(), id: 3, name: 'Twice-a-year service', everyMonths: 6, visitsPerYear: 2, daysAhead: 30, jobTypeId: 9, termMonths: 12, description: 'Two visits' });
const NOW = Date.UTC(2026, 10, 17);

describe('plan dates', () => {
  it('adds months and clamps to the month end', () => {
    expect(new Date(addMonths(Date.UTC(2026, 0, 31), 1)).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(new Date(addMonths(NOW, 6)).toISOString().slice(0, 10)).toBe('2027-05-17');
    expect(planEnd({ termMonths: 0 }, NOW)).toBeUndefined();
    expect(new Date(planEnd({ termMonths: 12 }, NOW)!).toISOString().slice(0, 10)).toBe('2027-11-17');
  });
});

describe('setting a plan up in Odoo', () => {
  it('makes a frequency set, a repeat and an agreement, then notes the quotation', async () => {
    const c = fake();
    const made = await setUpPlan(c, 7, { customer: 'Sam', address: '1 Oak St' }, plan, NOW, { orderId: 12 });
    expect(made).toEqual({ repeatId: 50, agreementId: 60 });
    const set = c.calls.find((x) => x.model === 'fsm.frequency.set' && x.method === 'create')!;
    expect(set.args[0]).toMatchObject({ buffer_early: 30, fsm_frequency_ids: [[0, 0, { interval_type: 'monthly', interval: 6 }]] });
    const repeat = c.calls.find((x) => x.model === 'fsm.recurring' && x.method === 'create')!;
    expect(repeat.args[0]).toMatchObject({ fsm_frequency_set_id: 40, fsm_order_template_id: 9, start_date: '2027-05-17 00:00:00', end_date: '2027-11-17 00:00:00' });
    const agr = c.calls.find((x) => x.model === 'agreement' && x.method === 'create')!;
    expect(agr.args[0]).toMatchObject({ name: 'Twice-a-year service', start_date: '2026-11-17', end_date: '2027-11-17' });
    expect(JSON.stringify(agr.args[0])).not.toContain('johnsons-plan:');
    expect(c.calls.find((x) => x.method === 'message_post')!.args).toEqual([[12]]);
  });

  it('a yearly plan uses a yearly rule', async () => {
    const c = fake();
    await planFrequencySet(c, { everyMonths: 12, daysAhead: 14 });
    expect(c.calls.find((x) => x.method === 'create')!.args[0]).toMatchObject({ buffer_early: 14, fsm_frequency_ids: [[0, 0, { interval_type: 'yearly', interval: 1 }]] });
  });

  it('carries on from what was made when a try fails', async () => {
    const bad = fake({ failAgreement: true });
    const err = await setUpPlan(bad, 7, { customer: 'Sam', address: '' }, plan, NOW).catch((e) => e);
    expect(err).toBeInstanceOf(PlanSetupError);
    expect(err.progress).toEqual({ repeatId: 50 });
    const good = fake();
    const made = await setUpPlan(good, 7, { customer: 'Sam', address: '' }, plan, NOW, { prior: err.progress });
    expect(made).toEqual({ repeatId: 50, agreementId: 60 });
    expect(good.calls.some((x) => x.model === 'fsm.recurring' && x.method === 'create')).toBe(false);
  });

  it('says so when Odoo has neither app', async () => {
    const c = { calls: [], session: {} as never, call: async (_m: string, method: string) => { if (method === 'fields_get') throw new Error('nope'); return true; } };
    await expect(setUpPlan(c, 7, { customer: 'Sam', address: '' }, plan, NOW)).rejects.toThrow(/Recurring or Agreement/);
  });

  it('finds the plan a customer is on', async () => {
    const c = { session: {} as never, call: async (_m: string, method: string) => (method === 'fields_get' ? { name: {}, partner_id: {}, end_date: {}, active: {} } : [{ id: 1, name: 'Yearly tune-up', end_date: '2027-03-01', active: true }, { id: 2, name: 'Twice-a-year service', end_date: '2026-01-01', active: true }]) };
    expect(await activePlanFor(c, 7, ['Yearly tune-up', 'Twice-a-year service'], '2026-11-17')).toEqual({ name: 'Yearly tune-up', end: '2027-03-01' });
    expect(await activePlanFor(c, 7, ['Other'], '2026-11-17')).toBeUndefined();
  });
});

describe('the plan on a ticket', () => {
  it('is kept per estimate, written as a note line, and survives saving', () => {
    const t = setPlan(EMPTY_TICKET, plan);
    expect(planKey(t)).toBe('3:Twice-a-year service:0');
    expect(planLineNotes(t)[0]).toMatchObject({ display_type: 'line_note', name: expect.stringContaining('Twice-a-year service (included, no charge)') });
    expect(parseTicket(JSON.parse(JSON.stringify(t)))?.plan).toEqual(plan);
    expect(setPlan(t, undefined).plan).toBeUndefined();
    expect(planDone({ plan: { ...plan, setUp: { repeatId: 1, at: 0 } } })).toBe(false);
    expect(planDone({ plan: { ...plan, setUp: { repeatId: 1, agreementId: 2, at: 5 } } })).toBe(true);
  });

  it('asks the customer to sign again when the plan changes', () => {
    const base = { ...EMPTY_TICKET, id: 'e1', lines: [{ id: 'a', name: 'Opener', qty: 1, unitCents: 100, kind: 'material' as const }] };
    const set = signEstimate({ ticket: setPlan(base, plan), others: [] }, undefined, { id: 's1', by: 'Sam', at: 1 });
    expect(signedNow(set.ticket)).toBeTruthy();
    expect(signedNow(setPlan(set.ticket, undefined))).toBeUndefined();
    expect(signKeyOf(base)).not.toBe(signKeyOf(setPlan(base, plan)));
  });
});
