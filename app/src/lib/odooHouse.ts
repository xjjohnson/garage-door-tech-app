/**
 * What Odoo knows about a house (its Field Service location) and a customer
 * before the tech knocks: the doors and openers on file with their warranty
 * dates, the visits already made there, and how many visits and how much
 * spend the customer has. Read-only; everything comes from Odoo (equipment
 * records, Field Service orders, posted invoices). Only the fields that
 * fields_get lists are read, so an older Odoo just shows less. Kept free of
 * React; the client is passed in.
 */
import type { OdooClient } from './odoo';
import { odooTime } from './odoo';
import { orderLocation } from './odooEquipment';

type Caller = Pick<OdooClient, 'call' | 'session'>;

export interface HouseEquipment {
  id: number;
  name: string;
  /** Free text the tech or the app wrote in Odoo, without the app's own markers. */
  lines: string[];
  /** Parts warranty end, ms, when the notes say it. */
  partsUntil?: number;
  laborUntil?: number;
}

export interface HouseVisit {
  id: number;
  name: string;
  stage: string;
  /** When it was done or scheduled, ms. */
  when?: number;
  what: string;
}

export interface HouseHistory {
  locationId: number;
  equipment: HouseEquipment[];
  visits: HouseVisit[];
  /** The most recent finished visit, ms. */
  lastVisit?: number;
  at: number;
}

