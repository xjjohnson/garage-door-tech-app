/**
 * The inspection checklist as Odoo keeps it: the questions of the three
 * Surveys (see odooSurveys.ts), so the owner changes the checklist in Odoo and
 * every phone picks it up. A question whose choices are a known rating scale
 * (Good/Fair/Poor..., Compliant/Non-compliant..., Pass/Fail...) is a checklist
 * item; the others (maker, size, job) are answered from the job and don't count.
 * A question with the same title as a built-in one keeps that item's id, so
 * answers already on jobs still line up. Kept on the phone for offline use.
 * Kept free of React.
 */
import { BUILT_IN_CHECKLIST, Checklist, DEFAULT_INFO, InfoLabels, ItemDef, RATING_LABEL, Rating, Scale, SCALES } from './inspection';
import type { OdooClient } from './odoo';
import { surveyState } from './odooSurveys';

type Caller = Pick<OdooClient, 'call'>;

export const CHECKLIST_STORAGE_KEY = 'odoo-checklist/v1';

const RATING_BY_LABEL = new Map(Object.entries(RATING_LABEL).map(([r, l]) => [l.toLowerCase(), r as Rating]));

/** The scale whose choices these are (in any order), or null for a question that isn't a rating. */
export function scaleOf(labels: string[]): Scale | null {
  const ratings = labels.map((l) => RATING_BY_LABEL.get(l.trim().toLowerCase()));
  if (!ratings.length || ratings.some((r) => !r)) return null;
  const set = new Set(ratings as Rating[]);
  for (const sc of Object.keys(SCALES) as Scale[]) {
    const want = SCALES[sc];
    if (want.length === set.size && want.every((r) => set.has(r))) return sc;
  }
  return null;
}

export interface SurveyQuestion {
  id: number;
  title: string;
  isPage: boolean;
  labels: string[];
  /** Odoo's type for it: "text_box" for the notes. */
  type?: string;
}

/**
 * What the info questions (everything that isn't a rating or a section) are
 * called in a survey. A question named like the built-in one takes that
 * slot; the rest fill the empty slots in the order they come, so renaming
 * works as long as the order stays. A text-box question is the notes.
 */
export function infoFrom<D extends Record<string, string>>(qs: SurveyQuestion[], defaults: D, notesKey: keyof D & string): { labels: D; choices: Map<keyof D & string, string[]> } {
  type K = keyof D & string;
  const slots = Object.keys(defaults) as K[];
  const labels: D = { ...defaults };
  const choices = new Map<K, string[]>();
  const info = qs.filter((q) => !q.isPage && !scaleOf(q.labels));
  const assigned = new Map<K, SurveyQuestion>();
  const rest: SurveyQuestion[] = [];
  for (const q of info) {
    const slot = slots.find((k) => defaults[k] === q.title && !assigned.has(k));
    if (slot) assigned.set(slot, q);
    else rest.push(q);
  }
  const notes = rest.find((q) => q.type === 'text_box');
  if (notes && !assigned.has(notesKey)) assigned.set(notesKey, notes);
  const free = slots.filter((k) => !assigned.has(k));
  for (const q of rest) {
    if (q === notes && assigned.get(notesKey) === q) continue;
    const k = free.shift();
    if (k) assigned.set(k, q);
  }
  for (const [k, q] of assigned) {
    (labels as Record<string, string>)[k] = q.title;
    if (q.labels.length) choices.set(k, q.labels);
  }
  return { labels, choices };
}

const BUILT_BY_TITLE = new Map(Object.values(BUILT_IN_CHECKLIST).flat().map((d) => [d.label, d]));

/** The items a survey's questions make, in order; `part` picks the checklist part from the section the question sits under. */
type Part = 'door' | 'motor' | 'ul' | 'slide' | 'swing' | 'astm';
export function itemsFrom(qs: SurveyQuestion[], part: (section: string) => Part): Partial<Record<Part, ItemDef[]>> {
  const out: Partial<Record<Part, ItemDef[]>> = {};
  let section = '';
  for (const q of qs) {
    if (q.isPage) {
      section = q.title;
      continue;
    }
    const scale = scaleOf(q.labels);
    if (!scale) continue;
    const built = BUILT_BY_TITLE.get(q.title);
    const def: ItemDef = built && built.scale === scale ? built : { id: `q${q.id}`, label: q.title, scale };
    (out[part(section)] ||= []).push(def);
  }
  return out;
}

