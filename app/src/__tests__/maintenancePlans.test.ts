import { addStarterPlans, archivePlan, blankPlan, fetchPlans, parsePlanNotes, planNotes, plansFor, planSummary, savePlan, STARTER_PLANS } from '../lib/maintenancePlans';

type Call = { model: string; method: string; args: unknown[]; kwargs?: Record<string, unknown> };

function fake(fields: string[], rows: Record<string, unknown>[] = []) {
  const calls: Call[] = [];
  return {
    calls,
    session: {} as never,
    async call(model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) {
      calls.push({ model, method, args, kwargs });
      if (method === 'fields_get') return Object.fromEntries(fields.map((f) => [f, {}]));
      if (method === 'next_by_code') return 'AGR0001';
      if (method === 'search_read') return rows;
      if (method === 'create') return 99;
      return true;
    },
  };
}

describe('maintenance plans', () => {
  const plan = { ...blankPlan(), name: 'Twice a year <b>', description: 'Two visits & a check', everyMonths: 6, visitsPerYear: 2, priceCents: 19900, perks: ['Priority scheduling'], audience: 'homes' as const, jobTypeId: 4, jobTypeName: 'Tune-up' };

  it('keeps the schedule in the notes and reads it back', () => {
    const html = planNotes(plan);
    expect(html).toContain('Priority scheduling');
    const back = parsePlanNotes(html);
    expect(back).toMatchObject({ everyMonths: 6, visitsPerYear: 2, priceCents: 19900, perks: ['Priority scheduling'], audience: 'homes', jobTypeId: 4, description: 'Two visits & a check', daysAhead: 30 });
    expect(parsePlanNotes('<p>Just an agreement</p>')).toBeUndefined();
    expect(parsePlanNotes('<p>johnsons-plan:{bad</p>')).toBeUndefined();
  });

  it('lists only plans and skips other agreements', async () => {
    const c = fake(['name', 'description', 'active', 'is_template'], [
      { id: 1, name: 'Yearly tune-up', description: planNotes(blankPlan()), active: true },
      { id: 2, name: 'Old', description: '<p>nope</p>', active: true },
      { id: 3, name: 'Archived', description: planNotes({ ...blankPlan(), sort: 5 }), active: false },
    ]);
    const list = await fetchPlans(c, { includeArchived: true });
    expect(list.map((p) => p.id)).toEqual([1, 3]);
    expect(list[1].active).toBe(false);
    const read = c.calls.find((x) => x.method === 'search_read')!;
    expect(JSON.stringify(read.args[0])).toContain('is_template');
    expect(JSON.stringify(read.args[0])).toContain('"active","in"');
  });

  it('shows nothing without the Agreement app', async () => {
    expect(await fetchPlans(fake([]))).toEqual([]);
    await expect(savePlan(fake([]), plan)).rejects.toThrow(/Agreement app/);
  });

  it('creates and updates a plan as a template agreement', async () => {
    const c = fake(['name', 'description', 'active', 'is_template', 'code', 'domain']);
    expect(await savePlan(c, plan)).toBe(99);
    const made = c.calls.find((x) => x.method === 'create')!;
    expect(made.args[0]).toMatchObject({ name: 'Twice a year <b>', is_template: true, active: true, code: 'AGR0001', domain: 'sale' });
    const c2 = fake(['name', 'description']);
    expect(await savePlan(c2, { ...plan, id: 5 })).toBe(5);
    expect(c2.calls.find((x) => x.method === 'write')!.args[0]).toEqual([5]);
    await expect(savePlan(c2, { ...plan, name: ' ' })).rejects.toThrow(/name/);
  });

  it('archives a plan', async () => {
    const c = fake(['name', 'description', 'active']);
    await archivePlan(c, 7);
    expect(c.calls.at(-1)).toMatchObject({ method: 'write', args: [[7], { active: false }] });
    await expect(archivePlan(fake(['name']), 7)).rejects.toThrow(/archive/);
  });

  it('adds the starter plans once', async () => {
    const c = fake(['name', 'description'], [{ id: 1, name: 'Yearly tune-up', description: planNotes(blankPlan()) }]);
    expect(await addStarterPlans(c)).toBe(STARTER_PLANS.length - 1);
    expect(c.calls.filter((x) => x.method === 'create')).toHaveLength(2);
  });

  it('offers a plan by who the customer is', () => {
    const list = STARTER_PLANS.map((p, i) => ({ ...p, id: i + 1 }));
    expect(plansFor(list, false).map((p) => p.name)).toEqual(['Yearly tune-up', 'Twice-a-year service']);
    expect(plansFor(list, true).map((p) => p.name)).toEqual(['Yearly tune-up', 'Commercial / Property manager plan']);
    expect(plansFor([{ ...list[0], active: false }], false)).toEqual([]);
    expect(planSummary({ ...blankPlan(), everyMonths: 6, priceCents: 15000, termMonths: 24 })).toBe('Every 6 months · $150 · 2 years');
  });
});

