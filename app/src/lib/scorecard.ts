/**
 * The owner's tech scorecard: for each tech, the share of quotes won, the
 * average ticket, callbacks, and how often the customer picked Better or
 * Best. From Odoo (Field Service orders, sales orders, invoices) when the
 * owner is signed in, otherwise from what's on this phone. Kept free of React.
 *
 * A callback is a new job at the same place within 30 days of an earlier
 * one; it counts against the tech who did the earlier job.
 */
import { odooTime, OdooClient, toOdooTime } from './odoo';
import type { Invoice } from './invoices';
import type { Job } from './jobs';
import type { Tier } from './prices';
import { Period, startOfDay, thisWeek } from './stats';

export const CALLBACK_DAYS = 30;
const DAY = 86_400_000;

export interface ScoreData {
  /** Every job, by who did it and where. */
  visits: { tech: string; place: string; at: number }[];
  quotes: { tech: string; at: number; won: boolean; tier?: Tier }[];
  /** Invoice totals, cents. */
  tickets: { tech: string; at: number; cents: number }[];
}

export interface TechScore {
  tech: string;
  jobs: number;
  quotes: number;
  won: number;
  /** 0 to 1, or null with no quotes. */
  winRate: number | null;
  /** Cents, or null with no invoices. */
  averageTicket: number | null;
  callbacks: number;
  /** Of won quotes with a known option, the share that were Better or Best; null when none are known. */
  betterBest: number | null;
}

export type ScorePeriod = 'week' | '30d' | 'year';
export const SCORE_PERIOD_LABEL: Record<ScorePeriod, string> = { week: 'Week', '30d': '30 days', year: 'Year' };

export function scorePeriod(p: ScorePeriod, now: number): Period {
  if (p === 'week') return thisWeek(now);
  if (p === '30d') return { start: now - 30 * DAY, end: now + 1 };
  return { start: new Date(new Date(now).getFullYear(), 0, 1).getTime(), end: now + 1 };
}

const inside = (at: number, p: Period) => at >= p.start && at < p.end;
export const placeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function scorecard(data: ScoreData, p: Period): TechScore[] {
  const techs = new Set<string>();
  for (const x of [...data.visits, ...data.quotes, ...data.tickets]) if (inside(x.at, p) && x.tech) techs.add(x.tech);
  // Callbacks: a job in the period at a place that had a job in the 30 days before it.
  const callbacks = new Map<string, number>();
  const byPlace = new Map<string, ScoreData['visits']>();
  for (const v of data.visits) {
    if (!v.place) continue;
    const list = byPlace.get(v.place) ?? [];
    list.push(v);
    byPlace.set(v.place, list);
  }
  for (const list of byPlace.values()) {
    list.sort((a, b) => a.at - b.at);
    for (let k = 1; k < list.length; k++) {
      const v = list[k];
      const before = list[k - 1];
      if (inside(v.at, p) && v.at - before.at > 0 && v.at - before.at <= CALLBACK_DAYS * DAY) {
        callbacks.set(before.tech, (callbacks.get(before.tech) ?? 0) + 1);
        if (before.tech) techs.add(before.tech);
      }
    }
  }
  return [...techs]
    .map((tech): TechScore => {
      const q = data.quotes.filter((x) => x.tech === tech && inside(x.at, p));
      const won = q.filter((x) => x.won);
      const tiered = won.filter((x) => x.tier);
      const t = data.tickets.filter((x) => x.tech === tech && inside(x.at, p));
      return {
        tech,
        jobs: data.visits.filter((x) => x.tech === tech && inside(x.at, p)).length,
        quotes: q.length,
        won: won.length,
        winRate: q.length ? won.length / q.length : null,
        averageTicket: t.length ? Math.round(t.reduce((n, x) => n + x.cents, 0) / t.length) : null,
        callbacks: callbacks.get(tech) ?? 0,
        betterBest: tiered.length ? tiered.filter((x) => x.tier !== 'good').length / tiered.length : null,
      };
    })
    .sort((a, b) => b.jobs - a.jobs || a.tech.localeCompare(b.tech));
}

