/**
 * Jobs made on the phone, kept in Odoo too: each becomes a Field Service
 * order (OCA fsm.order) or, without that app, a Project task. Its visit's
 * time goes to the order's scheduled start, and the order's time and worker,
 * as set by whoever dispatches, come back to the phone's visit. Kept free of
 * React; the client is passed in, so tests use a fake.
 */
import type { OdooPartner } from './customerSync';
import type { CustomerFields } from './customers';
import { phoneKey } from './customers';
import type { Job } from './jobs';
import type { OdooClient, OdooTask } from './odoo';
import { odooTime, toOdooTime } from './odoo';
import type { Appointment } from './schedule';

type Client = Pick<OdooClient, 'call' | 'session'>;

/** When this phone started sending its jobs to Odoo. Jobs saved before then go only when the tech picks them. */
export const JOBS_SINCE_KEY = 'odoo-jobs/since/v1';

const sendable = (j: Job) => j.status === 'open' && !j.odooJob && !!(j.customer.trim() || j.address.trim());

/** Whether the background sync sends this job: saved since sending started, or picked to send. */
export const shouldSend = (j: Job, since: number | null) => sendable(j) && since !== null && (j.savedAt >= since || j.sendToOdoo === true);

/** Open jobs from before sending started that the tech hasn't decided about yet. */
export const olderJobs = (jobs: Job[], since: number | null) => (since === null ? [] : jobs.filter((j) => sendable(j) && j.savedAt < since && j.sendToOdoo === undefined));

/** The line on the Odoo job that says which phone job it is, so a retry finds it instead of making another. */
export const jobMarker = (jobId: string) => `App job ${jobId}`;

/** The Odoo record a phone job is. */
export interface OdooJobRef {
  model: 'fsm.order' | 'project.task';
  id: number;
  /** Odoo's reference, "FSO00012" or the task name. */
  name: string;
}

export interface JobForOdoo {
  /** The phone's job id, written on the order (see jobMarker). */
  jobId: string;
  customer: string;
  address: string;
  phone: string;
  /** "Broken spring", "Tune-up"... */
  what: string;
  notes: string;
}

/** What Odoo says about a job's visit now. */
export interface OdooJobState {
  id: number;
  start?: number;
  minutes?: number;
  /** The worker (OCA) or user (tasks) it's given to; 0 when nobody. */
  personId: number;
  done: boolean;
}

/** The visit's Odoo id for a job sent to Odoo: phone visits take the Odoo job's id, as Odoo's own jobs do. */
export const visitId = (ref: Pick<OdooJobRef, 'id'>) => `odoo-${ref.id}`;

const has = (c: Client, f: string) => c.session.fields.includes(f);

/** Whether this Odoo has somewhere to keep jobs. */
export const canSendJobs = (c: Client) => c.session.kind === 'oca' || c.session.kind === 'task';

/** The Field Service location for a customer: theirs if Odoo has one, otherwise a new one on their contact. */
export async function locationFor(c: Client, partnerId: number, job: Pick<JobForOdoo, 'customer' | 'address'>): Promise<number> {
  const found = (await c.call('fsm.location', 'search', [['|', ['partner_id', '=', partnerId], ['owner_id', '=', partnerId]]], { limit: 1 })) as number[];
  if (found[0]) return found[0];
  try {
    // A location is a contact; this one is the customer's own contact.
    return (await c.call('fsm.location', 'create', [{ partner_id: partnerId, owner_id: partnerId }])) as number;
  } catch {
    // Some versions want a name and make their own contact for the place.
    return (await c.call('fsm.location', 'create', [{ name: job.address.trim() || job.customer.trim() || 'Customer', owner_id: partnerId, street: job.address.trim() || false }])) as number;
  }
}

const visitVals = (c: Client, visit: Pick<Appointment, 'start' | 'minutes'> | undefined): Record<string, unknown> => {
  if (!visit) return {};
  if (c.session.kind === 'oca') {
    return {
      ...(has(c, 'scheduled_date_start') ? { scheduled_date_start: toOdooTime(visit.start) } : {}),
      ...(has(c, 'scheduled_duration') ? { scheduled_duration: visit.minutes / 60 } : {}),
    };
  }
  return has(c, 'planned_date_begin') ? { planned_date_begin: toOdooTime(visit.start) } : {};
};

const describe = (job: JobForOdoo) => [job.what, job.notes.trim(), jobMarker(job.jobId)].filter(Boolean).join('\n');

/**
 * Makes the Odoo job for a phone job. A job with a booked visit is given to
 * this user (it's on their schedule) when they're a worker; one without stays
 * unassigned, for whoever dispatches.
 */
