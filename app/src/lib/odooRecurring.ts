/**
 * Repeating visits (OCA Field Service Recurring, fsm.recurring) and service
 * agreements (OCA Agreement, agreement) as Odoo holds them, for a customer.
 * Read-only here: Odoo makes each upcoming order itself. Which fields exist
 * differs between versions, so only the ones fields_get lists are read. Kept
 * free of React; the client is passed in.
 */
import type { OdooClient } from './odoo';
import { toOdooTime } from './odoo';
import { locationFor } from './odooJobs';

type Caller = Pick<OdooClient, 'call' | 'session'>;

export interface RepeatRow {
  id: number;
  name: string;
  /** Odoo's state, as a label: Draft, Active, Paused or Closed. */
  status: string;
  active: boolean;
  /** The frequency set's name, such as "Yearly". */
  every?: string;
  start?: string;
  end?: string;
  /** The house the visits are at. */
  place?: string;
  /** The agreement this repeat is under, when Odoo links them. */
  agreementId?: number;
}

export interface AgreementRow {
  id: number;
  name: string;
  code?: string;
  status?: string;
  start?: string;
  end?: string;
  notes?: string;
  active: boolean;
}

const REPEAT_STATE: Record<string, string> = { draft: 'Draft', progress: 'Active', suspend: 'Paused', close: 'Closed' };

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const m2o = (v: unknown): string | undefined => (Array.isArray(v) && typeof v[1] === 'string' ? v[1] : undefined);

async function fieldsOf(c: Caller, model: string): Promise<string[] | null> {
  try {
    const f = (await c.call(model, 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;
    return f && typeof f === 'object' ? Object.keys(f) : null;
  } catch {
    // The app isn't installed, or this user can't see it.
    return null;
  }
}

/** Whether this Odoo has repeating visits and agreements, so the app only offers what works. */
export async function recurringSupport(c: Caller): Promise<{ repeats: boolean; agreements: boolean }> {
  const [r, a] = await Promise.all([fieldsOf(c, 'fsm.recurring'), fieldsOf(c, 'agreement')]);
  return { repeats: !!r && r.includes('location_id'), agreements: !!a && a.includes('partner_id') };
}

/** The repeating visits at this customer's houses. */
export async function fetchRepeats(c: Caller, partnerId: number, limit = 20): Promise<RepeatRow[]> {
  const have = await fieldsOf(c, 'fsm.recurring');
  if (!have || !partnerId) return [];
  const fields = ['name', 'state', 'fsm_frequency_set_id', 'start_date', 'end_date', 'location_id', 'active', 'agreement_id'].filter((f) => have.includes(f));
  const rows = (await c.call('fsm.recurring', 'search_read', [['|', ['location_id.owner_id', 'child_of', partnerId], ['location_id.partner_id', 'child_of', partnerId]]], { fields, order: 'id desc', limit })) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as number,
    name: str(r.name) ?? `#${r.id}`,
    status: REPEAT_STATE[str(r.state) ?? ''] ?? str(r.state) ?? '',
    active: r.active !== false,
    every: m2o(r.fsm_frequency_set_id),
    start: str(r.start_date),
    end: str(r.end_date),
    place: m2o(r.location_id),
    agreementId: Array.isArray(r.agreement_id) && typeof r.agreement_id[0] === 'number' ? r.agreement_id[0] : undefined,
  }));
}

/** The service agreements for this customer. */
export async function fetchAgreements(c: Caller, partnerId: number, limit = 20): Promise<AgreementRow[]> {
  const have = await fieldsOf(c, 'agreement');
  if (!have || !partnerId) return [];
  const fields = ['name', 'code', 'stage_id', 'start_date', 'end_date', 'description', 'active'].filter((f) => have.includes(f));
  const rows = (await c.call('agreement', 'search_read', [[['partner_id', 'child_of', partnerId]]], { fields, order: 'id desc', limit })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: str(r.name) ?? `#${r.id}`, code: str(r.code), status: m2o(r.stage_id), start: str(r.start_date), end: str(r.end_date), notes: str(r.description)?.replace(/<[^>]+>/g, '').trim() || undefined, active: r.active !== false }));
}

// ---- Writing ----

export interface FrequencySet {
  id: number;
  name: string;
}

/** The frequency sets Odoo has, such as "Yearly" or "Every 6 months". */
export async function fetchFrequencySets(c: Caller): Promise<FrequencySet[]> {
  const rows = (await c.call('fsm.frequency.set', 'search_read', [[]], { fields: ['name'], order: 'name asc', limit: 50 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: str(r.name) ?? `#${r.id}` }));
}

/** The visit is made this many days before it is due (Justin: about 30 for a tune-up). */
export const TUNE_UP_DAYS_AHEAD = 30;

/**
 * Odoo's "yearly" frequency set: the one already there named yearly or annual,
 * else a new one that makes each visit about 30 days ahead. Returns its id.
 */
