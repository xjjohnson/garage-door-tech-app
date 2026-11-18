/**
 * Maintenance plans: named offers ("Yearly tune-up", "Twice-a-year service")
 * that management sets up and a tech adds to a ticket. Each plan is one Odoo
 * agreement (OCA Agreement) kept as a template, so every phone reads the same
 * list. The agreement's name is the plan's name and Odoo's archive flag is
 * the Active switch. The schedule, price and the rest have no matching Odoo
 * fields, so they live as one JSON line in the agreement's notes, after a
 * fixed marker, or, when this Odoo's agreements have no notes field, in a
 * small JSON file attached to the agreement. Kept free of React; the client is passed in.
 */
import { agreementCode } from './odooRecurring';
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call' | 'session'>;

export const PLANS_STORAGE_KEY = 'maintenance-plans/v1';
/** The text the notes line starts with; what makes an agreement a plan. */
export const PLAN_MARKER = 'johnsons-plan:';

export type PlanAudience = 'all' | 'homes' | 'commercial';

export interface MaintenancePlan {
  /** The agreement's id in Odoo; absent for a new plan. */
  id?: number;
  name: string;
  /** What the customer is told is included. */
  description: string;
  /** A visit every this many months (3, 6, 12 or custom). */
  everyMonths: number;
  /** Visits in each year of the plan. */
  visitsPerYear: number;
  /** The visit is made this many days before it is due. */
  daysAhead: number;
  /** The Field Service job type (fsm.template) the visits use; none uses Odoo's default. */
  jobTypeId?: number;
  jobTypeName?: string;
  /** Months the plan runs; 0 for ongoing. */
  termMonths: number;
  /** Whether the plan is set up again at the end of its term. */
  renews: boolean;
  /** The fee in cents; 0 for no charge (record only). */
  priceCents: number;
  /** Text lines such as "Priority scheduling". Nothing computed. */
  perks: string[];
  audience: PlanAudience;
  sort: number;
  /** Days before the end that the renewal notice shows. */
  noticeDays: number;
  active: boolean;
}

export const DEFAULT_DAYS_AHEAD = 30;
export const DEFAULT_NOTICE_DAYS = 30;

export const blankPlan = (): MaintenancePlan => ({
  name: '',
  description: '',
  everyMonths: 12,
  visitsPerYear: 1,
  daysAhead: DEFAULT_DAYS_AHEAD,
  termMonths: 12,
  renews: false,
  priceCents: 0,
  perks: [],
  audience: 'all',
  sort: 0,
  noticeDays: DEFAULT_NOTICE_DAYS,
  active: true,
});

/** The three plans "Add starter plans" makes. Prices are left blank for the owner. */
export const STARTER_PLANS: MaintenancePlan[] = [
  { ...blankPlan(), name: 'Yearly tune-up', description: 'One tune-up visit a year: safety check, lubrication and adjustment of the door and opener.', everyMonths: 12, visitsPerYear: 1, termMonths: 12, sort: 1 },
  { ...blankPlan(), name: 'Twice-a-year service', description: 'A tune-up visit every six months.', everyMonths: 6, visitsPerYear: 2, termMonths: 12, audience: 'homes', sort: 2 },
  { ...blankPlan(), name: 'Commercial / Property manager plan', description: 'A tune-up visit every six months for commercial doors and managed properties.', everyMonths: 6, visitsPerYear: 2, termMonths: 12, audience: 'commercial', sort: 3 },
];

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const whole = (v: unknown, d: number, min = 0) => Math.max(min, Math.round(num(v, d)));

/** The notes Odoo shows: a readable summary, then the marker line the app reads back. */
function planData(p: MaintenancePlan) {
  return {
    description: p.description.trim(),
    everyMonths: p.everyMonths,
    visitsPerYear: p.visitsPerYear,
    daysAhead: p.daysAhead,
    ...(p.jobTypeId ? { jobTypeId: p.jobTypeId, jobTypeName: p.jobTypeName } : {}),
    termMonths: p.termMonths,
    renews: p.renews,
    priceCents: p.priceCents,
    perks: p.perks,
    audience: p.audience,
    sort: p.sort,
    noticeDays: p.noticeDays,
  };
}