export async function createOdooJob(c: Client, partnerId: number, job: JobForOdoo, visit?: Pick<Appointment, 'start' | 'minutes'>): Promise<OdooJobRef> {
  const s = c.session;
  const found = await findOdooJob(c, job.jobId);
  if (found) return found;
  if (s.kind === 'oca') {
    const location_id = await locationFor(c, partnerId, job);
    const vals: Record<string, unknown> = { location_id, ...visitVals(c, visit) };
    if (has(c, 'description') && describe(job)) vals.description = describe(job);
    if (visit && s.me) vals.person_id = s.me;
    const id = (await c.call('fsm.order', 'create', [vals])) as number;
    const [row] = (await c.call('fsm.order', 'read', [[id]], { fields: ['name'] })) as { name?: string }[];
    return { model: 'fsm.order', id, name: row?.name || `#${id}` };
  }
  if (s.kind === 'task') {
    const name = [job.what || 'Job', job.customer].filter(Boolean).join(' · ');
    const vals: Record<string, unknown> = { name, partner_id: partnerId, ...visitVals(c, visit) };
    if (has(c, 'description')) vals.description = [job.notes.trim(), jobMarker(job.jobId)].filter(Boolean).join('\n');
    if (s.fsm) {
      const [project] = (await c.call('project.project', 'search', [[['is_fsm', '=', true]]], { limit: 1 })) as number[];
      if (project) vals.project_id = project;
    }
    if (visit) vals[s.assignField] = s.assignField === 'user_ids' ? [[6, 0, [s.uid]]] : s.uid;
    const id = (await c.call('project.task', 'create', [vals])) as number;
    return { model: 'project.task', id, name };
  }
  throw new Error('Odoo has no Field Service or Project app to keep jobs in.');
}

/** The Odoo job already made for a phone job, found by its marker line; none when Odoo has no description to search. */
export async function findOdooJob(c: Client, jobId: string): Promise<OdooJobRef | undefined> {
  const model = c.session.kind === 'oca' ? 'fsm.order' : c.session.kind === 'task' ? 'project.task' : null;
  if (!model || !has(c, 'description')) return undefined;
  const rows = (await c.call(model, 'search_read', [[['description', 'ilike', jobMarker(jobId)]]], { fields: ['name'], limit: 1 })) as { id: number; name?: string }[];
  return rows[0] ? { model, id: rows[0].id, name: rows[0].name || `#${rows[0].id}` } : undefined;
}

/**
 * The Odoo contact for a job with no customer record on the phone: one with
 * the same phone number, then one with exactly the same name, before making a new one.
 */
export async function partnerFor(c: Pick<OdooClient, 'partners' | 'createPartner'>, f: CustomerFields, known?: Promise<OdooPartner[]>): Promise<number> {
  const all = await (known ?? c.partners());
  const phone = phoneKey(f.phone);
  const name = f.name.trim().toLowerCase();
  const match = (phone.length >= 7 ? all.find((p) => phoneKey(p.phone) === phone) : undefined) ?? (name ? all.find((p) => p.name.trim().toLowerCase() === name) : undefined);
  return match ? match.id : c.createPartner(f);
}

/** Sends a changed visit time to the Odoo job. */
export async function writeVisit(c: Client, ref: OdooJobRef, visit: Pick<Appointment, 'start' | 'minutes'>): Promise<void> {
  const vals = visitVals(c, visit);
  if (Object.keys(vals).length) await c.call(ref.model, 'write', [[ref.id], vals]);
}

/** Reads the time, worker and done state of Odoo jobs. Ones that are gone are left out. */
export async function readJobStates(c: Client, model: OdooJobRef['model'], ids: number[]): Promise<OdooJobState[]> {
  if (ids.length === 0) return [];
  const s = c.session;
  if (model === 'fsm.order') {
    const fields = ['person_id', ...['scheduled_date_start', 'scheduled_duration', 'stage_id'].filter((f) => has(c, f))];
    const rows = (await c.call('fsm.order', 'read', [ids], { fields })) as Record<string, unknown>[];
    const closed = s.closedStage ? await closedStages(c) : new Set<number>();
    return rows.map((r) => ({
      id: r.id as number,
      ...(odooTime(r.scheduled_date_start) !== undefined ? { start: odooTime(r.scheduled_date_start) } : {}),
      ...(typeof r.scheduled_duration === 'number' && r.scheduled_duration > 0 ? { minutes: Math.round(r.scheduled_duration * 60) } : {}),
      personId: Array.isArray(r.person_id) ? (r.person_id[0] as number) : 0,
      done: Array.isArray(r.stage_id) && closed.has(r.stage_id[0] as number),
    }));
  }
  const fields = [s.assignField, ...['planned_date_begin', 'fsm_done'].filter((f) => has(c, f))];
  const rows = (await c.call('project.task', 'read', [ids], { fields })) as Record<string, unknown>[];
  return rows.map((r) => {
    const who = r[s.assignField];
    // user_ids is a list of ids; user_id is [id, name] or false.
    const ids = s.assignField === 'user_ids' && Array.isArray(who) ? (who as number[]) : Array.isArray(who) ? [who[0] as number] : [];
    return {
      id: r.id as number,
      ...(odooTime(r.planned_date_begin) !== undefined ? { start: odooTime(r.planned_date_begin) } : {}),
      personId: ids.includes(s.uid) ? s.uid : (ids[0] ?? 0),
      done: r.fsm_done === true,
    };
  });
}

