/**
 * The People tab in Office: who is clocked in and how many hours each person has this week,
 * read from Odoo's Attendances app (the same hr.attendance the time clock writes). Reads only.
 * Kept free of React.
 */
import type { OdooClient } from './odoo';
import { odooTime, toOdooTime } from './odoo';

type Client = Pick<OdooClient, 'call'>;
type Row = Record<string, unknown>;

const HOUR = 3_600_000;
const DAY = 86_400_000;

export interface Person {
  id: number;
  name: string;
  job: string;
}
export interface Punch {
  employeeId: number;
  start: number;
  /** Undefined while the person is still clocked in. */
  end?: number;
}

export interface PersonHours {
  person: Person;
  /** Clocked in right now. */
  in: boolean;
  /** When today's open shift started. */
  since?: number;
  /** Hours for each day from the start of the week, Monday first. */
  days: number[];
  hours: number;
}

/** Midnight at the start of the week (Monday) that holds `now`. */
export function weekStart(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const back = (d.getDay() + 6) % 7;
  return d.getTime() - back * DAY;
}

/**
 * Splits punches into hours per day for one week and marks who is clocked in. A shift still open
 * counts up to `now`. Hours of a shift that crosses midnight go to the day it started.
 */
export function summarizeHours(people: Person[], punches: Punch[], start: number, now: number): PersonHours[] {
  return people.map((person) => {
    const days = [0, 0, 0, 0, 0, 0, 0];
    let open: Punch | undefined;
    for (const p of punches) {
      if (p.employeeId !== person.id) continue;
      const end = p.end ?? now;
      if (p.end === undefined) open = p;
      const idx = Math.floor((p.start - start) / DAY);
      if (idx >= 0 && idx < 7 && end > p.start) days[idx] += (end - p.start) / HOUR;
    }
    const round = (n: number) => Math.round(n * 10) / 10;
    const rounded = days.map(round);
    return { person, in: !!open, ...(open ? { since: open.start } : {}), days: rounded, hours: round(days.reduce((a, b) => a + b, 0)) };
  });
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** True when Odoo has the Attendances app and this login may read it. */
export async function canReadAttendance(c: Client): Promise<boolean> {
  try {
    await c.call('hr.attendance', 'search_count', [[]]);
    return true;
  } catch {
    return false;
  }
}

/** Active employees, and the punches that start in the week from `start` (or are still open). */
export async function readPeopleWeek(c: Client, start: number): Promise<{ people: Person[]; punches: Punch[] }> {
  const [emps, atts] = await Promise.all([
    c.call('hr.employee', 'search_read', [[['active', '=', true]]], { fields: ['name', 'job_title'], order: 'name asc', limit: 200 }) as Promise<Row[]>,
    c.call('hr.attendance', 'search_read', [['|', ['check_in', '>=', toOdooTime(start)], ['check_out', '=', false]]], { fields: ['employee_id', 'check_in', 'check_out'], limit: 2000 }) as Promise<Row[]>,
  ]);
  const people = (Array.isArray(emps) ? emps : []).map((e) => ({ id: e.id as number, name: str(e.name), job: str(e.job_title) }));
  const punches: Punch[] = [];
  for (const a of Array.isArray(atts) ? atts : []) {
    const emp = Array.isArray(a.employee_id) ? (a.employee_id[0] as number) : 0;
    const s = odooTime(a.check_in);
    if (!emp || s === undefined) continue;
    const e = odooTime(a.check_out);
    punches.push({ employeeId: emp, start: s, ...(e !== undefined ? { end: e } : {}) });
  }
  return { people, punches };
}

export const hoursText = (h: number): string => (h > 0 ? `${h.toFixed(1)} h` : '–');
