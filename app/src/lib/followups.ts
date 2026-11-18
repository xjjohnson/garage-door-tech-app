/**
 * Follow-ups: springs that are getting near the end of their cycle life and
 * warranties about to run out. (Yearly tune-ups belong to recurring visits.) Worked out from the invoices on the phone (what was put
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
  /** Warranty on the springs put in, by option, in months; 0 for none. */
  warrantyMonths: Record<Tier, number>;
  /** Warranty on labor, in days. */
  laborWarrantyDays: number;
}

export const DEFAULT_FOLLOW_UP: FollowUpSettings = {
  cyclesPerDay: 4,
  warrantyMonths: { good: 12, better: 36, best: 60 },
  laborWarrantyDays: 30,
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
  // The job's own choice wins; else the settings' lengths.
  const p = inv.warranty?.partsMonths ?? (inv.source === 'ticket' ? 0 : s.warrantyMonths[inv.tier]);
  const w = inv.warranty;
  const laborUntil = w?.laborDays !== undefined ? (w.laborDays > 0 ? inv.createdAt + w.laborDays * DAY : null) : w?.laborMonths !== undefined ? (w.laborMonths > 0 ? addMonths(inv.createdAt, w.laborMonths) : null) : s.laborWarrantyDays > 0 ? inv.createdAt + s.laborWarrantyDays * DAY : null;
  return {
    partsUntil: p > 0 ? addMonths(inv.createdAt, p) : null,
    laborUntil,
  };
}

/** Months of parts warranty for the job as a whole: the job's own pick, else the settings' length. */
export function jobPartsMonths(inv: Invoice, s: FollowUpSettings): number {
  return inv.warranty?.partsMonths ?? (inv.source === 'ticket' ? 0 : s.warrantyMonths[inv.tier]);
}

/**
 * Every priced line sold, each with its own months of warranty: its own pick, else the job's
 * for a part (a taxable line) and none for labor. `part` says which kind it is, for the badge.
 */
export function partWarranties(inv: Invoice, s: FollowUpSettings, keyOf: (l: Invoice['lines'][number]) => string): { key: string; label: string; part: boolean; months: number; until: number | null }[] {
  const job = jobPartsMonths(inv, s);
  const laborUntil = warrantyFor(inv, s).laborUntil;
  return inv.lines
    .filter((l) => !l.display && l.cents > 0)
    .map((l) => {
      const key = keyOf(l);
      const own = inv.warranty?.partMonths?.[key];
      // Labor follows the job's Labor choice (a line can only be switched off); a part has a length of its own.
      if (!l.taxable) return { key, label: l.label, part: false, months: 0, until: own === 0 ? null : laborUntil };
      const months = own ?? job;
      return { key, label: l.label, part: true, months, until: months > 0 ? addMonths(inv.createdAt, months) : null };
    });
}

/**
 * The warranty in a sentence for the invoice and its PDF. Parts read as
 * "parts" (not "springs", which an invoice may not have); when the covered
 * lines don't all share one length, or some part isn't covered, each is named.
 */
export function warrantyText(inv: Invoice, s: FollowUpSettings, keyOf: (l: Invoice['lines'][number]) => string, fmt: (t: number) => string): string {
  const w = warrantyFor(inv, s);
  const lines = partWarranties(inv, s, keyOf).filter((l) => l.part);
  const covered = lines.filter((l) => l.until);
  const custom = covered.length > 0 && (covered.some((l) => l.months !== covered[0]!.months) || lines.some((l) => l.part && !l.until));
  const parts = custom
    ? covered.map((l) => `${l.label} until ${fmt(l.until!)}`).join(', ')
    : covered.length > 0
      ? `${covered.some((l) => /spring/i.test(l.label)) ? 'springs' : 'parts'} until ${fmt(covered[0]!.until!)}`
      : w.partsUntil && lines.length === 0
        ? `parts until ${fmt(w.partsUntil)}`
        : '';
  const labor = w.laborUntil ? `labor until ${fmt(w.laborUntil)}` : '';
  return `Warranty: ${[parts || 'no parts warranty', labor].filter(Boolean).join(', ')}.`;
}

/** When the springs put in are expected to reach their rated cycles, at the tech's cycles a day. */
export function springsWornOutAt(inv: Invoice, s: FollowUpSettings): number {
  const days = TIER_CYCLES[inv.tier] / Math.max(0.1, s.cyclesPerDay);
  return inv.createdAt + days * DAY;
}

export type FollowUpKind = 'springs' | 'warranty';

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
  // Warranty lengths are fixed (spring quotes 1, 3 and 5 years; labor 30 days); a length saved by an
  // older version is ignored so every phone agrees. A job's own pick still wins.
  return {
    cyclesPerDay: n(d.cyclesPerDay, DEFAULT_FOLLOW_UP.cyclesPerDay) || DEFAULT_FOLLOW_UP.cyclesPerDay,
    warrantyMonths: DEFAULT_FOLLOW_UP.warrantyMonths,
    laborWarrantyDays: DEFAULT_FOLLOW_UP.laborWarrantyDays,
  };
}

export const FOLLOW_UPS_STORAGE_KEY = 'followups/v1';

export interface FollowUpStore {
  settings: FollowUpSettings;
  /** Follow-up id → when the tech marked it handled. */
  dismissed: Record<string, number>;
  /** Follow-up id → the Odoo activity on the customer made for it (src/lib/odooFollowUps.ts). */
  activities: Record<string, number>;
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
  const activities: Record<string, number> = {};
  if (d.activities && typeof d.activities === 'object') for (const [k, n] of Object.entries(d.activities as Record<string, unknown>)) if (typeof n === 'number') activities[k] = n;
  return { settings: parseFollowUpSettings(d.settings), dismissed, activities };
}
