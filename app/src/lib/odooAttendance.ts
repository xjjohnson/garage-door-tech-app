/**
 * Time clock in Odoo: a work day goes to the Attendances app (hr.attendance)
 * as a check in, and the check out when the tech clocks out. Used only when
 * that app is installed here; otherwise the phone keeps the days itself (and
 * its CSV), as before. Only days started after the phone began sending are
 * sent, so old shifts are never bulk-written to Odoo.
 */
import type { OdooClient } from './odoo';
import { toOdooTime } from './odoo';
import type { Shift } from './worklog';

export const ATTENDANCE_SINCE_KEY = 'johnsons.attendanceSync.since';

/** True when Odoo has the Attendances app and this user can use it. */
export async function attendanceReady(client: Pick<OdooClient, 'call'>): Promise<boolean> {
  try {
    const f = (await client.call('hr.attendance', 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;
    return 'employee_id' in f && 'check_in' in f && 'check_out' in f;
  } catch {
    return false;
  }
}

/** The employee record for the signed-in user, or null when there isn't one. */
export async function myEmployee(client: Pick<OdooClient, 'call' | 'session'>): Promise<number | null> {
  const rows = (await client.call('hr.employee', 'search_read', [[['user_id', '=', client.session.uid]]], { fields: ['name'], limit: 1 })) as { id: number }[];
  return rows[0]?.id ?? null;
}

/** Days started since the phone began sending, whose Odoo copy is missing or out of date. */
export function shiftsToSend(shifts: Shift[], since: number): Shift[] {
  return shifts.filter((s) => s.start >= since && (!s.odooAtt || s.odooAtt.start !== s.start || s.odooAtt.end !== s.end));
}

const ALREADY_IN = /already checked in/i;
const MAX_OPEN_MS = 12 * 3600_000;

/**
 * Odoo refuses a new check in while an older one is still open. Finds that open
 * attendance and closes it, then returns its id so the caller can try again.
 * The check out is taken from this phone's own day that started at the same
 * time; without one, it is closed when the new day starts, but never more than
 * 12 hours after it opened. Nothing else in Odoo is touched.
 */
export async function closeStaleOpen(client: Pick<OdooClient, 'call'>, employeeId: number, s: Shift, all: Shift[]): Promise<number | null> {
  const open = (await client.call('hr.attendance', 'search_read', [[['employee_id', '=', employeeId], ['check_out', '=', false]]], { fields: ['check_in'], order: 'check_in asc' })) as { id: number; check_in: string }[];
  let closed: number | null = null;
  for (const a of open) {
    const inMs = Date.parse(`${a.check_in.replace(' ', 'T')}Z`);
    if (!Number.isFinite(inMs) || inMs >= s.start) continue;
    const mine = all.find((x) => x.id !== s.id && Math.abs(x.start - inMs) < 60_000);
    const out = mine?.end !== undefined && mine.end > inMs ? mine.end : Math.min(s.start, inMs + MAX_OPEN_MS);
    await client.call('hr.attendance', 'write', [[a.id], { check_out: toOdooTime(out) }]);
    closed = a.id;
  }
  return closed;
}

/** Creates or updates the day's attendance; returns what Odoo now holds. */
export async function pushShift(client: Pick<OdooClient, 'call'>, employeeId: number, s: Shift, all: Shift[] = []): Promise<NonNullable<Shift['odooAtt']>> {
  const vals = { check_in: toOdooTime(s.start), check_out: s.end !== undefined ? toOdooTime(s.end) : false };
  let id = s.odooAtt?.id;
  if (id) {
    // Odoo's read leaves a deleted record out of its answer: then it is made again.
    const found = (await client.call('hr.attendance', 'read', [[id]], { fields: ['check_in'] })) as unknown[];
    if (!found.length) id = undefined;
  }
  if (id) await client.call('hr.attendance', 'write', [[id], vals]);
  else {
    const create = () => client.call('hr.attendance', 'create', [{ employee_id: employeeId, ...vals }]) as Promise<number>;
    try {
      id = await create();
    } catch (e) {
      if (!(e instanceof Error) || !ALREADY_IN.test(e.message) || (await closeStaleOpen(client, employeeId, s, all)) === null) throw e;
      id = await create();
    }
  }
  return { id, start: s.start, ...(s.end !== undefined ? { end: s.end } : {}) };
}