export async function yearlySet(c: Caller): Promise<number> {
  const found = (await c.call('fsm.frequency.set', 'search', [['|', ['name', 'ilike', 'year'], ['name', 'ilike', 'annual']]], { limit: 1 })) as number[];
  if (found[0]) return found[0];
  const have = (await fieldsOf(c, 'fsm.frequency.set')) ?? [];
  const rule = (await fieldsOf(c, 'fsm.frequency')) ?? [];
  if (!have.includes('fsm_frequency_ids') || !rule.includes('interval_type')) throw new Error('Odoo has no yearly frequency to use. In Odoo, Field Service > Configuration > Frequencies, add one that repeats yearly.');
  return (await c.call('fsm.frequency.set', 'create', [
    {
      name: 'Yearly',
      ...(have.includes('buffer_early') ? { buffer_early: TUNE_UP_DAYS_AHEAD } : {}),
      fsm_frequency_ids: [[0, 0, { name: 'Every year', interval_type: 'yearly', ...(rule.includes('interval') ? { interval: 1 } : {}) }]],
    },
  ])) as number;
}

export interface NewRepeat {
  /** The customer's name, for the repeat's label. */
  customer: string;
  /** The house the visits are at; the customer's first location when empty. */
  address: string;
  /** A frequency set, or 'yearly' for the tune-up preset. */
  every: number | 'yearly';
  /** When the first visit is due. */
  start: number;
  /** The kind of visit, in the repeat's name and description. */
  what: string;
}

/**
 * Makes a repeating visit in Odoo and turns it on: Odoo's own scheduled
 * action then creates each upcoming order, which reach the phone as jobs.
 * Returns the repeat's id.
 */
export async function createRepeat(c: Caller, partnerId: number, r: NewRepeat): Promise<number> {
  const set = r.every === 'yearly' ? await yearlySet(c) : r.every;
  const location = await locationFor(c, partnerId, { customer: r.customer, address: r.address });
  const have = (await fieldsOf(c, 'fsm.recurring')) ?? [];
  const vals: Record<string, unknown> = {
    location_id: location,
    fsm_frequency_set_id: set,
    start_date: toOdooTime(r.start),
    ...(have.includes('description') ? { description: `${r.what} (made in the Johnsons app)` } : {}),
  };
  const id = (await c.call('fsm.recurring', 'create', [vals])) as number;
  await setRepeatState(c, id, 'start');
  return id;
}

export type RepeatAction = 'start' | 'pause' | 'stop';

const ACTION: Record<RepeatAction, { method: string; state: string }> = {
  start: { method: 'action_start', state: 'progress' },
  pause: { method: 'action_suspend', state: 'suspend' },
  stop: { method: 'action_cancel', state: 'close' },
};

/** Starts, pauses (and starts again) or stops a repeat, with Odoo's own button when it has one, else by setting its state. */
export async function setRepeatState(c: Caller, id: number, action: RepeatAction): Promise<void> {
  const a = ACTION[action];
  try {
    await c.call('fsm.recurring', a.method, [[id]]);
  } catch {
    await c.call('fsm.recurring', 'write', [[id], { state: a.state }]);
  }
}

export interface NewAgreement {
  name: string;
  notes: string;
  /** When it starts and, when it has an end, when it ends (ms). */
  start: number;
  end?: number;
  /** A repeat that is under it. */
  repeatId?: number;
}

const day = (ms: number) => toOdooTime(ms).slice(0, 10);

/** Links a repeat to an agreement, when Odoo's repeats have that link. */
async function linkRepeat(c: Caller, agreementId: number, repeatId: number): Promise<void> {
  const have = (await fieldsOf(c, 'fsm.recurring')) ?? [];
  if (have.includes('agreement_id')) await c.call('fsm.recurring', 'write', [[repeatId], { agreement_id: agreementId }]);
}

/** A service agreement for a customer in Odoo: a record of the plan, with no billing. Returns its id. */
export async function createAgreement(c: Caller, partnerId: number, a: NewAgreement): Promise<number> {
  const have = (await fieldsOf(c, 'agreement')) ?? [];
  const id = (await c.call('agreement', 'create', [
    {
      name: a.name.trim(),
      partner_id: partnerId,
      start_date: day(a.start),
      ...(a.end ? { end_date: day(a.end) } : {}),
      ...(a.notes.trim() && have.includes('description') ? { description: `<p>${a.notes.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` } : {}),
      ...(have.includes('domain') ? { domain: 'sale' } : {}),
    },
  ])) as number;
  if (a.repeatId) await linkRepeat(c, id, a.repeatId);
  return id;
}

/** Changes an agreement's name and notes. */
export async function editAgreement(c: Caller, id: number, f: { name: string; notes: string }): Promise<void> {
  const have = (await fieldsOf(c, 'agreement')) ?? [];
  await c.call('agreement', 'write', [[id], { name: f.name.trim(), ...(have.includes('description') ? { description: f.notes.trim() ? `<p>${f.notes.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` : false } : {}) }]);
}

/** Ends an agreement today and stops the repeats under it. The record stays in Odoo. */
export async function endAgreement(c: Caller, id: number, now: number, repeatIds: number[] = []): Promise<void> {
  await c.call('agreement', 'write', [[id], { end_date: day(now) }]);
  for (const r of repeatIds) await setRepeatState(c, r, 'stop');
}
