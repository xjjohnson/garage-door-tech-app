/**
 * A signed inspection as filled-in Odoo Surveys (see odooSurveys.ts): one for
 * each door, each opener and the gate, tied to the job by its order name in
 * the "Job" answer and by the customer as the survey's contact. Sent after
 * the signed report, shortly after signing; signing again updates the same
 * surveys instead of making more. Only inspections signed after the phone
 * started doing this go, and a failure never holds up the report.
 * Photos, per-item notes and the signature stay in the PDF report; the
 * surveys get a "Notes and actions" answer with the flagged items' notes.
 * Kept free of React.
 */
import { Answer, checklist, Inspection, ItemDef, RATING_LABEL } from './inspection';
import type { Job } from './jobs';
import type { OdooJobRef } from './odooJobs';
import type { Signature } from './attachments';
import type { OdooClient } from './odoo';
import { SurveyKind, surveyState } from './odooSurveys';

const DEFAULT_NOTES = 'Notes and actions';

type Caller = Pick<OdooClient, 'call'>;

/** One answer: a choice (matched by its label), or typed text. */
export interface Line {
  question: string;
  choice?: string;
  text?: string;
}

export interface SurveyInput {
  /** "door:<id>", "opener:<id>" or "gate": where its Odoo id is kept. */
  slot: string;
  kind: SurveyKind;
  label: string;
  lines: Line[];
}

const typed = (question: string, text: string): Line[] => (text.trim() ? [{ question, text: text.trim() }] : []);
const pick = (question: string, value: string, options: string[]): Line[] => {
  const v = value.trim();
  if (!v) return [];
  return [{ question, choice: options.find((o) => o.toLowerCase() === v.toLowerCase()) ?? 'Other' }];
};

function itemLines(defs: ItemDef[], answers: Record<string, Answer>): { lines: Line[]; notes: string[] } {
  const lines: Line[] = [];
  const notes: string[] = [];
  for (const d of defs) {
    const a = answers[d.id];
    if (!a) continue;
    if (a.rating) lines.push({ question: d.label, choice: RATING_LABEL[a.rating] });
    const extra = [a.note.trim(), a.action.trim() ? `Action: ${a.action.trim()}` : ''].filter(Boolean).join('. ');
    if (extra) notes.push(`${d.label}: ${extra}`);
  }
  return { lines, notes };
}

const withNotes = (lines: Line[], notes: string[], question: string): Line[] => (notes.length ? [...lines, { question, text: notes.join('\n') }] : lines);

/** Every survey an inspection fills in, for the job named `jobName` in Odoo. */
export function surveyInputs(insp: Inspection, jobName: string): SurveyInput[] {
  const out: SurveyInput[] = [];
  const cl = checklist();
  const L = cl.info;
  insp.doors.forEach((d, i) => {
    const r = itemLines(cl.door, d.answers);
    out.push({
      slot: `door:${d.id}`,
      kind: 'door',
      label: `Door ${i + 1}`,
      lines: withNotes(
        [
          ...typed(L.door.job, jobName),
          ...typed(L.door.number, String(i + 1)),
          { question: L.door.lube, choice: insp.lubricated ? 'Yes' : 'No' },
          ...pick(L.door.maker, d.maker, cl.doorMakers),
          ...typed(L.door.size, d.size),
          ...typed(L.door.age, d.age),
          ...typed(L.door.code, d.springCode),
          ...typed(L.door.cycles, d.springCycles),
          ...r.lines,
        ],
        r.notes,
        L.door.notes,
      ),
    });
    d.motors.forEach((m, j) => {
      const mr = itemLines(cl.motor, m.answers);
      out.push({
        slot: `opener:${m.id}`,
        kind: 'opener',
        label: `Door ${i + 1} opener ${j + 1}`,
        lines: withNotes([...typed(L.opener.job, jobName), ...typed(L.opener.door, String(i + 1)), ...typed(L.opener.number, String(j + 1)), ...pick(L.opener.maker, m.maker, cl.motorMakers), ...typed(L.opener.built, m.built), ...mr.lines], mr.notes, L.opener.notes),
      });
    });
  });
  if (insp.gate) {
    const g = insp.gate;
    const sets = [cl.ul, g.type === 'slide' ? cl.slide : g.type === 'swing' ? cl.swing : [], cl.astm];
    const rs = sets.map((s) => itemLines(s, g.answers));
    out.push({
      slot: 'gate',
      kind: 'gate',
      label: 'Gate',
      lines: withNotes([...typed(L.gate.job, jobName), ...(g.type ? [{ question: L.gate.type, choice: g.type === 'slide' ? 'Slide' : 'Swing' }] : []), ...rs.flatMap((r) => r.lines)], rs.flatMap((r) => r.notes), L.gate.notes),
    });
  }
  return out;
}

