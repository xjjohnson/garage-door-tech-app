/**
 * Every visit on the schedule is an Odoo job (Field Service order, or a
 * Project task without that app). A visit made on the phone with no job
 * becomes its own order; marking a visit done or cancelled on the phone
 * finishes or cancels that order. Kept free of React; the client is passed in.
 */
import type { OdooClient } from './odoo';
import { addressParts } from './geocode';
import { createOdooJob, jobMarker, myId, OdooJobRef, readJobStates, squashStreet, writeVisit } from './odooJobs';
import type { Appointment } from './schedule';
import { formatTime } from './schedule';

type Client = Pick<OdooClient, 'call' | 'session'>;

const ODOO_VISIT = /^odoo-(\d+)$/;

/** The line on the Odoo order that says which phone visit it is, so a retry finds it instead of making another. */
export const visitMarkerId = (a: Pick<Appointment, 'id'>) => `visit-${a.id}`;

/**
 * Booked visits with no job that Odoo doesn't have yet. Visits booked before
 * sending started stay on the phone (nothing old is bulk-written to Odoo).
 */
export const visitsToCreate = (visits: Appointment[], since: number | null): Appointment[] =>
  since === null ? [] : visits.filter((a) => a.status === 'booked' && !a.jobId && !ODOO_VISIT.test(a.id) && !!a.name.trim() && a.createdAt >= since);

/**
 * Finished or cancelled visits whose change Odoo hasn't been told: the visit
 * is an Odoo job already, and the status changed on the phone after sending started.
 */
export const visitsToClose = (visits: Appointment[], since: number | null): Appointment[] =>
  since === null ? [] : visits.filter((a) => a.status !== 'booked' && ODOO_VISIT.test(a.id) && a.updatedAt > (a.syncedAt ?? 0) && a.updatedAt >= since);

/** Booked visits that are Odoo jobs and have nothing waiting to send: checked against Odoo, to see which jobs were deleted there. */
export const visitsToCheck = (visits: Appointment[]): Appointment[] => visits.filter((a) => a.status === 'booked' && ODOO_VISIT.test(a.id) && a.updatedAt <= (a.syncedAt ?? 0));