export interface CustomerBadge {
  visits: number;
  /** Cents, posted invoices less credit notes. */
  spend: number;
  at: number;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const m2oName = (v: unknown): string => (Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '');
const plain = (h: string) =>
  h
    .replace(/<\/p>\s*<p>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

async function fieldsOf(c: Caller, model: string): Promise<string[] | null> {
  try {
    const f = (await c.call(model, 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;
    return Object.keys(f);
  } catch {
    return null;
  }
}

const WARRANTY = /^Warranty on (parts|labor) until (.+?)(?: \(invoice .*\))?$/;
const parseDay = (t: string): number | undefined => {
  const ms = Date.parse(`${t} 12:00:00`);
  return Number.isNaN(ms) ? undefined : ms;
};

/** One equipment record's notes as lines to show, with the warranty dates pulled out. The app's own markers are dropped. */
export function readEquipmentNotes(notes: string): Pick<HouseEquipment, 'lines' | 'partsUntil' | 'laborUntil'> {
  const lines = plain(notes)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^--- (Johnsons app|end) ---$/.test(l) && !l.startsWith('johnsons-equipment:'));
  let partsUntil: number | undefined;
  let laborUntil: number | undefined;
  for (const l of lines) {
    const m = WARRANTY.exec(l);
    if (!m) continue;
    const ms = parseDay(m[2]);
    if (m[1] === 'parts') partsUntil = ms;
    else laborUntil = ms;
  }
  return { lines, ...(partsUntil !== undefined ? { partsUntil } : {}), ...(laborUntil !== undefined ? { laborUntil } : {}) };
}

/** "In warranty until Nov 14, 2027", "Warranty ended Mar 3, 2026" or nothing when no date is known. */
export function warrantyStatus(e: Pick<HouseEquipment, 'partsUntil' | 'laborUntil'>, now: number): { text: string; active: boolean } | null {
  const until = Math.max(e.partsUntil ?? 0, e.laborUntil ?? 0);
  if (!until) return null;
  const day = new Date(until).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  return until >= now ? { text: `In warranty until ${day}`, active: true } : { text: `Warranty ended ${day}`, active: false };
}

/** The house a Field Service job is at: its location. Undefined when the job isn't in Odoo's Field Service. */
export async function houseOfOrder(c: Caller, orderId: number): Promise<number | undefined> {
  if (c.session.kind !== 'oca') return undefined;
  return orderLocation(c, orderId);
}

/** Equipment on file and past visits at one house (the job being opened is left out). */
export async function fetchHouseHistory(c: Caller, locationId: number, exceptOrderId?: number, now: number = Date.now(), limit = 12): Promise<HouseHistory> {
  const [eqFields, orderFields] = await Promise.all([fieldsOf(c, 'fsm.equipment'), fieldsOf(c, 'fsm.order')]);
  let equipment: HouseEquipment[] = [];
  if (eqFields?.includes('location_id') && eqFields.includes('name')) {
    const rows = (await c.call('fsm.equipment', 'search_read', [[['location_id', '=', locationId]]], { fields: ['name', ...(eqFields.includes('notes') ? ['notes'] : [])], order: 'id asc', limit: 100 })) as Record<string, unknown>[];
    equipment = rows.map((r) => ({ id: r.id as number, name: str(r.name) || `#${r.id}`, ...readEquipmentNotes(str(r.notes)) }));
  }
  let visits: HouseVisit[] = [];
  if (orderFields?.includes('location_id')) {
    const have = (f: string) => orderFields.includes(f);
    const domain: unknown[] = [['location_id', '=', locationId], ...(exceptOrderId ? [['id', '!=', exceptOrderId]] : [])];
    const fields = ['name', 'stage_id', 'description', 'scheduled_date_start', 'date_end'].filter(have);
    const rows = (await c.call('fsm.order', 'search_read', [domain], { fields, order: 'id desc', limit })) as Record<string, unknown>[];
    visits = rows.map((r) => ({
      id: r.id as number,
      name: str(r.name) || `#${r.id}`,
      stage: m2oName(r.stage_id),
      when: odooTime(r.date_end) ?? odooTime(r.scheduled_date_start),
      what: plain(str(r.description)).split('\n').find((l) => l.trim() && !/^App job /.test(l)) ?? '',
    }));
  }
  const done = visits.filter((v) => /done|complete|closed/i.test(v.stage) && v.when !== undefined && v.when <= now).map((v) => v.when as number);
  return { locationId, equipment, visits, ...(done.length ? { lastVisit: Math.max(...done) } : {}), at: now };
}

/** Finished visits and spend for a customer (their houses included, as on the customer page). */
export async function fetchCustomerBadge(c: Caller, partnerId: number, now: number = Date.now()): Promise<CustomerBadge> {
  let visits = 0;
  if (c.session.kind === 'oca' && partnerId) {
    const owned = ['|', ['location_id.owner_id', 'child_of', partnerId], ['location_id.partner_id', 'child_of', partnerId]];
    const closed = [...owned, ['stage_id.is_closed', '=', true]];
    try {
      visits = (await c.call('fsm.order', 'search_count', [closed])) as number;
    } catch {
      visits = (await c.call('fsm.order', 'search_count', [owned])) as number;
    }
  }
  let spend = 0;
  if (partnerId) {
    const rows = (await c.call('account.move', 'search_read', [[['move_type', 'in', ['out_invoice', 'out_refund']], ['state', '=', 'posted'], ['partner_id', 'child_of', partnerId]]], { fields: ['move_type', 'amount_total'], limit: 2000 })) as Record<string, unknown>[];
    for (const r of rows) {
      const cents = typeof r.amount_total === 'number' ? Math.round(r.amount_total * 100) : 0;
      spend += r.move_type === 'out_refund' ? -cents : cents;
    }
  }
  return { visits, spend: Math.max(0, spend), at: now };
}

/** "12 visits · $4,800 spent", or null for a customer with no history yet. */
export function badgeText(b: Pick<CustomerBadge, 'visits' | 'spend'>, money: (cents: number) => string): string | null {
  if (b.visits <= 0 && b.spend <= 0) return null;
  const v = b.visits > 0 ? `${b.visits} visit${b.visits === 1 ? '' : 's'}` : '';
  const s = b.spend > 0 ? `${money(b.spend)} spent` : '';
  return [v, s].filter(Boolean).join(' · ');
}

/** A repeat customer has been here more than once before this job. */
export const isRepeat = (b: Pick<CustomerBadge, 'visits'>) => b.visits >= 2;
