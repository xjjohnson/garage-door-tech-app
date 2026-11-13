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

/** Creates or updates the day's attendance; returns what Odoo now holds. */
export async function pushShift(client: Pick<OdooClient, 'call'>, employeeId: number, s: Shift): Promise<NonNullable<Shift['odooAtt']>> {
  const vals = { check_in: toOdooTime(s.start), check_out: s.end !== undefined ? toOdooTime(s.end) : false };
  let id = s.odooAtt?.id;
  if (id) {
    // Odoo's read leaves a deleted record out of its answer: then it is made again.
    const found = (await client.call('hr.attendance', 'read', [[id]], { fields: ['check_in'] })) as unknown[];
    if (!found.length) id = undefined;
  }
  if (id) await client.call('hr.attendance', 'write', [[id], vals]);
  else id = (await client.call('hr.attendance', 'create', [{ employee_id: employeeId, ...vals }])) as number;
  return { id, start: s.start, ...(s.end !== undefined ? { end: s.end } : {}) };
}
