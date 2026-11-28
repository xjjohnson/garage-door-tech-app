/**
 * Red numbers for what needs a look in Warehouse and Purchasing (and, for a
 * tech, parts ready at the warehouse). Counted from Odoo on each sync, kept
 * here so the Tools tab, the area's list and its rows all read one answer.
 * Kept free of React so it can be tested directly.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OdooClient } from './odoo';
import { DEFAULT_LIMITS, DeptLimits } from './deptLimits';
import { doubleBooked, lateJobs } from './dispatchAlerts';
import { COMPLAINT, officeCounts, PARTS_REQUEST, recentCallbacks, salesCounts } from './odooOffice';
import { listPurchases, toOrder } from './odooPurchasing';
import { addDays, startOfDay } from './schedule';
import { Access, openReceipts, readyForTech } from './odooWarehouse';
import type { SectionId } from './sections';

export interface Badges {
  /** Purchasing: under minimum (to order), draft orders to review, orders past their date, parts asked for by sales. */
  purchasing: { toOrder: number; drafts: number; late: number; requests: number };
  /** Warehouse: receipts waiting to come in, and job parts received and waiting to be handed to a tech. */
  warehouse: { receive: number; handOver: number };
  /** Dispatch: open jobs nobody is assigned to. */
  dispatch: { unassigned: number; noTime: number; late: number; double: number; /** Visits planned in the next two weeks, and open jobs with no date. Shown on their rows, not added into the Dispatch total (they are not problems yet). */ upcoming: number; waiting: number };
  /** Office: orders waiting to be invoiced, invoices past due, sent quotes, jobs that came back, open complaints. */
  office: { notInvoiced: number; overdue: number; quotes: number; cameBack: number; complaints: number };
  /** Sales: quotes gone quiet, follow-ups due, plans about to renew, repairs flagged and not sold. */
  sales: { quiet: number; followUps: number; renewals: number; flagged: number };
  /** A tech's own job parts that are ready to pick up at the warehouse. */
  ready: number;
}

export const NO_BADGES: Badges = { purchasing: { toOrder: 0, drafts: 0, late: 0, requests: 0 }, warehouse: { receive: 0, handOver: 0 }, dispatch: { unassigned: 0, noTime: 0, late: 0, double: 0, upcoming: 0, waiting: 0 }, office: { notInvoiced: 0, overdue: 0, quotes: 0, cameBack: 0, complaints: 0 }, sales: { quiet: 0, followUps: 0, renewals: 0, flagged: 0 }, ready: 0 };

/** Everything a buyer has waiting, as one number for the Purchasing row. */
export const purchasingTotal = (b: Badges): number => b.purchasing.toOrder + b.purchasing.drafts + b.purchasing.late + b.purchasing.requests;

/** Everything a dispatcher has waiting, as one number for the Dispatch row. */
/** What Office needs, as one number for its row (sent quotes waiting are listed but not counted: they are not yet late). */
export const officeTotal = (b: Badges): number => b.office.notInvoiced + b.office.overdue + b.office.cameBack + b.office.complaints;

/** What Sales needs, as one number for its row. */
export const salesTotal = (b: Badges): number => b.sales.quiet + b.sales.followUps + b.sales.renewals + b.sales.flagged;

export const dispatchTotal = (b: Badges): number => b.dispatch.unassigned + b.dispatch.noTime + b.dispatch.late + b.dispatch.double;

/** Every red number the owner overview lists, as one number for its row. */
export const overviewTotal = (b: Badges): number => officeTotal(b) + salesTotal(b) + purchasingTotal(b) + dispatchTotal(b) + b.warehouse.receive + b.warehouse.handOver;

/** The one number a role's bubble shows: what needs a look in that role. */
export function roleBadge(b: Badges, role: 'tech' | 'dispatch' | 'office' | 'sales' | 'warehouse' | 'owner'): number {
  switch (role) {
    case 'tech':
      return b.ready;
    case 'dispatch':
      return dispatchTotal(b);
    case 'office':
      return officeTotal(b);
    case 'sales':
      return salesTotal(b);
    case 'warehouse':
      return purchasingTotal(b) + b.warehouse.receive + b.warehouse.handOver;
    case 'owner':
      return overviewTotal(b);
  }
}

