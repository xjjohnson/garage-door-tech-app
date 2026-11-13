/**
 * Time and miles: a work day is clocked in and out, with the truck's odometer
 * at each end (or the miles typed in). Weekly totals give hours, miles and the
 * mileage deduction at the tech's rate, and a CSV for the accountant. Kept free
 * of React so it can be tested directly. Weeks start on Monday, as in stats.
 */
import { formatTime } from './schedule';
import { Period, startOfDay, thisWeek } from './stats';

export const WORK_LOG_STORAGE_KEY = 'worklog/v1';

/** The IRS standard business rate for 2025, in cents a mile. The tech sets this year's. */
export const DEFAULT_CENTS_PER_MILE = 70;

export interface Shift {
  id: string;
  start: number;
  /** Missing while still on the clock. */
  end?: number;
  odoStart?: number;
  odoEnd?: number;
  /** Miles typed in by hand; wins over the odometer. */
  miles?: number;
  note: string;
  updatedAt: number;
  /** The Odoo Attendance record this day went to, and the times it holds, so a later edit is sent again. */
  odooAtt?: { id: number; start: number; end?: number };
}

export interface WorkLog {
  shifts: Shift[];
  centsPerMile: number;
}

export const EMPTY_WORK_LOG: WorkLog = { shifts: [], centsPerMile: DEFAULT_CENTS_PER_MILE };

/** The day still on the clock, if any. */
export function openShift(shifts: Shift[]): Shift | undefined {
  return shifts.filter((s) => s.end === undefined).sort((a, b) => b.start - a.start)[0];
}

export function shiftMs(s: Shift, now: number): number {
  return Math.max(0, (s.end ?? now) - s.start);
}

/** Miles for a day: typed-in miles, else the odometer difference, else 0. */
export function shiftMiles(s: Shift): number {
  if (s.miles !== undefined) return s.miles;
  if (s.odoStart !== undefined && s.odoEnd !== undefined && s.odoEnd >= s.odoStart) return s.odoEnd - s.odoStart;
  return 0;
}

/** "3h 05m". */
export function formatHours(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

export function weekOf(now: number, offset = 0): Period {
  const w = thisWeek(now);
  const d = new Date(w.start);
  d.setDate(d.getDate() + 7 * offset);
  const start = d.getTime();
  d.setDate(d.getDate() + 7);
  return { start, end: d.getTime() };
}

export function inPeriod(shifts: Shift[], p: Period): Shift[] {
  return shifts.filter((s) => s.start >= p.start && s.start < p.end).sort((a, b) => a.start - b.start);
}

export interface Totals {
  days: number;
  ms: number;
  miles: number;
  deductionCents: number;
}

export function totals(shifts: Shift[], centsPerMile: number, now: number): Totals {
  const miles = shifts.reduce((n, s) => n + shiftMiles(s), 0);
  return {
    days: new Set(shifts.map((s) => startOfDay(s.start))).size,
    ms: shifts.reduce((n, s) => n + shiftMs(s, now), 0),
    miles,
    deductionCents: Math.round(miles * centsPerMile),
  };
}

const iso = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** One row a day, for a spreadsheet or the accountant. */
export function workLogCsv(shifts: Shift[], centsPerMile: number, now: number): string {
  const rows = [['Date', 'Start', 'End', 'Hours', 'Odometer start', 'Odometer end', 'Miles', 'Deduction ($)', 'Note']];
  for (const s of [...shifts].sort((a, b) => a.start - b.start)) {
    const miles = shiftMiles(s);
    rows.push([
      iso(s.start),
      formatTime(s.start),
      s.end !== undefined ? formatTime(s.end) : '',
      (shiftMs(s, now) / 3_600_000).toFixed(2),
      s.odoStart !== undefined ? String(s.odoStart) : '',
      s.odoEnd !== undefined ? String(s.odoEnd) : '',
      String(miles),
      (Math.round(miles * centsPerMile) / 100).toFixed(2),
      s.note,
    ]);
  }
  const t = totals(shifts, centsPerMile, now);
  rows.push(['Total', '', '', (t.ms / 3_600_000).toFixed(2), '', '', String(t.miles), (t.deductionCents / 100).toFixed(2), '']);
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

function attRef(v: unknown): { odooAtt?: NonNullable<Shift['odooAtt']> } {
  if (!v || typeof v !== 'object') return {};
  const a = v as Record<string, unknown>;
  if (typeof a.id !== 'number' || typeof a.start !== 'number') return {};
  return { odooAtt: { id: a.id, start: a.start, ...(typeof a.end === 'number' ? { end: a.end } : {}) } };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);

export function parseWorkLog(raw: string | null | unknown): WorkLog {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return EMPTY_WORK_LOG;
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return EMPTY_WORK_LOG;
  const d = data as Record<string, unknown>;
  const shifts = (Array.isArray(d.shifts) ? d.shifts : []).flatMap((x): Shift[] => {
    if (!x || typeof x !== 'object') return [];
    const s = x as Record<string, unknown>;
    if (typeof s.id !== 'string' || typeof s.start !== 'number') return [];
    const end = num(s.end);
    const odoStart = num(s.odoStart);
    const odoEnd = num(s.odoEnd);
    const miles = num(s.miles);
    return [
      {
        id: s.id,
        start: s.start,
        ...(end !== undefined ? { end } : {}),
        ...(odoStart !== undefined ? { odoStart } : {}),
        ...(odoEnd !== undefined ? { odoEnd } : {}),
        ...(miles !== undefined ? { miles } : {}),
        note: typeof s.note === 'string' ? s.note : '',
        updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : s.start,
        ...attRef(s.odooAtt),
      },
    ];
  });
  return { shifts, centsPerMile: num(d.centsPerMile) ?? DEFAULT_CENTS_PER_MILE };
}

/** A backup's days together with the phone's; the copy changed last wins. The backup's rate is kept. */
export function mergeWorkLog(current: WorkLog, incoming: WorkLog): WorkLog {
  const byId = new Map(current.shifts.map((s) => [s.id, s]));
  for (const s of incoming.shifts) {
    const mine = byId.get(s.id);
    if (!mine || s.updatedAt > mine.updatedAt) byId.set(s.id, { ...s, ...(s.odooAtt || !mine?.odooAtt ? {} : { odooAtt: mine.odooAtt }) });
  }
  return { shifts: [...byId.values()], centsPerMile: incoming.centsPerMile };
}
