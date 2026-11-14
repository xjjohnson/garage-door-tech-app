/**
 * The inspection checklists as Odoo Surveys. Three surveys, each a flat
 * list of questions (Surveys can't repeat a section): "Garage door inspection"
 * (one filled-in survey per door), "Opener inspection" (one per opener) and
 * "Gate inspection". Every checklist item is a one-choice question whose
 * choices carry the app's points, so Odoo's score matches the app's.
 *
 * This file knows how to find the surveys and to create any that are missing
 * from the built-in checklist (never changing one that exists, so edits made
 * in Odoo are kept). Needs the Survey app installed in Odoo. Kept free of React.
 */
import {
  DOOR_ITEMS,
  DOOR_MAKERS,
  GATE_ASTM_ITEMS,
  GATE_SLIDE_ITEMS,
  GATE_SWING_ITEMS,
  GATE_UL_ITEMS,
  ItemDef,
  MAX,
  MOTOR_ITEMS,
  MOTOR_MAKERS,
  POINTS,
  RATING_LABEL,
  SCALES,
} from './inspection';
import type { OdooClient } from './odoo';

export type SurveyKind = 'door' | 'opener' | 'gate';
export const SURVEY_KINDS: SurveyKind[] = ['door', 'opener', 'gate'];

type Caller = Pick<OdooClient, 'call'>;

/** A question to create: a section heading, a choice list or a typed answer. */
export type QuestionPlan =
  | { kind: 'page'; title: string }
  | { kind: 'choice'; title: string; choices: { label: string; score: number }[]; item?: string }
  | { kind: 'char' | 'text'; title: string };

export interface SurveyPlan {
  kind: SurveyKind;
  title: string;
  /** Kept in the description so the app finds the survey even if its title is changed. */
  marker: string;
  intro: string;
  questions: QuestionPlan[];
}

export const markerFor = (k: SurveyKind) => `johnsons:${k}`;

const choicesFor = (def: ItemDef) =>
  SCALES[def.scale].map((r) => ({ label: RATING_LABEL[r], score: r === 'na' ? 0 : (POINTS[r] / MAX[def.scale]) * 2 }));
const items = (defs: ItemDef[]): QuestionPlan[] => defs.map((d) => ({ kind: 'choice', title: d.label, choices: choicesFor(d), item: d.id }));
const makers = (list: string[]): QuestionPlan => ({ kind: 'choice', title: 'Manufacturer', choices: list.map((label) => ({ label, score: 0 })) });
const yesNo = (title: string): QuestionPlan => ({ kind: 'choice', title, choices: [{ label: 'Yes', score: 0 }, { label: 'No', score: 0 }] });
const info = (...extra: QuestionPlan[]): QuestionPlan[] => [
  { kind: 'page', title: 'Information' },
  { kind: 'char', title: 'Job' },
  ...extra,
];
const notes: QuestionPlan = { kind: 'text', title: 'Notes and actions' };

/** The three surveys as built from the app's own checklist. */
export function surveyPlans(): SurveyPlan[] {
  return [
    {
      kind: 'door',
      title: 'Garage door inspection',
      marker: markerFor('door'),
      intro: 'One filled-in survey per door. Made by the Johnsons app from the job; edit the questions here.',
      questions: [
        ...info(
          { kind: 'char', title: 'Door number' },
          yesNo('Rollers, track and opener lubricated'),
          { ...makers(DOOR_MAKERS), title: 'Door manufacturer' },
          { kind: 'char', title: 'Size (for example 16x7)' },
          { kind: 'char', title: 'Door age (year installed)' },
          { kind: 'char', title: 'Spring date code' },
          { kind: 'char', title: 'Spring cycles' },
        ),
        { kind: 'page', title: 'Door condition' },
        ...items(DOOR_ITEMS),
        { kind: 'page', title: 'Notes' },
        notes,
      ],
    },
    {
      kind: 'opener',
      title: 'Opener inspection',
      marker: markerFor('opener'),
      intro: 'One filled-in survey per opener (motor). Made by the Johnsons app from the job; edit the questions here.',
      questions: [
        ...info({ kind: 'char', title: 'Door number' }, { kind: 'char', title: 'Opener number' }, { ...makers(MOTOR_MAKERS), title: 'Opener manufacturer' }, { kind: 'char', title: 'Opener build date' }),
        { kind: 'page', title: 'Opener condition' },
        ...items(MOTOR_ITEMS),
        { kind: 'page', title: 'Notes' },
        notes,
      ],
    },
    {
      kind: 'gate',
      title: 'Gate inspection',
      marker: markerFor('gate'),
      intro: 'One filled-in survey per gate. Made by the Johnsons app from the job; edit the questions here.',
      questions: [
        ...info({ kind: 'choice', title: 'Gate type', choices: [{ label: 'Swing', score: 0 }, { label: 'Slide', score: 0 }] }),
        { kind: 'page', title: 'UL 325' },
        ...items(GATE_UL_ITEMS),
        { kind: 'page', title: 'Slide gate only' },
        ...items(GATE_SLIDE_ITEMS),
        { kind: 'page', title: 'Swing gate only' },
        ...items(GATE_SWING_ITEMS),
        { kind: 'page', title: 'ASTM F2200' },
        ...items(GATE_ASTM_ITEMS),
        { kind: 'page', title: 'Notes' },
        notes,
      ],
    },
  ];
}