/** What the department rows and the More tab show: the sum of what the person's roles own, plus parts ready for them. */
export function toolsTotal(b: Badges, access: Pick<Access, 'warehouse' | 'purchasing'> & { dispatch?: boolean; office?: boolean; sales?: boolean }): number {
  return (access.office ? officeTotal(b) : 0) + (access.sales ? salesTotal(b) : 0) + (access.purchasing ? purchasingTotal(b) : 0) + (access.warehouse ? b.warehouse.receive + b.warehouse.handOver : 0) + (access.dispatch ? dispatchTotal(b) : 0) + b.ready;
}

/**
 * Counts from Odoo for the areas this person can open. An area they cannot open counts 0. A count Odoo
 * could not answer this time keeps what it showed before (`previous`), so one slow or failed call never
 * wipes a real number off the screen.
 */
export async function computeBadges(client: OdooClient, access: Pick<Access, 'warehouse' | 'purchasing'> & { dispatch?: boolean; office?: boolean; sales?: boolean }, ready: number, now = Date.now(), limits: DeptLimits = DEFAULT_LIMITS, previous: Badges = NO_BADGES): Promise<Badges> {
  // null means "Odoo could not answer"; an empty answer for a closed area is a real zero.
  const ask = async <T>(open: boolean | undefined, p: () => Promise<T>, none: T): Promise<T | null> => (open ? Promise.resolve().then(p).catch(() => null) : none);
  const [orders, vendors, receipts, handOver, requests, unassigned, noTime, today, soon, undated, office, sales, complaints, callbackList] = await Promise.all([
    ask(access.purchasing, () => listPurchases(client, now), []),
    ask(access.purchasing, () => toOrder(client), []),
    ask(access.warehouse, () => openReceipts(client, now), []),
    ask(access.warehouse, () => readyForTech(client), []),
    ask(access.purchasing, () => client.call('mail.activity', 'search_count', [[['res_model', '=', 'res.partner'], ['summary', 'ilike', PARTS_REQUEST]]]).then(Number), 0),
    ask(access.dispatch, () => client.unassignedTasks(), []),
    ask(access.dispatch, () => client.jobsWithoutTime(), []),
    ask(access.dispatch, () => client.jobsBetween(startOfDay(now), addDays(startOfDay(now), 1)), []),
    ask(access.dispatch, () => client.jobsPlannedBetween(addDays(startOfDay(now), 1), addDays(startOfDay(now), 15)), []),
    ask(access.dispatch, () => client.jobsWithoutDate(), []),
    ask(access.office, () => officeCounts(client, limits, now), { notInvoiced: 0, overdue: 0, quotesWaiting: 0 }),
    ask(access.sales, () => salesCounts(client, limits, now), { quiet: 0, followUps: 0, renewals: 0, flagged: 0 }),
    ask(access.office, () => client.call('mail.activity', 'search_count', [[['res_model', '=', 'res.partner'], ['summary', 'ilike', COMPLAINT]]]).then(Number), 0),
    ask(access.office, () => recentCallbacks(client, limits, now), []),
  ]);
  const num = (n: number | null, was: number) => (n === null || !Number.isFinite(n) ? was : n);
  const p = previous;
  return {
    purchasing: {
      toOrder: vendors ? vendors.reduce((n, v) => n + v.lines.length, 0) : p.purchasing.toOrder,
      drafts: orders ? orders.filter((o) => o.group === 'draft').length : p.purchasing.drafts,
      late: orders ? orders.filter((o) => o.late).length : p.purchasing.late,
      requests: num(requests, p.purchasing.requests),
    },
    warehouse: { receive: receipts ? receipts.length : p.warehouse.receive, handOver: handOver ? handOver.length : p.warehouse.handOver },
    dispatch: {
      unassigned: unassigned ? unassigned.length : p.dispatch.unassigned,
      noTime: noTime ? noTime.length : p.dispatch.noTime,
      late: today ? lateJobs(today, now).length : p.dispatch.late,
      double: today ? doubleBooked(today).length : p.dispatch.double,
      upcoming: soon ? soon.length : p.dispatch.upcoming,
      waiting: undated ? undated.length : p.dispatch.waiting,
    },
    office: {
      notInvoiced: office ? office.notInvoiced : p.office.notInvoiced,
      overdue: office ? office.overdue : p.office.overdue,
      quotes: office ? office.quotesWaiting : p.office.quotes,
      cameBack: callbackList ? callbackList.length : p.office.cameBack,
      complaints: num(complaints, p.office.complaints),
    },
    sales: sales ? { quiet: sales.quiet, followUps: sales.followUps, renewals: sales.renewals, flagged: sales.flagged } : p.sales,
    ready,
  };
}