async function closedStages(c: Client): Promise<Set<number>> {
  const ids = (await c.call('fsm.stage', 'search', [[['is_closed', '=', true]]])) as number[];
  return new Set(ids);
}

/** Who "me" is for the jobs model: the worker for OCA, the user for tasks. */
export const myId = (c: Client) => (c.session.kind === 'oca' ? c.session.me : c.session.uid);

/**
 * What the phone's visit should become after Odoo was read: its time and
 * length from Odoo, gone from this phone when the job went to someone else,
 * done when Odoo closed it. Null when nothing changes.
 */
export function applyState(visit: Appointment | undefined, state: OdooJobState, me: number, now: number): { keep: Appointment | null } | null {
  if (!visit) return null;
  if (state.personId && me && state.personId !== me) return { keep: null };
  const next: Appointment = {
    ...visit,
    ...(state.start !== undefined ? { start: state.start } : {}),
    ...(state.minutes ? { minutes: state.minutes } : {}),
    ...(state.done && visit.status === 'booked' ? { status: 'done' as const } : {}),
  };
  if (next.start === visit.start && next.minutes === visit.minutes && next.status === visit.status) return null;
  return { keep: { ...next, updatedAt: now, syncedAt: now } };
}

export function parseJobRef(v: unknown): OdooJobRef | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  return (r.model === 'fsm.order' || r.model === 'project.task') && typeof r.id === 'number' ? { model: r.model, id: r.id, name: typeof r.name === 'string' ? r.name : `#${r.id}` } : undefined;
}

/** What a job in Odoo is for, from its notes: the first line that isn't the app's own marker, else its reference. */
export function whatOf(t: Pick<OdooTask, 'name' | 'notes'>): string {
  return t.notes.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('App job ')) ?? t.name;
}

/**
 * The schedule from Odoo: each open job given to me with a time becomes a
 * visit (or moves the one there), and a visit pulled from Odoo whose job is
 * no longer mine and open goes. Visits changed on the phone and not yet sent
 * are left alone, and so are Odoo jobs the phone already has a job for
 * (`linked`, by Odoo id), which the job sync moves itself.
 */
export function pullSchedule(visits: Appointment[], mine: OdooTask[], linked: Set<number>, now: number): { add: Appointment[]; drop: string[] } {
  const add: Appointment[] = [];
  const drop: string[] = [];
  const ids = new Set(mine.map((t) => visitId(t)));
  for (const t of mine) {
    if (t.start === undefined || linked.has(t.id)) continue;
    const v = visits.find((a) => a.id === visitId(t));
    if (v && v.updatedAt > (v.syncedAt ?? 0)) continue;
    const next: Appointment = {
      ...(v ?? { createdAt: now, status: 'booked' as const }),
      id: visitId(t),
      start: t.start,
      minutes: t.minutes ?? v?.minutes ?? 60,
      name: t.customer || v?.name || t.name,
      address: t.address || v?.address || '',
      phone: t.phone || v?.phone || '',
      what: v?.what || whatOf(t),
      odooName: t.name,
      updatedAt: now,
      syncedAt: now,
    };
    if (v && v.start === next.start && v.minutes === next.minutes && v.name === next.name && v.address === next.address && v.phone === next.phone && v.odooName === next.odooName) continue;
    add.push(next);
  }
  for (const v of visits) {
    if (!/^odoo-\d+$/.test(v.id) || ids.has(v.id) || v.status !== 'booked') continue;
    if (v.jobId || v.updatedAt > (v.syncedAt ?? 0)) continue;
    drop.push(v.id);
  }
  return { add, drop };
}
