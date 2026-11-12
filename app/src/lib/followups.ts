/**
 * Follow-ups: repeat work that's due. A tune-up about a year after a job,
 * springs that are getting near the end of their cycle life, and warranties
 * about to run out. Worked out from the invoices on the phone (what was put
 * in, and when), so nothing needs to be scheduled. Kept free of React so it
 * can be tested directly.
 */
import { Business, Invoice, invoiceStatus } from './invoices';
import { TIER_CYCLES, TIER_LABEL, Tier } from './prices';

export const DAY = 24 * 60 * 60 * 1000;

/** The tech's follow-up and warranty settings, kept with the business details. */
export interface FollowUpSettings {
  /** Door cycles a day (one open and close is a cycle). About 4 is typical for a home. */
  cyclesPerDay: number;
  tuneUpMonths: number;
  /** Warranty on the springs put in, by option, in months; 0 for none. */
  warrantyMonths: Record<Tier, number>;
  laborWarrantyMonths: number;
}

export const DEFAULT_FOLLOW_UP: FollowUpSettings = {
  cyclesPerDay: 4,
  tuneUpMonths: 12,
  warrantyMonths: { good: 12, better: 36, best: 60 },
  laborWarrantyMonths: 12,
};

export function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

export interface Warranty {
  partsUntil: number | null;
  laborUntil: number | null;
}

/** The warranty on an invoice's work, counted from the day it was made. */
export function warrantyFor(inv: Invoice, s: FollowUpSettings): Warranty {
  // A ticket isn't a spring option, so it has no spring warranty of its own.
  const p = inv.source === 'ticket' ? 0 : s.warrantyMonths[inv.tier];
  return {
    partsUntil: p > 0 ? addMonths(inv.createdAt, p) : null,
    laborUntil: s.laborWarrantyMonths > 0 ? addMonths(inv.createdAt, s.laborWarrantyMonths) : null,
  };
}

/** When the springs put in are expected to reach their rated cycles, at the tech's cycles a day. */
export function springsWornOutAt(inv: Invoice, s: FollowUpSettings): number {
  const days = TIER_CYCLES[inv.tier] / Math.max(0.1, s.cyclesPerDay);
  return inv.createdAt + days * DAY;
}

export type FollowUpKind = 'tuneup' | 'springs' | 'warranty';

export interface FollowUp {
  kind: FollowUpKind;
  invoice: Invoice;
  /** When it's due (or the warranty ends). */
  due: number;
  title: string;
  /** A text the tech can send the customer, in their own words to edit. */
  message: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (ms: number) => `${MONTHS[new Date(ms).getMonth()]} ${new Date(ms).getFullYear()}`;

/**
 * Everything due within the window (default: the next 45 days, and anything
 * overdue up to a year back), soonest first. Void invoices and ones marked
 * done with in `dismissed` are left out.
 */
export function followUps(
  invoices: Invoice[],
  s: FollowUpSettings,
  business: Pick<Business, 'name' | 'phone'>,
  now: number,
  dismissed: Record<string, number> = {},
  aheadDays = 45,
): FollowUp[] {
  const from = now - 365 * DAY;
  const to = now + aheadDays * DAY;
  const who = business.name || 'your garage door tech';
  const out: FollowUp[] = [];
  // Only the latest invoice at each job counts; an older one was replaced by new work.
  const latest = new Map<string, Invoice>();
  for (const i of invoices) {
    if (invoiceStatus(i) === 'void') continue;
    const key = i.customerId ? `${i.customerId}|${i.address}` : i.jobId;
    const cur = latest.get(key);
    if (!cur || i.createdAt > cur.createdAt) latest.set(key, i);
  }
  for (const inv of latest.values()) {
    const name = inv.billTo.split(/\s+/)[0] || 'there';
    const add = (kind: FollowUpKind, due: number, title: string, message: string) => {
      if (due < from || due > to) return;
      const id = followUpId(kind, inv);
      if (dismissed[id]) return;
      out.push({ kind, invoice: inv, due, title, message });
    };
    const tune = addMonths(inv.createdAt, s.tuneUpMonths);
    add('tuneup', tune, 'Tune-up due', `Hi ${name}, it's ${who}. It's been about a year since we worked on your garage door. A yearly tune-up and safety check keeps it running quiet and safe. Want me to set one up?`);
    const worn = springsWornOutAt(inv, s);
    if (inv.source !== 'ticket') add(
      'springs',
      worn - 180 * DAY,
      `${TIER_LABEL[inv.tier]} springs near the end of their life (${monthYear(worn)})`,
      `Hi ${name}, it's ${who}. The springs we put in are getting close to their rated life. Replacing them before one breaks saves a stuck door. Want a quote?`,
    );
    const w = warrantyFor(inv, s);
    if (w.partsUntil) add('warranty', w.partsUntil - 30 * DAY, `Spring warranty ends ${monthYear(w.partsUntil)}`, `Hi ${name}, it's ${who}. The warranty on your garage door springs ends soon. If anything seems off, now's the time to have it checked at no charge.`);
  }
  return out.sort((a, b) => a.due - b.due);
}

export function followUpId(kind: FollowUpKind, inv: Pick<Invoice, 'id'>): string {
  return `${kind}:${inv.id}`;
}

/** An sms: link with the message filled in, or nothing without a usable phone number. */
export function textLink(phone: string, message: string): string | undefined {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.replace(/\+/g, '').length < 7) return undefined;
  return `sms:${digits}?body=${encodeURIComponent(message)}`;
}

export function parseFollowUpSettings(v: unknown): FollowUpSettings {
  if (!v || typeof v !== 'object') return DEFAULT_FOLLOW_UP;
  const d = v as Record<string, unknown>;
  const n = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : fallback);
  const w = (d.warrantyMonths && typeof d.warrantyMonths === 'object' ? d.warrantyMonths : {}) as Record<string, unknown>;
  return {
    cyclesPerDay: n(d.cyclesPerDay, DEFAULT_FOLLOW_UP.cyclesPerDay) || DEFAULT_FOLLOW_UP.cyclesPerDay,
    tuneUpMonths: n(d.tuneUpMonths, DEFAULT_FOLLOW_UP.tuneUpMonths) || DEFAULT_FOLLOW_UP.tuneUpMonths,
    warrantyMonths: {
      good: n(w.good, DEFAULT_FOLLOW_UP.warrantyMonths.good),
      better: n(w.better, DEFAULT_FOLLOW_UP.warrantyMonths.better),
      best: n(w.best, DEFAULT_FOLLOW_UP.warrantyMonths.best),
    },
    laborWarrantyMonths: n(d.laborWarrantyMonths, DEFAULT_FOLLOW_UP.laborWarrantyMonths),
  };
}

export const FOLLOW_UPS_STORAGE_KEY = 'followups/v1';

export interface FollowUpStore {
  settings: FollowUpSettings;
  /** Follow-up id → when the tech marked it handled. */
  dismissed: Record<string, number>;
}

export function parseFollowUpStore(raw: string | null | object): FollowUpStore {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      v = null;
    }
  }
  const d = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const dismissed: Record<string, number> = {};
  if (d.dismissed && typeof d.dismissed === 'object') for (const [k, t] of Object.entries(d.dismissed as Record<string, unknown>)) if (typeof t === 'number') dismissed[k] = t;
  return { settings: parseFollowUpSettings(d.settings), dismissed };
}