/** The Odoo job a visit is, from its id; undefined for a visit Odoo doesn't have. */
export function visitOrder(c: Client, a: Pick<Appointment, 'id' | 'odooName'>): OdooJobRef | undefined {
  const m = ODOO_VISIT.exec(a.id);
  const model = c.session.kind === 'oca' ? 'fsm.order' : c.session.kind === 'task' ? 'project.task' : null;
  return m && model ? { model, id: Number(m[1]), name: a.odooName || `#${m[1]}` } : undefined;
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/**
 * An order already open at this customer's house that the visit can be: one
 * with no time yet, or one set for the same day, that isn't given to someone
 * else. Booking a visit for a job that's already in Odoo then moves that
 * order instead of making a second one. OCA Field Service only.
 */
export async function findOpenOrderAt(c: Client, partnerId: number, a: Pick<Appointment, 'address' | 'start'>): Promise<(OdooJobRef & { start?: number }) | undefined> {
  if (c.session.kind !== 'oca') return undefined;
  const key = squashStreet(addressParts(a.address.trim()).street);
  if (!key) return undefined;
  const locs = (await c.call('fsm.location', 'search_read', [['|', ['partner_id', '=', partnerId], ['owner_id', '=', partnerId]]], { fields: ['name', 'street'], limit: 200 })) as { id: number; name?: unknown; street?: unknown }[];
  const here = locs.filter((l) => [l.street, l.name].some((v) => typeof v === 'string' && squashStreet(v.split(',')[0]) === key)).map((l) => l.id);
  if (!here.length) return undefined;
  const open = c.session.closedStage ? [['stage_id.is_closed', '=', false]] : [];
  const fields = ['name', 'person_id', ...['scheduled_date_start'].filter((f) => c.session.fields.includes(f))];
  const rows = (await c.call('fsm.order', 'search_read', [[['location_id', 'in', here], ...open]], { fields, order: 'id asc', limit: 20 })) as Record<string, unknown>[];
  const me = myId(c);
  for (const r of rows) {
    const who = Array.isArray(r.person_id) ? (r.person_id[0] as number) : 0;
    if (who && who !== me) continue;
    const t = typeof r.scheduled_date_start === 'string' ? Date.parse(`${r.scheduled_date_start.replace(' ', 'T')}Z`) : NaN;
    if (Number.isFinite(t) && !sameDay(t, a.start)) continue;
    return { model: 'fsm.order', id: r.id as number, name: typeof r.name === 'string' ? r.name : `#${r.id}` };
  }
  return undefined;
}

/** Puts the visit's time and me on an existing order, and the visit's marker in its description so a retry finds it. */
async function attachVisit(c: Client, ref: OdooJobRef, a: Pick<Appointment, 'id' | 'start' | 'minutes'>): Promise<void> {
  await writeVisit(c, ref, a);
  const me = myId(c);
  const vals: Record<string, unknown> = me ? { person_id: me } : {};
  if (c.session.fields.includes('description')) {
    const [row] = (await c.call(ref.model, 'read', [[ref.id]], { fields: ['description'] })) as { description?: unknown }[];
    const text = typeof row?.description === 'string' ? row.description : '';
    if (!text.includes(jobMarker(visitMarkerId(a)))) vals.description = [text.replace(/<[^>]+>/g, '').trim(), jobMarker(visitMarkerId(a))].filter(Boolean).join('\n');
  }
  if (Object.keys(vals).length) await c.call(ref.model, 'write', [[ref.id], vals]);
}

/** The Odoo job a visit with no job becomes: an open order at the same house when there is one, else a new order. */
export async function createVisitOrder(c: Client, partnerId: number, a: Pick<Appointment, 'id' | 'name' | 'address' | 'phone' | 'what' | 'start' | 'minutes'>): Promise<OdooJobRef> {
  const existing = await findOpenOrderAt(c, partnerId, a);
  if (existing) {
    await attachVisit(c, existing, a);
    return { model: existing.model, id: existing.id, name: existing.name };
  }
  return createOdooJob(c, partnerId, { jobId: visitMarkerId(a), customer: a.name, address: a.address, phone: a.phone, what: a.what, notes: '' }, a);
}

async function note(c: Client, ref: OdooJobRef, body: string): Promise<void> {
  try {
    await c.call(ref.model, 'message_post', [[ref.id]], { body, message_type: 'comment', subtype_xmlid: 'mail.mt_note' });
  } catch {
    // No chatter on this model: the stage change still went through.
  }
}

/** The Field Service stage named Cancelled, if Odoo has one. */
async function cancelledStage(c: Client): Promise<number | undefined> {
  const find = async (domain: unknown[]) => ((await c.call('fsm.stage', 'search', [domain], { limit: 1 })) as number[])[0];
  try {
    return await find([['name', 'ilike', 'cancel'], ['stage_type', '=', 'order']]);
  } catch {
    return find([['name', 'ilike', 'cancel']]).catch(() => undefined);
  }
}

/**
 * Tells Odoo a visit is done (the order is completed the way Odoo's own
 * button does) or cancelled (the order moves to its Cancelled stage). A job
 * already finished or deleted in Odoo is left alone. Returns false when
 * Odoo has no way to cancel it, so the note says so and the tech can do it there.
 */
export async function pushVisitStatus(c: Client & { markDone?: (id: number) => Promise<void> }, ref: OdooJobRef, a: Pick<Appointment, 'status' | 'start'>): Promise<boolean> {
  const [state] = await readJobStates(c, ref.model, [ref.id]);
  if (!state || state.deleted || state.done) return true;
  if (a.status === 'done') {
    if (!c.markDone) return false;
    await c.markDone(ref.id);
    await note(c, ref, `Visit at ${formatTime(a.start)} marked done on the phone (from the app)`);
    return true;
  }
  if (a.status !== 'cancelled') return true;
  if (ref.model === 'fsm.order') {
    const stage = await cancelledStage(c);
    if (stage) {
      await c.call('fsm.order', 'write', [[ref.id], { stage_id: stage }]);
      await note(c, ref, `Visit at ${formatTime(a.start)} cancelled on the phone (from the app)`);
      return true;
    }
  } else {
    try {
      await c.call('project.task', 'write', [[ref.id], { state: '1_canceled' }]);
      await note(c, ref, `Visit at ${formatTime(a.start)} cancelled on the phone (from the app)`);
      return true;
    } catch {
      // This Odoo's tasks have no cancelled state.
    }
  }
  await note(c, ref, `Visit at ${formatTime(a.start)} cancelled on the phone. Odoo has no Cancelled stage to move it to, so cancel it here (from the app).`);
  return false;
}
