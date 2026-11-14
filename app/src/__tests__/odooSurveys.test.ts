import { createMissingSurveys, markerFor, surveyPlans, surveyState, surveyValues } from '../lib/odooSurveys';

type Call = { model: string; method: string; args: unknown[] };

function fake(opts: { installed?: boolean; existing?: { id: number; title: string; description: string }[] } = {}) {
  const calls: Call[] = [];
  const installed = opts.installed ?? true;
  return {
    calls,
    call: async (model: string, method: string, args: unknown[]) => {
      calls.push({ model, method, args });
      if (!installed) throw new Error("Object survey.survey doesn't exist");
      if (method === 'fields_get') return model === 'survey.survey' ? { title: {}, description: {}, access_mode: {}, scoring_type: { selection: [['no_scoring', 'x'], ['scoring_without_answers', 'y']] }, question_count: {} } : { answer_score: {} };
      if (method === 'search_read') return opts.existing ?? [];
      if (method === 'create') return 99;
      throw new Error(`unexpected ${model}.${method}`);
    },
  };
}

describe('Odoo Surveys for inspections', () => {
  it('plans three surveys, with the door items scored like the app', () => {
    const plans = surveyPlans();
    expect(plans.map((p) => p.kind)).toEqual(['door', 'opener', 'gate']);
    const rollers = plans[0].questions.find((q) => q.kind === 'choice' && q.title === 'Rollers');
    expect(rollers && rollers.kind === 'choice' && rollers.choices.map((c) => [c.label, c.score])).toEqual([['Good', 2], ['Fair', 1], ['Poor', 0], ['Safety risk', 0], ['N/A', 0]]);
  });

  it('builds one create call with nested questions and answers', () => {
    const v = surveyValues(surveyPlans()[0], { scoring_type: { selection: [['scoring_without_answers', 'y']] }, access_mode: {} }, { answer_score: {} });
    expect(v.scoring_type).toBe('scoring_without_answers');
    const qs = v.question_and_page_ids as [number, number, Record<string, unknown>][];
    expect(qs[0][2]).toMatchObject({ title: 'Information', is_page: true });
    expect(qs.some((q) => q[2].title === 'Rollers' && q[2].question_type === 'simple_choice')).toBe(true);
  });

  it('says when Survey is not installed and refuses to create', async () => {
    const c = fake({ installed: false });
    expect((await surveyState(c)).installed).toBe(false);
    await expect(createMissingSurveys(c)).rejects.toThrow(/not installed/);
  });

  it('finds surveys by marker or title and creates only the missing ones', async () => {
    const c = fake({ existing: [{ id: 7, title: 'Renamed door survey', description: `<p>${markerFor('door')}</p>` }, { id: 8, title: 'Gate inspection', description: '' }] });
    const s = await surveyState(c);
    expect(s.found.map((f) => [f.kind, f.id])).toEqual([['door', 7], ['gate', 8]]);
    expect(s.missing).toEqual(['opener']);
    expect(await createMissingSurveys(c)).toEqual(['opener']);
    expect(c.calls.filter((x) => x.method === 'create')).toHaveLength(1);
  });
});