/** This phone's own numbers, all as one tech. */
export function phoneScoreData(jobs: Job[], invoices: Invoice[], tech: string): ScoreData {
  return {
    visits: jobs.map((j) => ({ tech, place: placeKey(j.address) || (j.customerId ? `c:${j.customerId}` : ''), at: j.savedAt })),
    quotes: jobs.map((j) => ({ tech, at: j.accepted?.at ?? j.savedAt, won: !!j.accepted, ...(j.accepted && !j.accepted.key ? { tier: j.accepted.tier } : {}) })),
    tickets: invoices.filter((i) => !i.voidedAt).map((i) => ({ tech, at: i.createdAt, cents: i.total })),
  };
}

/** "Better", "best" or "good" in a sales order's reference or note, if the phone or a person put it there. */
export function tierIn(text: string): Tier | undefined {
  const m = text.match(/\b(good|better|best)\b/i);
  return m ? (m[1].toLowerCase() as Tier) : undefined;
}

/** Whether the signed-in Odoo user is the owner: an Odoo admin, or a Field Service manager. */
export async function isOwner(client: OdooClient): Promise<boolean> {
  for (const g of ['base.group_system', 'fieldservice.group_fsm_manager']) {
    try {
      if ((await client.call('res.users', 'has_group', [[client.session.uid], g])) === true) return true;
    } catch {
      // Not an available group here; try the next.
    }
  }
  return false;
}

const name = (v: unknown) => (Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '');
const money = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) : 0);

