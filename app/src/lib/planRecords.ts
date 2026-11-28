/**
 * A customer's maintenance plans as Odoo holds them: the agreement the plan
 * made, the repeating visits under it, and how near its end it is. Used by the
 * customer page (change, pause, cancel, renew) and by Follow-ups (plans about
 * to end). Kept free of React; the client is passed in.
 */
import { currentFlavor } from '../flavor';
import { DAY } from './followups';
import type { MaintenancePlan } from './maintenancePlans';
import type { OdooClient } from './odoo';
import { todoType } from './odooFollowUps';
import { AgreementRow, RepeatRow } from './odooRecurring';

type Client = Pick<OdooClient, 'call' | 'session'>;

/** What the notes of an agreement made by the app start with. */
export const PLAN_AGREEMENT_PREFIX = 'Maintenance plan:';

export type PlanStatus = 'Active' | 'Paused' | 'Ending soon' | 'Ended';

export interface PlanRecord {
  agreementId: number;
  name: string;
  /** The plan (template) it was made from, when it can be told. */
  planId?: number;
  start?: string;
  end?: string;
  status: PlanStatus;
  /** Days until the end (negative once ended); undefined for no end. */
  daysLeft?: number;
  repeats: RepeatRow[];
}

const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);

/** The plan this agreement was made from: "Plan #12" in its notes, else the plan with its name. */
export function planOf(a: Pick<AgreementRow, 'name' | 'notes'>, plans: Pick<MaintenancePlan, 'id' | 'name'>[]): number | undefined {
  const m = /Plan #(\d+)/.exec(a.notes ?? '');
  if (m) return Number(m[1]);
  return plans.find((p) => p.name.toLowerCase() === a.name.toLowerCase())?.id;
}

/** Whether an agreement is a maintenance plan: made by the app for a plan, or named for one. */
export const isPlanAgreement = (a: Pick<AgreementRow, 'name' | 'notes'>, plans: Pick<MaintenancePlan, 'name'>[]) =>
  (a.notes ?? '').startsWith(PLAN_AGREEMENT_PREFIX) || plans.some((p) => p.name.toLowerCase() === a.name.toLowerCase());

/** The customer's plans: their plan agreements that are still on, newest first, with where each stands today. */
export function planRecords(agreements: AgreementRow[], repeats: RepeatRow[], plans: MaintenancePlan[], today: string): PlanRecord[] {
  const t = dayNumber(today);
  return agreements
    .filter((a) => a.active && isPlanAgreement(a, plans))
    .map((a): PlanRecord => {
      const planId = planOf(a, plans);
      const mine = repeats.filter((r) => r.agreementId === a.id);
      const daysLeft = a.end ? dayNumber(a.end) - t : undefined;
      const notice = plans.find((p) => p.id === planId)?.noticeDays ?? 30;
      const live = mine.filter((r) => r.status === 'Active' || r.status === 'Paused');
      const status: PlanStatus = daysLeft !== undefined && daysLeft < 0 ? 'Ended' : live.length > 0 && live.every((r) => r.status === 'Paused') ? 'Paused' : daysLeft !== undefined && daysLeft <= notice ? 'Ending soon' : 'Active';
      return { agreementId: a.id, name: a.name, planId, start: a.start, end: a.end, status, daysLeft, repeats: mine };
    })
    .sort((a, b) => b.agreementId - a.agreementId);
}

/** "Ends in 12 days", "Ended 3 days ago". */
export function endText(daysLeft: number | undefined): string {
  if (daysLeft === undefined) return 'No end date';
  if (daysLeft === 0) return 'Ends today';
  const n = Math.abs(daysLeft);
  const d = `${n} day${n === 1 ? '' : 's'}`;
  return daysLeft > 0 ? `Ends in ${d}` : `Ended ${d} ago`;
}

export interface PlanVisits {
  done: number;
  /** The next visit's date (ISO), from a job already made or else when the repeat starts. */
  next?: string;
}