describe('plans on an Agreement with another notes field', () => {
  it('keeps the plan in the notes field the model has, and names what is missing when there is none', async () => {
    const calls: { method: string; args: unknown[] }[] = [];
    const mk = (fields: Record<string, { type: string }>) =>
      ({
        call: async (_m: string, method: string, args: unknown[]) => {
          calls.push({ method, args });
          if (method === 'fields_get') return fields;
          if (method === 'search') return [];
          if (method === 'create') return 9;
          return [];
        },
      }) as never;
    const { savePlan, plansProblem, blankPlan } = jest.requireActual('../lib/maintenancePlans') as typeof import('../lib/maintenancePlans');
    const withNotes = mk({ name: { type: 'char' }, notes: { type: 'text' }, partner_id: { type: 'many2one' } });
    expect(await plansProblem(withNotes)).toBeNull();
    await savePlan(withNotes, { ...blankPlan(), name: 'Gold' });
    const created = calls.find((c) => c.method === "create")!.args as Record<string, unknown>[];
    expect(String(created[0].notes)).toContain('johnsons-plan:');
    expect(created[0].notes).not.toMatch(/<p>/);
    const none = mk({ name: { type: 'char' }, partner_id: { type: 'many2one' } });
    expect(await plansProblem(none)).toBeNull();
    const notAgreement = mk({ id: { type: 'integer' } });
    expect(await plansProblem(notAgreement)).not.toMatch(/fields found|activity_ids/);
  });
});

describe('plans on an Agreement with no notes field', () => {
  it('keeps the plan in a file on the agreement and reads it back', async () => {
    const store: Record<string, unknown>[] = [];
    const c = {
      session: {} as never,
      call: async (model: string, method: string, args: unknown[]) => {
        if (method === 'fields_get') return { name: {}, code: {}, active: {}, is_template: {}, domain: {} };
        if (method === 'next_by_code') return 'AGR1';
        if (model === 'ir.attachment' && method === 'create') {
          store.push({ id: store.length + 1, ...(args[0] as object) });
          return store.length;
        }
        if (model === 'ir.attachment' && method === 'search_read') return store.filter((a) => a.res_id === (args[0] as unknown[][]).find((d) => d[0] === 'res_id')?.[2] || !(args[0] as unknown[][]).some((d) => d[0] === 'res_id'));
        if (model === 'agreement' && method === 'create') return 7;
        if (model === 'agreement' && method === 'search_read') return [{ id: 7, name: 'Gold', active: true }];
        return true;
      },
    };
    const id = await savePlan(c, { ...blankPlan(), name: 'Gold', priceCents: 12000, everyMonths: 6 });
    expect(id).toBe(7);
    expect(store[0]).toMatchObject({ res_model: 'agreement', res_id: 7, name: 'johnsons-plan.json' });
    const list = await fetchPlans(c);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 7, name: 'Gold', priceCents: 12000, everyMonths: 6 });
  });
});