const gatePart = (section: string): Part => {
  const s = section.toLowerCase();
  return s.includes('slide') ? 'slide' : s.includes('swing') ? 'swing' : s.includes('astm') ? 'astm' : 'ul';
};

/** Reads the checklist from the surveys; null when Survey or any of the three surveys isn't there. */
export async function fetchChecklist(client: Caller): Promise<Checklist | null> {
  const st = await surveyState(client);
  if (!st.installed || st.missing.length) return null;
  const read = async (kind: 'door' | 'opener' | 'gate') => {
    const id = st.found.find((f) => f.kind === kind)!.id;
    const rows = (await client.call('survey.question', 'search_read', [[['survey_id', '=', id]]], { fields: ['title', 'is_page', 'sequence', 'question_type', 'suggested_answer_ids'], order: 'sequence asc, id asc', limit: 500 })) as { id: number; title?: unknown; is_page?: boolean; question_type?: unknown; suggested_answer_ids?: number[] }[];
    const ids = rows.flatMap((r) => r.suggested_answer_ids ?? []);
    const answers = ids.length ? ((await client.call('survey.question.answer', 'read', [ids], { fields: ['value'] })) as { id: number; value?: unknown }[]) : [];
    const label = new Map(answers.map((a) => [a.id, String(a.value ?? '')]));
    return rows.map((r): SurveyQuestion => ({ id: r.id, title: String(r.title ?? ''), isPage: r.is_page === true, type: typeof r.question_type === 'string' ? r.question_type : undefined, labels: (r.suggested_answer_ids ?? []).map((a) => label.get(a) ?? '') }));
  };
  const [door, opener, gate] = [await read('door'), await read('opener'), await read('gate')];
  const d = itemsFrom(door, () => 'door').door ?? [];
  const m = itemsFrom(opener, () => 'motor').motor ?? [];
  const g = itemsFrom(gate, gatePart);
  // A survey with no rating questions (emptied or broken) keeps the built-in part rather than leaving the tech with nothing to check.
  const di = infoFrom(door, DEFAULT_INFO.door, 'notes');
  const oi = infoFrom(opener, DEFAULT_INFO.opener, 'notes');
  const gi = infoFrom(gate, DEFAULT_INFO.gate, 'notes');
  const info: InfoLabels = { door: di.labels, opener: oi.labels, gate: gi.labels };
  return {
    info,
    doorMakers: di.choices.get('maker') ?? BUILT_IN_CHECKLIST.doorMakers,
    motorMakers: oi.choices.get('maker') ?? BUILT_IN_CHECKLIST.motorMakers,
    door: d.length ? d : BUILT_IN_CHECKLIST.door,
    motor: m.length ? m : BUILT_IN_CHECKLIST.motor,
    ul: g.ul ?? BUILT_IN_CHECKLIST.ul,
    slide: g.slide ?? [],
    swing: g.swing ?? [],
    astm: g.astm ?? BUILT_IN_CHECKLIST.astm,
  };
}

export function parseChecklist(raw: string | null): Checklist | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Record<string, unknown>;
    const part = (k: 'door' | 'motor' | 'ul' | 'slide' | 'swing' | 'astm'): ItemDef[] | null => {
      const v = d[k];
      if (!Array.isArray(v)) return null;
      return v.filter((x): x is ItemDef => !!x && typeof x.id === 'string' && typeof x.label === 'string' && x.scale in SCALES);
    };
    const strs = (v: unknown, fallback: string[]) => (Array.isArray(v) && v.length && v.every((x) => typeof x === 'string') ? (v as string[]) : fallback);
    const info = (d.info ?? {}) as { door?: object; opener?: object; gate?: object };
    const c = {
      info: { door: { ...DEFAULT_INFO.door, ...(info.door ?? {}) }, opener: { ...DEFAULT_INFO.opener, ...(info.opener ?? {}) }, gate: { ...DEFAULT_INFO.gate, ...(info.gate ?? {}) } },
      doorMakers: strs(d.doorMakers, BUILT_IN_CHECKLIST.doorMakers),
      motorMakers: strs(d.motorMakers, BUILT_IN_CHECKLIST.motorMakers),
      door: part('door'), motor: part('motor'), ul: part('ul'), slide: part('slide'), swing: part('swing'), astm: part('astm'),
    };
    return Object.values(c).every((v) => v) ? (c as Checklist) : null;
  } catch {
    return null;
  }
}