/** Visits done and the next one for the repeats under a plan. Only fields this Odoo has are read. */
export async function planVisits(c: Client, repeats: RepeatRow[], today: string): Promise<PlanVisits> {
  const ids = repeats.map((r) => r.id);
  const fromRepeat = repeats.map((r) => r.start?.slice(0, 10)).filter((d): d is string => !!d && d >= today).sort()[0];
  if (!ids.length) return { done: 0, next: fromRepeat };
  try {
    const have = Object.keys((await c.call('fsm.order', 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>);
    if (!have.includes('fsm_recurring_id')) return { done: 0, next: fromRepeat };
    const fields = ['scheduled_date_start', 'stage_id', ...(have.includes('is_closed') ? ['is_closed'] : [])].filter((f) => f === 'stage_id' || have.includes(f));
    const rows = (await c.call('fsm.order', 'search_read', [[['fsm_recurring_id', 'in', ids]]], { fields, limit: 200 })) as Record<string, unknown>[];
    let done = 0;
    let next: string | undefined;
    for (const r of rows) {
      const stage = Array.isArray(r.stage_id) && typeof r.stage_id[1] === 'string' ? r.stage_id[1] : '';
      const closed = r.is_closed === true || /complete|done/i.test(stage);
      if (closed) {
        done += 1;
        continue;
      }
      const d = typeof r.scheduled_date_start === 'string' ? r.scheduled_date_start.slice(0, 10) : undefined;
      if (d && d >= today && (!next || d < next)) next = d;
    }
    return { done, next: next ?? fromRepeat };
  } catch {
    return { done: 0, next: fromRepeat };
  }
}

export interface RenewalRow extends PlanRecord {
  partnerId: number;
  customer: string;
}

/** Plan agreements, across customers, that end between `from` and `to` (ISO days): the ones to renew. */
export async function fetchPlanRenewals(c: Client, plans: MaintenancePlan[], from: string, to: string, limit = 100): Promise<RenewalRow[]> {
  let have: string[];
  try {
    have = Object.keys((await c.call('agreement', 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>);
  } catch {
    return [];
  }
  if (!have.includes('end_date') || !have.includes('partner_id') || !have.includes('description')) return [];
  const rows = (await c.call('agreement', 'search_read', [[['partner_id', '!=', false], ['end_date', '>=', from], ['end_date', '<=', to]]], {
    fields: ['name', 'partner_id', 'start_date', 'end_date', 'description', ...(have.includes('active') ? ['active'] : [])],
    order: 'end_date asc',
    limit,
  })) as Record<string, unknown>[];
  const agreements = rows.map((r): AgreementRow & { partnerId: number; customer: string } => ({
    id: r.id as number,
    name: typeof r.name === 'string' ? r.name : `#${r.id}`,
    start: typeof r.start_date === 'string' ? r.start_date : undefined,
    end: typeof r.end_date === 'string' ? r.end_date : undefined,
    notes: typeof r.description === 'string' ? r.description.replace(/<[^>]+>/g, '').trim() : undefined,
    active: r.active !== false,
    partnerId: Array.isArray(r.partner_id) ? (r.partner_id[0] as number) : 0,
    customer: Array.isArray(r.partner_id) && typeof r.partner_id[1] === 'string' ? r.partner_id[1] : 'Customer',
  }));
  const today = from;
  const found = agreements.flatMap((a) => {
    const [rec] = planRecords([a], [], plans, today);
    return rec && a.partnerId ? [{ ...rec, partnerId: a.partnerId, customer: a.customer }] : [];
  });
  if (found.length === 0) return [];
  // A plan already renewed (the same customer has a later agreement for it) is not asked about again.
  const pids = [...new Set(found.map((f) => f.partnerId))];
  const later = (await c.call('agreement', 'search_read', [[['partner_id', 'in', pids], '|', ['end_date', '=', false], ['end_date', '>', to]]], { fields: ['name', 'partner_id'], limit: 500 }).catch(() => [])) as Record<string, unknown>[];
  const renewed = new Set(later.map((r) => `${Array.isArray(r.partner_id) ? r.partner_id[0] : 0}:${String(r.name).toLowerCase()}`));
  return found.filter((f) => !renewed.has(`${f.partnerId}:${f.name.toLowerCase()}`));
}

const marker = (agreementId: number, end: string) => `johnsons-plan-renewal:${agreementId}:${end}`;

/**
 * The to-do on the customer for a plan that is about to end (or just ended):
 * the one already in Odoo (found by its marker), else a new one due the day the
 * plan ends. Returns the activity's id.
 */
export async function ensureRenewalTodo(c: Client, partnerId: number, r: { agreementId: number; name: string; end: string; customer: string }): Promise<number> {
  const mark = marker(r.agreementId, r.end);
  const found = (await c.call('mail.activity', 'search', [[['res_model', '=', 'res.partner'], ['res_id', '=', partnerId], ['note', 'ilike', mark]]], { limit: 1 })) as number[];
  if (found[0]) return found[0];
  const [model] = (await c.call('ir.model', 'search', [[['model', '=', 'res.partner']]], { limit: 1 })) as number[];
  if (!model) throw new Error('Odoo has no contact model to put the to-do on.');
  const type = await todoType(c);
  const note = `<p>${r.name} ends ${r.end}. Call or text ${r.customer} about renewing it, then renew it in the ${currentFlavor().appName} app.</p><p><small>${mark}</small></p>`;
  return (await c.call('mail.activity', 'create', [
    { res_model_id: model, res_id: partnerId, summary: `Renew ${r.name}`, note, date_deadline: r.end, user_id: c.session.uid, ...(type ? { activity_type_id: type } : {}) },
  ])) as number;
}

