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
import { BUILT_IN_CHECKLIST, Checklist, ItemDef, RATING_LABEL, Rating, Scale, SCALES } from './inspection';
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
}

const BUILT_BY_TITLE = new Map(Object.values(BUILT_IN_CHECKLIST).flat().map((d) => [d.label, d]));

/** The items a survey's questions make, in order; `part` picks the checklist part from the section the question sits under. */
export function itemsFrom(qs: SurveyQuestion[], part: (section: string) => keyof Checklist): Partial<Record<keyof Checklist, ItemDef[]>> {
  const out: Partial<Record<keyof Checklist, ItemDef[]>> = {};
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

const gatePart = (section: string): keyof Checklist => {
  const s = section.toLowerCase();
  return s.includes('slide') ? 'slide' : s.includes('swing') ? 'swing' : s.includes('astm') ? 'astm' : 'ul';
};

/** Reads the checklist from the surveys; null when Survey or any of the three surveys isn't there. */
export async function fetchChecklist(client: Caller): Promise<Checklist | null> {
  const st = await surveyState(client);
  if (!st.installed || st.missing.length) return null;
  const read = async (kind: 'door' | 'opener' | 'gate') => {
    const id = st.found.find((f) => f.kind === kind)!.id;
    const rows = (await client.call('survey.question', 'search_read', [[['survey_id', '=', id]]], { fields: ['title', 'is_page', 'sequence', 'suggested_answer_ids'], order: 'sequence asc, id asc', limit: 500 })) as { id: number; title?: unknown; is_page?: boolean; suggested_answer_ids?: number[] }[];
    const ids = rows.flatMap((r) => r.suggested_answer_ids ?? []);
    const answers = ids.length ? ((await client.call('survey.question.answer', 'read', [ids], { fields: ['value'] })) as { id: number; value?: unknown }[]) : [];
    const label = new Map(answers.map((a) => [a.id, String(a.value ?? '')]));
    return rows.map((r): SurveyQuestion => ({ id: r.id, title: String(r.title ?? ''), isPage: r.is_page === true, labels: (r.suggested_answer_ids ?? []).map((a) => label.get(a) ?? '') }));
  };
  const [door, opener, gate] = [await read('door'), await read('opener'), await read('gate')];
  const d = itemsFrom(door, () => 'door').door ?? [];
  const m = itemsFrom(opener, () => 'motor').motor ?? [];
  const g = itemsFrom(gate, gatePart);
  // A survey with no rating questions (emptied or broken) keeps the built-in part rather than leaving the tech with nothing to check.
  return {
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
    const part = (k: keyof Checklist): ItemDef[] | null => {
      const v = d[k];
      if (!Array.isArray(v)) return null;
      return v.filter((x): x is ItemDef => !!x && typeof x.id === 'string' && typeof x.label === 'string' && x.scale in SCALES);
    };
    const c = { door: part('door'), motor: part('motor'), ul: part('ul'), slide: part('slide'), swing: part('swing'), astm: part('astm') };
    return Object.values(c).every((v) => v) ? (c as Checklist) : null;
  } catch {
    return null;
  }
}