/** Every tech's jobs, quotes and invoices from Odoo since `since` (less 30 days, for callbacks). */
export async function odooScoreData(client: OdooClient, since: number): Promise<ScoreData> {
  const from = since - CALLBACK_DAYS * DAY;
  const out: ScoreData = { visits: [], quotes: [], tickets: [] };
  if (client.session.kind === 'oca') {
    const f = client.session.fields;
    const when = f.includes('date_end') ? 'date_end' : f.includes('scheduled_date_start') ? 'scheduled_date_start' : 'create_date';
    const rows = (await client.call('fsm.order', 'search_read', [['|', [when, '>=', toOdooTime(from)], '&', [when, '=', false], ['create_date', '>=', toOdooTime(from)]]], { fields: ['person_id', 'location_id', when, 'create_date'], limit: 5000 })) as Record<string, unknown>[];
    for (const r of rows) {
      const at = odooTime(r[when]) ?? odooTime(r.create_date);
      if (at === undefined) continue;
      out.visits.push({ tech: name(r.person_id) || 'Not assigned', place: Array.isArray(r.location_id) ? `l:${r.location_id[0]}` : '', at });
    }
  }
  if (client.session.apps.sales) {
    const rows = (await client.call('sale.order', 'search_read', [[['date_order', '>=', toOdooTime(since)], ['state', '!=', 'cancel']]], { fields: ['user_id', 'state', 'date_order', 'client_order_ref'], limit: 5000 })) as Record<string, unknown>[];
    for (const r of rows) {
      const at = odooTime(r.date_order);
      if (at === undefined) continue;
      const won = r.state === 'sale' || r.state === 'done';
      const tier = won ? tierIn(typeof r.client_order_ref === 'string' ? r.client_order_ref : '') : undefined;
      out.quotes.push({ tech: name(r.user_id) || 'Not assigned', at, won, ...(tier ? { tier } : {}) });
    }
  }
  if (client.session.apps.invoicing) {
    const day = toOdooTime(since).slice(0, 10);
    const rows = (await client.call('account.move', 'search_read', [[['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['invoice_date', '>=', day]]], { fields: ['invoice_user_id', 'amount_total', 'invoice_date'], limit: 5000 })) as Record<string, unknown>[];
    for (const r of rows) {
      const at = odooTime(r.invoice_date);
      if (at === undefined) continue;
      out.tickets.push({ tech: name(r.invoice_user_id) || 'Not assigned', at, cents: money(r.amount_total) });
    }
  }
  return out;
}

/** The business as a whole, for the owner's overview. */
export interface OwnerData {
  /** Posted customer invoices: when, total, and what is still owed, cents. */
  invoices: { at: number; cents: number; owed: number; due?: number }[];
  /** Open follow-up activities, by who they are for. */
  followUps: { tech: string; deadline?: number }[];
}

export interface OwnerSummary {
  jobs: number;
  /** Cents invoiced in the period. */
  revenue: number;
  /** Cents of that revenue already paid. */
  collected: number;
  /** Every unpaid invoice, whatever its date. */
  openInvoices: number;
  openCents: number;
  overdueInvoices: number;
  overdueCents: number;
  followUps: { tech: string; open: number; overdue: number }[];
}

export function ownerSummary(visits: ScoreData['visits'], data: OwnerData, p: Period, now: number): OwnerSummary {
  const mine = data.invoices.filter((i) => inside(i.at, p));
  const open = data.invoices.filter((i) => i.owed > 0);
  const late = open.filter((i) => i.due !== undefined && i.due < startOfDay(now));
  const by = new Map<string, { open: number; overdue: number }>();
  for (const f of data.followUps) {
    const row = by.get(f.tech) ?? { open: 0, overdue: 0 };
    row.open += 1;
    if (f.deadline !== undefined && f.deadline < startOfDay(now)) row.overdue += 1;
    by.set(f.tech, row);
  }
  return {
    jobs: visits.filter((v) => inside(v.at, p)).length,
    revenue: mine.reduce((n, i) => n + i.cents, 0),
    collected: mine.reduce((n, i) => n + (i.cents - Math.min(i.cents, i.owed)), 0),
    openInvoices: open.length,
    openCents: open.reduce((n, i) => n + i.owed, 0),
    overdueInvoices: late.length,
    overdueCents: late.reduce((n, i) => n + i.owed, 0),
    followUps: [...by].map(([tech, v]) => ({ tech, ...v })).sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.tech.localeCompare(b.tech)),
  };
}

/** Phone-only numbers: this phone's invoices and no follow-up list. */
export function phoneOwnerData(invoices: Invoice[]): OwnerData {
  return {
    invoices: invoices
      .filter((i) => !i.voidedAt)
      .map((i) => ({ at: i.createdAt, cents: i.total, owed: Math.max(0, i.total - i.payments.reduce((n, x) => n + x.amount, 0)) })),
    followUps: [],
  };
}

/**
 * Unpaid invoices and open follow-ups, read from Odoo. Invoices come from
 * `since` on, plus every invoice still owing; follow-ups are the open
 * activities on customers. A part Odoo won't let this user read is left out.
 */
export async function odooOwnerData(client: OdooClient, since: number): Promise<OwnerData> {
  const out: OwnerData = { invoices: [], followUps: [] };
  if (client.session.apps.invoicing) {
    const day = toOdooTime(since).slice(0, 10);
    const rows = (await client.call('account.move', 'search_read', [[['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], '|', ['invoice_date', '>=', day], ['amount_residual', '>', 0]]], { fields: ['amount_total', 'amount_residual', 'invoice_date', 'invoice_date_due'], limit: 5000 })) as Record<string, unknown>[];
    for (const r of rows) {
      const at = odooTime(r.invoice_date);
      if (at === undefined) continue;
      const due = odooTime(r.invoice_date_due);
      out.invoices.push({ at, cents: money(r.amount_total), owed: money(r.amount_residual), ...(due !== undefined ? { due } : {}) });
    }
  }
  try {
    const rows = (await client.call('mail.activity', 'search_read', [[['res_model', '=', 'res.partner']]], { fields: ['user_id', 'date_deadline'], limit: 5000 })) as Record<string, unknown>[];
    for (const r of rows) {
      const deadline = odooTime(r.date_deadline);
      out.followUps.push({ tech: name(r.user_id) || 'Not assigned', ...(deadline !== undefined ? { deadline } : {}) });
    }
  } catch {
    // Follow-ups aren't readable for this user; the overview just leaves them out.
  }
  return out;
}