/** A short fingerprint of what the surveys hold, so a changed inspection sends again. */
export function surveyKey(inputs: SurveyInput[]): string {
  const s = JSON.stringify(inputs);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${inputs.length}:${(h >>> 0).toString(36)}`;
}

/** Signed inspections (after `since`) whose surveys aren't in Odoo as they are now. */
export function surveysToSend<J extends Pick<Job, 'id' | 'inspection' | 'odooJob'>>(
  jobs: J[],
  signatures: Pick<Signature, 'for' | 'refId' | 'at'>[],
  since: number,
): { job: J & { inspection: Inspection; odooJob: OdooJobRef }; inputs: SurveyInput[]; key: string }[] {
  const out: { job: J & { inspection: Inspection; odooJob: OdooJobRef }; inputs: SurveyInput[]; key: string }[] = [];
  for (const job of jobs) {
    if (!job.inspection || !job.odooJob || job.odooJob.model !== 'fsm.order') continue;
    const signed = Math.max(0, ...signatures.filter((x) => x.for === 'inspection' && x.refId === job.id).map((x) => x.at));
    if (!signed || signed < since) continue;
    const inputs = surveyInputs(job.inspection, job.odooJob.name);
    if (!inputs.length) continue;
    const key = surveyKey(inputs);
    if (job.inspection.surveys?.key === key) continue;
    out.push({ job: job as J & { inspection: Inspection; odooJob: OdooJobRef }, inputs, key });
  }
  return out;
}

export interface SurveyIndex {
  /** Survey id by kind. */
  surveys: Partial<Record<SurveyKind, number>>;
  /** Per survey: question id by title, and answer id by question id and label. */
  questions: Record<number, { byTitle: Map<string, number>; choices: Map<number, Map<string, number>> }>;
}

/** Whether Survey is installed with all three surveys made; null when not (nothing is sent then). */
export async function surveyIndex(client: Caller): Promise<SurveyIndex | null> {
  const st = await surveyState(client);
  if (!st.installed || st.missing.length) return null;
  const idx: SurveyIndex = { surveys: {}, questions: {} };
  for (const f of st.found) {
    idx.surveys[f.kind] = f.id;
    const qs = (await client.call('survey.question', 'search_read', [[['survey_id', '=', f.id]]], { fields: ['title', 'suggested_answer_ids'], limit: 500 })) as { id: number; title?: unknown; suggested_answer_ids?: number[] }[];
    const answerIds = qs.flatMap((q) => q.suggested_answer_ids ?? []);
    const answers = answerIds.length ? ((await client.call('survey.question.answer', 'read', [answerIds], { fields: ['value'] })) as { id: number; value?: unknown }[]) : [];
    const label = new Map(answers.map((a) => [a.id, String(a.value ?? '')]));
    const byTitle = new Map<string, number>();
    const choices = new Map<number, Map<string, number>>();
    for (const q of qs) {
      const t = String(q.title ?? '');
      if (!byTitle.has(t)) byTitle.set(t, q.id);
      choices.set(q.id, new Map((q.suggested_answer_ids ?? []).map((a) => [label.get(a) ?? '', a])));
    }
    idx.questions[f.id] = { byTitle, choices };
  }
  return idx;
}

/** The one2many commands that make a survey's answer lines; answers whose question or choice is gone from Odoo are left out. */
export function lineCommands(idx: SurveyIndex, survey: number, lines: Line[]): unknown[] {
  const q = idx.questions[survey];
  const out: unknown[] = [];
  for (const l of lines) {
    const qid = q?.byTitle.get(l.question);
    if (!qid) continue;
    if (l.choice !== undefined) {
      const a = q.choices.get(qid)?.get(l.choice);
      if (a) out.push([0, 0, { question_id: qid, answer_type: 'suggestion', suggested_answer_id: a, skipped: false }]);
    } else if (l.text !== undefined) {
      const multi = [DEFAULT_NOTES, ...Object.values(checklist().info).map((x) => x.notes)].includes(l.question);
      out.push([0, 0, { question_id: qid, answer_type: multi ? 'text_box' : 'char_box', ...(multi ? { value_text_box: l.text } : { value_char_box: l.text }), skipped: false }]);
    }
  }
  return out;
}

const gone = (e: unknown) => /does not exist|has been deleted|MissingError/i.test(e instanceof Error ? e.message : String(e));

/** Creates or updates each survey; returns the Odoo id of every slot and how many were new. */
export async function sendSurveys(client: Caller, idx: SurveyIndex, inputs: SurveyInput[], existing: Record<string, number>, partnerId: number | undefined): Promise<{ ids: Record<string, number>; created: SurveyInput[] }> {
  const ids: Record<string, number> = {};
  const created: SurveyInput[] = [];
  for (const inp of inputs) {
    const survey = idx.surveys[inp.kind]!;
    const lines = lineCommands(idx, survey, inp.lines);
    const old = existing[inp.slot];
    if (old) {
      try {
        await client.call('survey.user_input', 'write', [[old], { user_input_line_ids: [[5, 0, 0], ...lines] }]);
        ids[inp.slot] = old;
        continue;
      } catch (e) {
        if (!gone(e)) throw e;
      }
    }
    const id = (await client.call('survey.user_input', 'create', [{ survey_id: survey, state: 'done', ...(partnerId ? { partner_id: partnerId } : {}), user_input_line_ids: lines }])) as number;
    ids[inp.slot] = id;
    created.push(inp);
  }
  return { ids, created };
}

/** The chatter note that points to new surveys from the job's order. */
export function surveyNote(created: SurveyInput[], ids: Record<string, number>): string {
  const links = created.map((c) => `<a href="/web#id=${ids[c.slot]}&amp;model=survey.user_input&amp;view_type=form">${c.label}</a>`);
  return `Inspection answers saved as surveys: ${links.join(', ')}.`;
}
