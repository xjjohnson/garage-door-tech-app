/**
 * The schedule: appointments on a day, each for a customer at an address,
 * optionally tied to a saved job. Times are picked from big buttons (no
 * clock wheel to fight with gloves on). Kept free of React so it can be
 * tested directly.
 *
 * An appointment keeps what a field-service system keeps for a visit
 * (customer, address, start, length, status), so a later sync can map it.
 */
export const SCHEDULE_STORAGE_KEY = 'schedule/v1';

export type VisitStatus = 'booked' | 'done' | 'cancelled';

export interface Appointment {
  id: string;
  /** Start, milliseconds since 1970. */
  start: number;
  /** Length in minutes. */
  minutes: number;
  customerId?: string;
  jobId?: string;
  name: string;
  address: string;
  phone: string;
  /** What it's for: "Broken spring", "Tune-up"... */
  what: string;
  status: VisitStatus;
  createdAt: number;
  updatedAt: number;
  /** When this visit's time last matched its Odoo job; a later updatedAt means the phone changed it. */
  syncedAt?: number;
  /** For a visit pulled from Odoo: the job's reference there ("FO0002"). */
  odooName?: string;
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Start times to pick from, 7:00 to 18:00 every half hour, on the given day. */
export function slotsFor(day: number): number[] {
  const out: number[] = [];
  for (let m = 7 * 60; m <= 18 * 60; m += 30) {
    const d = new Date(startOfDay(day));
    d.setHours(Math.floor(m / 60), m % 60, 0, 0);
    out.push(d.getTime());
  }
  return out;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Wed, Nov 12", for the Today header. */
export function dateLine(ms: number): string {
  const d = new Date(ms);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** "Today", "Tomorrow", or "Fri, Nov 13". */
export function dayLabel(day: number, now: number): string {
  const diff = Math.round((startOfDay(day) - startOfDay(now)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = new Date(day);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function onDay(list: Appointment[], day: number): Appointment[] {
  const from = startOfDay(day);
  const to = addDays(from, 1);
  return list.filter((a) => a.start >= from && a.start < to).sort((a, b) => a.start - b.start);
}

/** Booked visits that overlap this one on the same day. */
export function overlaps(list: Appointment[], a: Pick<Appointment, 'id' | 'start' | 'minutes'>): Appointment[] {
  const end = a.start + a.minutes * 60_000;
  return list.filter((b) => b.id !== a.id && b.status === 'booked' && b.start < end && a.start < b.start + b.minutes * 60_000);
}

/** The next booked visits from now, soonest first. */
export function upcoming(list: Appointment[], now: number, limit = 3): Appointment[] {
  return list
    .filter((a) => a.status === 'booked' && a.start + a.minutes * 60_000 > now)
    .sort((a, b) => a.start - b.start)
    .slice(0, limit);
}

/** A maps link for the address (Android opens Google Maps or the phone's maps app). */
export function mapsLink(address: string): string | undefined {
  const a = address.trim();
  return a ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}` : undefined;
}

export function onMyWayText(a: Pick<Appointment, 'name'>, businessName: string, etaMinutes: number): string {
  const first = a.name.split(/\s+/)[0] || 'there';
  return `Hi ${first}, it's ${businessName || 'your garage door tech'}. I'm on my way and should be there in about ${etaMinutes} minutes.`;
}

export function reminderText(a: Pick<Appointment, 'name' | 'start'>, businessName: string, now: number): string {
  const first = a.name.split(/\s+/)[0] || 'there';
  const label = dayLabel(a.start, now);
  const when = label === 'Today' || label === 'Tomorrow' ? label.toLowerCase() : `on ${label}`;
  return `Hi ${first}, it's ${businessName || 'your garage door tech'}. Just confirming your garage door appointment ${when} at ${formatTime(a.start)}. Reply if you need to change it.`;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

const STATUSES: VisitStatus[] = ['booked', 'done', 'cancelled'];

export function parseSchedule(raw: string | null | unknown[]): Appointment[] {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];
  return data.flatMap((x): Appointment[] => {
    if (!x || typeof x !== 'object') return [];
    const a = x as Record<string, unknown>;
    if (typeof a.id !== 'string' || typeof a.start !== 'number') return [];
    const createdAt = typeof a.createdAt === 'number' ? a.createdAt : a.start;
    return [
      {
        id: a.id,
        start: a.start,
        minutes: typeof a.minutes === 'number' && a.minutes > 0 ? a.minutes : 60,
        ...(typeof a.customerId === 'string' && a.customerId ? { customerId: a.customerId } : {}),
        ...(typeof a.jobId === 'string' && a.jobId ? { jobId: a.jobId } : {}),
        name: str(a.name),
        address: str(a.address),
        phone: str(a.phone),
        what: str(a.what),
        status: STATUSES.includes(a.status as VisitStatus) ? (a.status as VisitStatus) : 'booked',
        createdAt,
        updatedAt: typeof a.updatedAt === 'number' ? a.updatedAt : createdAt,
        ...(typeof a.syncedAt === 'number' ? { syncedAt: a.syncedAt } : {}),
        ...(typeof a.odooName === 'string' && a.odooName ? { odooName: a.odooName } : {}),
      },
    ];
  });
}

export function mergeSchedule(current: Appointment[], incoming: Appointment[]): Appointment[] {
  const byId = new Map(current.map((a) => [a.id, a]));
  for (const a of incoming) {
    const mine = byId.get(a.id);
    if (!mine || a.updatedAt > mine.updatedAt) byId.set(a.id, a);
  }
  return [...byId.values()];
}