const QUESTION_TYPE = { choice: 'simple_choice', char: 'char_box', text: 'text_box' } as const;

/** The create values for a survey and all its questions in one call. */
export function surveyValues(plan: SurveyPlan, surveyFields: Record<string, { selection?: unknown }>, _questionFields: Record<string, unknown>): Record<string, unknown> {
  const has = (f: string) => f in surveyFields;
  const scoring = (surveyFields.scoring_type?.selection as [string, string][] | undefined)?.map((s) => s[0]) ?? [];
  const vals: Record<string, unknown> = {
    title: plan.title,
    description: `<p>${plan.intro}</p><p><small>${plan.marker}</small></p>`,
  };
  if (has('access_mode')) vals.access_mode = 'token';
  if (has('users_login_required')) vals.users_login_required = true;
  if (has('questions_layout')) vals.questions_layout = 'page_per_section';
  if (has('scoring_type') && scoring.includes('scoring_without_answers')) vals.scoring_type = 'scoring_without_answers';
  vals.question_and_page_ids = plan.questions.map((q, i) => {
    if (q.kind === 'page') return [0, 0, { title: q.title, is_page: true, sequence: i + 1 }];
    const base: Record<string, unknown> = { title: q.title, question_type: QUESTION_TYPE[q.kind], sequence: i + 1 };
    if (q.kind === 'choice')
      base.suggested_answer_ids = q.choices.map((c, j) => [0, 0, { value: c.label, sequence: j + 1, ...(c.score ? { answer_score: c.score } : {}) }]);
    return [0, 0, base];
  });
  return vals;
}

export interface SurveyRow {
  kind: SurveyKind;
  id: number;
  title: string;
  questions: number;
}

export interface SurveyState {
  /** False when the Survey app isn't installed (or this user can't see it). */
  installed: boolean;
  found: SurveyRow[];
  missing: SurveyKind[];
}

const isMissingModel = (e: unknown) => /survey\.survey.*(doesn.t|does not) exist|Object survey\.survey doesn't exist|Unknown model/i.test(e instanceof Error ? e.message : String(e));

/** Whether Surveys is installed, which of the three surveys exist, and which are still missing. */
export async function surveyState(client: Caller): Promise<SurveyState> {
  let fields: Record<string, unknown>;
  try {
    fields = (await client.call('survey.survey', 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;
  } catch (e) {
    if (isMissingModel(e)) return { installed: false, found: [], missing: [...SURVEY_KINDS] };
    throw e;
  }
  const rows = (await client.call('survey.survey', 'search_read', [[]], { fields: ['title', 'description', ...('question_count' in fields ? ['question_count'] : [])], limit: 200, order: 'id asc' })) as { id: number; title?: string; description?: unknown; question_count?: number }[];
  const plans = surveyPlans();
  const found: SurveyRow[] = [];
  for (const p of plans) {
    const r = rows.find((x) => typeof x.description === 'string' && x.description.includes(p.marker)) ?? rows.find((x) => x.title === p.title);
    if (r) found.push({ kind: p.kind, id: r.id, title: r.title ?? p.title, questions: r.question_count ?? 0 });
  }
  return { installed: true, found, missing: SURVEY_KINDS.filter((k) => !found.some((f) => f.kind === k)) };
}

/** Creates whichever of the three surveys are missing; one that exists is left alone. Returns the kinds created. */
export async function createMissingSurveys(client: Caller): Promise<SurveyKind[]> {
  const state = await surveyState(client);
  if (!state.installed) throw new Error('The Survey app is not installed in Odoo. Install it from Apps, then try again.');
  if (!state.missing.length) return [];
  const sf = (await client.call('survey.survey', 'fields_get', [], { attributes: ['type', 'selection'] })) as Record<string, { selection?: unknown }>;
  const qf = (await client.call('survey.question', 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;
  const made: SurveyKind[] = [];
  for (const plan of surveyPlans().filter((p) => state.missing.includes(p.kind))) {
    await client.call('survey.survey', 'create', [surveyValues(plan, sf, qf)]);
    made.push(plan.kind);
  }
  return made;
}