export function planNotes(p: MaintenancePlan): string {
  const data = planData(p);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const summary = [p.description.trim(), ...p.perks.map((x) => `- ${x}`)].filter(Boolean).join('\n');
  return `${summary ? `<p>${esc(summary).replace(/\n/g, '<br/>')}</p>` : ''}<p>${PLAN_MARKER}${esc(JSON.stringify(data))}</p>`;
}

/** Reads a plan back from an agreement's notes; undefined when it isn't one of ours. */
export function parsePlanNotes(html: unknown): Partial<MaintenancePlan> | undefined {
  const text = str(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  const at = text.indexOf(PLAN_MARKER);
  if (at < 0) return undefined;
  return parsePlanJson(text.slice(at + PLAN_MARKER.length).split('\n')[0].trim());
}

/** Reads a plan's settings from their JSON text; undefined when it isn't valid. */
export function parsePlanJson(line: string): Partial<MaintenancePlan> | undefined {
  try {
    const d = JSON.parse(line) as Record<string, unknown>;
    if (!d || typeof d !== 'object') return undefined;
    const audience: PlanAudience = d.audience === 'homes' || d.audience === 'commercial' ? d.audience : 'all';
    return {
      description: str(d.description),
      everyMonths: whole(d.everyMonths, 12, 1),
      visitsPerYear: whole(d.visitsPerYear, 1, 1),
      daysAhead: whole(d.daysAhead, DEFAULT_DAYS_AHEAD),
      ...(typeof d.jobTypeId === 'number' && d.jobTypeId > 0 ? { jobTypeId: d.jobTypeId, jobTypeName: str(d.jobTypeName) || undefined } : {}),
      termMonths: whole(d.termMonths, 12),
      renews: d.renews === true,
      priceCents: whole(d.priceCents, 0),
      perks: Array.isArray(d.perks) ? d.perks.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [],
      audience,
      sort: whole(d.sort, 0),
      noticeDays: whole(d.noticeDays, DEFAULT_NOTICE_DAYS),
    };
  } catch {
    return undefined;
  }
}

/** A plan from an agreement row, or undefined when the row isn't a maintenance plan. */
export function toPlan(r: Record<string, unknown>): MaintenancePlan | undefined {
  const data = parsePlanNotes(r.description);
  const name = str(r.name).trim();
  if (!data || !name || typeof r.id !== 'number') return undefined;
  return { ...blankPlan(), ...data, id: r.id, name, active: r.active !== false };
}

/** Plans in the order management set, then by name. */
export const sortPlans = (list: MaintenancePlan[]) => [...list].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

interface AgreementInfo {
  have: string[];
  /** The field the plan's notes are kept in: description where there is one, else the first notes-like text field. When this Odoo has none, the plan is kept in a small file attached to the agreement. */
  textField?: string;
  /** Whether that field is HTML (else plain text). */
  html: boolean;
}

const TEXT_FIELDS = ['description', 'notes', 'special_terms'];

async function agreementInfo(c: Client): Promise<AgreementInfo | null> {
  let f: Record<string, unknown>;
  try {
    f = (await c.call('agreement', 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!f || typeof f !== 'object') return null;
  const have = Object.keys(f);
  const kind = (n: string) => (f[n] && typeof f[n] === 'object' ? str((f[n] as { type?: unknown }).type) : '');
  const isText = (n: string) => ['text', 'html', ''].includes(kind(n));
  const textField = TEXT_FIELDS.find((n) => have.includes(n) && isText(n)) ?? have.find((n) => /desc|note|term/i.test(n) && ['text', 'html'].includes(kind(n)));
  return { have, textField, html: !!textField && kind(textField) !== 'text' };
}

async function agreementFields(c: Client): Promise<string[] | null> {
  return (await agreementInfo(c))?.have ?? null;
}

/** Why plans can't be kept in this Odoo's agreements, in plain words; null when they can. */
export async function plansProblem(c: Client): Promise<string | null> {
  const info = await agreementInfo(c);
  if (!info) return "Maintenance plans need the Agreement app in Odoo, and this Odoo doesn't have it (or this user can't see it).";
  if (!info.have.includes('name')) return "Maintenance plans need the Agreement app in Odoo, and it doesn't look installed.";
  return null;
}

/** Whether this Odoo has an Agreement model plans can be kept in. */
export async function plansSupported(c: Client): Promise<boolean> {
  return (await plansProblem(c)) === null;
}

/** The settings file kept on a plan's agreement when the agreement has no notes field. */
export const PLAN_FILE = 'johnsons-plan.json';

const toB64 = (t: string) => btoa(unescape(encodeURIComponent(t)));
const fromB64 = (b: string) => decodeURIComponent(escape(atob(b)));

async function saveFile(c: Client, id: number, p: MaintenancePlan): Promise<void> {
  const datas = toB64(JSON.stringify(planData(p)));
  const found = (await c.call('ir.attachment', 'search_read', [[['res_model', '=', 'agreement'], ['res_id', '=', id], ['name', '=', PLAN_FILE]]], { fields: ['id'], limit: 1 })) as { id: number }[];
  if (found[0]) await c.call('ir.attachment', 'write', [[found[0].id], { datas }]);
  else await c.call('ir.attachment', 'create', [{ name: PLAN_FILE, type: 'binary', datas, res_model: 'agreement', res_id: id, mimetype: 'application/json' }]);
}

/** A plan's notes as the agreement field wants them: HTML, or plain text for a text field. */
function notesFor(p: MaintenancePlan, html: boolean): string {
  const h = planNotes(p);
  if (html) return h;
  return h
    .replace(/<\/p><p>/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * The plans in Odoo. Archived ones come too when asked, so management can bring one back.
 * A plan is an agreement with no customer whose notes carry the marker.
 */
export async function fetchPlans(c: Client, opts: { includeArchived?: boolean } = {}): Promise<MaintenancePlan[]> {
  const info = await agreementInfo(c);
  if (!info || !info.have.includes('name')) return [];
  const { have, textField } = info;
  if (!textField) return fetchFilePlans(c, have, opts);
  const domain: unknown[] = [[textField, 'ilike', PLAN_MARKER]];
  if (have.includes('is_template')) domain.push(['is_template', '=', true]);
  if (have.includes('active') && opts.includeArchived) domain.push(['active', 'in', [true, false]]);
  const fields = ['name', textField, ...(have.includes('active') ? ['active'] : [])];
  const rows = (await c.call('agreement', 'search_read', [domain], { fields, order: 'name asc', limit: 200 })) as Record<string, unknown>[];
  return sortPlans(rows.flatMap((r) => toPlan({ ...r, description: r[textField] }) ?? []));
}

/** Plans kept as a file on the agreement: the files name the agreements, which give the name and archive state. */
async function fetchFilePlans(c: Client, have: string[], opts: { includeArchived?: boolean }): Promise<MaintenancePlan[]> {
  const files = (await c.call('ir.attachment', 'search_read', [[['res_model', '=', 'agreement'], ['name', '=', PLAN_FILE]]], { fields: ['res_id', 'datas'], order: 'id desc', limit: 400 })) as { res_id?: number; datas?: string | false }[];
  const byId = new Map<number, string>();
  for (const f of files) if (typeof f.res_id === 'number' && typeof f.datas === 'string' && !byId.has(f.res_id)) byId.set(f.res_id, f.datas);
  if (!byId.size) return [];
  const domain: unknown[] = [['id', 'in', [...byId.keys()]]];
  if (have.includes('active') && opts.includeArchived) domain.push(['active', 'in', [true, false]]);
  const rows = (await c.call('agreement', 'search_read', [domain], { fields: ['name', ...(have.includes('active') ? ['active'] : [])], limit: 200 })) as Record<string, unknown>[];
  return sortPlans(
    rows.flatMap((r) => {
      let data: Partial<MaintenancePlan> | undefined;
      try {
        data = parsePlanJson(fromB64(byId.get(r.id as number) ?? ''));
      } catch {
        data = undefined;
      }
      const name = str(r.name).trim();
      return data && name && typeof r.id === 'number' ? [{ ...blankPlan(), ...data, id: r.id, name, active: r.active !== false }] : [];
    }),
  );
}

/** Creates or updates a plan in Odoo; returns its agreement id. */
export async function savePlan(c: Client, p: MaintenancePlan, now = Date.now()): Promise<number> {
  const name = p.name.trim();
  if (!name) throw new Error('Give the plan a name.');
  if (p.everyMonths < 1) throw new Error('Set how many months between visits.');
  if (p.visitsPerYear < 1) throw new Error('Set at least one visit a year.');
  const info = await agreementInfo(c);
  if (!info || !info.have.includes('name')) throw new Error((await plansProblem(c)) ?? 'Maintenance plans need the Agreement app in Odoo.');
  const { have } = info;
  const vals: Record<string, unknown> = {
    name,
    ...(info.textField ? { [info.textField]: notesFor({ ...p, name }, info.html) } : {}),
    ...(have.includes('is_template') ? { is_template: true } : {}),
    ...(have.includes('active') ? { active: p.active } : {}),
  };
  if (p.id) {
    await c.call('agreement', 'write', [[p.id], vals]);
    if (!info.textField) await saveFile(c, p.id, { ...p, name });
    return p.id;
  }
  const id = (await c.call('agreement', 'create', [
    {
      ...vals,
      ...(have.includes('code') ? { code: await agreementCode(c, now) } : {}),
      ...(have.includes('domain') ? { domain: 'sale' } : {}),
    },
  ])) as number;
  if (!info.textField) await saveFile(c, id, { ...p, name });
  return id;
}

/** Hides a plan: archived in Odoo, so customers already on it keep their agreement. */
export async function archivePlan(c: Client, id: number): Promise<void> {
  const have = await agreementFields(c);
  if (!have?.includes('active')) throw new Error("This Odoo can't archive agreements. Remove the plan in Odoo.");
  await c.call('agreement', 'write', [[id], { active: false }]);
}

/** Makes the three starter plans. Does nothing for a name that already exists. */
export async function addStarterPlans(c: Client, now = Date.now()): Promise<number> {
  const existing = (await fetchPlans(c, { includeArchived: true })).map((p) => p.name.toLowerCase());
  let made = 0;
  for (const p of STARTER_PLANS) {
    if (existing.includes(p.name.toLowerCase())) continue;
    await savePlan(c, p, now);
    made += 1;
  }
  return made;
}

/** Plans a customer can be offered: active ones that fit a home or a commercial customer. */
export function plansFor(list: MaintenancePlan[], commercial: boolean): MaintenancePlan[] {
  return sortPlans(list.filter((p) => p.active && (p.audience === 'all' || (commercial ? p.audience === 'commercial' : p.audience === 'homes'))));
}

export const planPriceText = (p: Pick<MaintenancePlan, 'priceCents'>) => (p.priceCents > 0 ? `$${(p.priceCents / 100).toFixed(2).replace(/\.00$/, '')}` : 'No charge');

/** "Every 6 months, 2 visits a year, 12 months" for a list row. */
export function planSummary(p: MaintenancePlan): string {
  const every = p.everyMonths === 12 ? 'Every year' : p.everyMonths === 1 ? 'Every month' : `Every ${p.everyMonths} months`;
  const term = p.termMonths === 0 ? 'ongoing' : p.termMonths % 12 === 0 ? `${p.termMonths / 12} year${p.termMonths === 12 ? '' : 's'}` : `${p.termMonths} months`;
  return [every, planPriceText(p), term].join(' · ');
}

export function parseSavedPlans(raw: string | null): MaintenancePlan[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.filter((p): p is MaintenancePlan => !!p && typeof p.name === 'string' && typeof p.id === 'number') : [];
  } catch {
    return [];
  }
}