/**
 * The red number on each bottom tab, for the bar this person has. Each count sits on the one tab that
 * opens it, never on two, so the numbers on the bar never add up twice.
 */
export function tabBadges(kind: 'owner' | 'dispatcher' | 'sales' | 'office' | 'tech' | 'other', b: Badges, access: Pick<Access, 'warehouse' | 'purchasing'> & { dispatch?: boolean; office?: boolean; sales?: boolean }): Partial<Record<SectionId, number>> {
  switch (kind) {
    case 'owner':
      return { money: b.office.notInvoiced + b.office.overdue, areas: overviewTotal(b) };
    case 'dispatcher':
      return { needs: dispatchTotal(b), tools: b.ready };
    case 'sales':
      return { quotes: b.sales.quiet, tools: b.sales.followUps + b.sales.renewals + b.sales.flagged + b.ready };
    case 'office':
      return { officedesk: officeTotal(b), tools: b.ready };
    case 'tech':
      return { tools: b.ready };
    default:
      return { tools: toolsTotal(b, access) };
  }
}

// ---- A tiny shared store, so every screen reads the same numbers ----

let current: Badges = NO_BADGES;
const watchers = new Set<() => void>();

export const getBadges = (): Badges => current;

export function setBadges(b: Badges): void {
  current = b;
  watchers.forEach((w) => w());
}

export function onBadges(fn: () => void): () => void {
  watchers.add(fn);
  return () => {
    watchers.delete(fn);
  };
}

// ---- "Count again now": a screen asks for fresh numbers after the person changed something ----

const refreshers = new Set<() => void>();

/** Runs `fn` when a screen asks for fresh counts; returns the unsubscribe. */
export function onBadgeRefresh(fn: () => void): () => void {
  refreshers.add(fn);
  return () => {
    refreshers.delete(fn);
  };
}

/** Ask for a fresh count now (after sending an invoice, assigning a job, receiving an order...), so the red number matches the list. */
export function refreshBadges(): void {
  refreshers.forEach((r) => r());
}

// ---- The last counts, kept on the phone so the first screen already shows them ----

const badgeKey = (client: OdooClient) => `badges.last.${client.session.url}|${client.session.db}|${client.session.login}`;

/** The counts last seen for this login, or null when none were saved. */
export async function loadSavedBadges(client: OdooClient): Promise<Badges | null> {
  try {
    const raw = await AsyncStorage.getItem(badgeKey(client));
    const d = raw ? (JSON.parse(raw) as Partial<Badges>) : null;
    if (d && d.purchasing && d.warehouse && d.dispatch && d.office && d.sales && typeof d.ready === 'number') {
      // Counts saved by an older version may lack a newer number: fill it with 0 instead of leaving a blank.
      return { purchasing: { ...NO_BADGES.purchasing, ...d.purchasing }, warehouse: { ...NO_BADGES.warehouse, ...d.warehouse }, dispatch: { ...NO_BADGES.dispatch, ...d.dispatch }, office: { ...NO_BADGES.office, ...d.office }, sales: { ...NO_BADGES.sales, ...d.sales }, ready: d.ready };
    }
  } catch {
    // Nothing saved.
  }
  return null;
}

export function saveBadges(client: OdooClient, b: Badges): void {
  AsyncStorage.setItem(badgeKey(client), JSON.stringify(b)).catch(() => undefined);
}
