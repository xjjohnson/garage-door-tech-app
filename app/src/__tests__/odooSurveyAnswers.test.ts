import { EMPTY_INSPECTION, setAnswer } from '../lib/inspection';
import { lineCommands, sendSurveys, surveyInputs, surveyKey, surveysToSend, SurveyIndex } from '../lib/odooSurveyAnswers';

const insp = () => {
  let i = EMPTY_INSPECTION(1000);
  const d = i.doors[0];
  i = setAnswer(i, `d:${d.id}:rollers`, { rating: 'poor', note: 'Worn', action: 'Replace rollers' });
  i = setAnswer(i, `d:${d.id}:track`, { rating: 'good' });
  i = { ...i, doors: [{ ...i.doors[0], maker: 'clopay', size: '16x7' }] };
  return i;
};

const idx: SurveyIndex = {
  surveys: { door: 1, opener: 2, gate: 3 },
  questions: {
    1: {
      byTitle: new Map([['Job', 10], ['Rollers', 11], ['Notes and actions', 12], ['Door manufacturer', 13]]),
      choices: new Map([[11, new Map([['Good', 111], ['Poor', 112]])], [13, new Map([['Clopay', 131], ['Other', 132]])]]),
    },
    2: { byTitle: new Map(), choices: new Map() },
    3: { byTitle: new Map(), choices: new Map() },
  },
};

describe('inspection answers as Odoo surveys', () => {
  it('makes one survey per door and opener, with flagged notes', () => {
    const inputs = surveyInputs(insp(), 'FSO/0005');
    expect(inputs.map((i) => i.kind)).toEqual(['door', 'opener']);
    const door = inputs[0].lines;
    expect(door).toContainEqual({ question: 'Job', text: 'FSO/0005' });
    expect(door).toContainEqual({ question: 'Rollers', choice: 'Poor' });
    expect(door).toContainEqual({ question: 'Door manufacturer', choice: 'Clopay' });
    expect(door).toContainEqual({ question: 'Notes and actions', text: 'Rollers: Worn. Action: Replace rollers' });
  });

  it('turns lines into answer commands, skipping what Odoo no longer has', () => {
    const cmds = lineCommands(idx, 1, surveyInputs(insp(), 'FSO/0005')[0].lines) as [number, number, Record<string, unknown>][];
    expect(cmds.map((c) => c[2].question_id).sort()).toEqual([10, 11, 12, 13]);
    expect(cmds.find((c) => c[2].question_id === 11)![2]).toMatchObject({ answer_type: 'suggestion', suggested_answer_id: 112 });
  });

  it('only sends inspections signed since the start and not already sent as they are', () => {
    const job = { id: 'j', inspection: insp(), odooJob: { model: 'fsm.order' as const, id: 5, name: 'FSO/0005' } };
    const sig = [{ for: 'inspection' as const, refId: 'j', at: 2000 }];
    expect(surveysToSend([job], sig, 3000)).toHaveLength(0);
    const [due] = surveysToSend([job], sig, 1000);
    expect(due.key).toBe(surveyKey(due.inputs));
    const done = { ...job, inspection: { ...job.inspection, surveys: { at: 1, key: due.key, ids: {} } } };
    expect(surveysToSend([done], sig, 1000)).toHaveLength(0);
  });

  it('creates new surveys, and updates an existing one in place', async () => {
    const calls: [string, string, unknown[]][] = [];
    const client = { call: async (m: string, method: string, a: unknown[]) => (calls.push([m, method, a]), method === 'create' ? 50 + calls.length : true) };
    const inputs = surveyInputs(insp(), 'FSO/0005');
    const r = await sendSurveys(client, idx, inputs, { [inputs[0].slot]: 77 }, 9);
    expect(r.ids[inputs[0].slot]).toBe(77);
    expect(calls[0][1]).toBe('write');
    expect(calls[1][1]).toBe('create');
    expect(calls[1][2][0]).toMatchObject({ survey_id: 2, partner_id: 9, state: 'done' });
    expect(r.created.map((c) => c.kind)).toEqual(['opener']);
  });
});
