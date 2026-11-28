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
import { callbacks, COMPLAINT, officeCounts, readVisits, salesCounts } from './odooOffice';
import { listPurchases, toOrder } from './odooPurchasing';
import { addDays, startOfDay } from './schedule';
import { Access, openReceipts, readyForTech } from './odooWarehouse';

export interface Badges {
  /** Purchasing: under minimum (to order), draft orders to review, orders past their date. */
  purchasing: { toOrder: number; drafts: number; late: number };
  /** Warehouse: receipts waiting to come in, and job parts received and waiting to be handed to a tech. */
  warehouse: { receive: number; handOver: number };
  /** Dispatch: open jobs nobody is assigned to. */
  dispatch: { unassigned: number; noTime: number; late: number; double: number; /** Planned in the next 7 days with no tech, and open jobs with no date. Shown on their rows, not added into the Dispatch total (they overlap Not assigned). */ upcoming: number; waiting: number };
  /** Office: orders waiting to be invoiced, invoices past due, sent quotes, jobs that came back, open complaints. */
  office: { notInvoiced: number; overdue: number; quotes: number; cameBack: number; complaints: number };
  /** Sales: quotes gone quiet, follow-ups due, plans about to renew, repairs flagged and not sold. */
  sales: { quiet: number; followUps: number; renewals: number; flagged: number };
  /** A tech's own job parts that are ready to pick up at the warehouse. */
  ready: number;
}

export const NO_BADGES: Badges = { purchasing: { toOrder: 0, drafts: 0, late: 0 }, warehouse: { receive: 0, handOver: 0 }, dispatch: { unassigned: 0, noTime: 0, late: 0, double: 0, upcoming: 0, waiting: 0 }, office: { notInvoiced: 0, overdue: 0, quotes: 0, cameBack: 0, complaints: 0 }, sales: { quiet: 0, followUps: 0, renewals: 0, flagged: 0 }, ready: 0 };

/** Everything a buyer has waiting, as one number for the Purchasing row. */
export const purchasingTotal = (b: Badges): number => b.purchasing.toOrder + b.purchasing.drafts + b.purchasing.late;

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

/** Counts from Odoo for the areas this person can open. A count Odoo can't answer stays 0, never an error. */
export async function computeBadges(client: OdooClient, access: Pick<Access, 'warehouse' | 'purchasing'> & { dispatch?: boolean; office?: boolean; sales?: boolean }, ready: number, now = Date.now(), limits: DeptLimits = DEFAULT_LIMITS): Promise<Badges> {
  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);
  const [orders, vendors, receipts, handOver, unassigned, noTime, today, soon, undated, office, sales, complaints, visits] = await Promise.all([
    access.purchasing ? safe(listPurchases(client, now), []) : Promise.resolve([]),
    access.purchasing ? safe(toOrder(client), []) : Promise.resolve([]),
    access.warehouse ? safe(openReceipts(client, now), []) : Promise.resolve([]),
    access.warehouse ? safe(readyForTech(client), []) : Promise.resolve([]),
    access.dispatch ? safe(client.unassignedTasks(), []) : Promise.resolve([]),
    access.dispatch ? safe(client.jobsWithoutTime(), []) : Promise.resolve([]),
    access.dispatch ? safe(client.jobsBetween(startOfDay(now), addDays(startOfDay(now), 1)), []) : Promise.resolve([]),
    access.dispatch ? safe(client.jobsPlannedBetween(addDays(startOfDay(now), 1), addDays(startOfDay(now), 8)), []) : Promise.resolve([]),
    access.dispatch ? safe(client.jobsWithoutDate(), []) : Promise.resolve([]),
    access.office ? safe(officeCounts(client, limits, now), null) : Promise.resolve(null),
    access.sales ? safe(salesCounts(client, limits, now), null) : Promise.resolve(null),
    access.office ? safe(client.call('mail.activity', 'search_count', [[['res_model', '=', 'res.partner'], ['summary', 'ilike', COMPLAINT]]]).then(Number), 0) : Promise.resolve(0),
    access.office ? safe(readVisits(client, now - 2 * limits.callbackDays * 86_400_000), []) : Promise.resolve([]),
  ]);
  return {
    purchasing: {
      toOrder: vendors.reduce((n, v) => n + v.lines.length, 0),
      drafts: orders.filter((o) => o.group === 'draft').length,
      late: orders.filter((o) => o.late).length,
    },
    warehouse: { receive: receipts.length, handOver: handOver.length },
    dispatch: { unassigned: unassigned.length, noTime: noTime.length, late: lateJobs(today, now).length, double: doubleBooked(today).length, upcoming: soon.filter((t) => t.assignees.length === 0).length, waiting: undated.length },
    office: { notInvoiced: office?.notInvoiced ?? 0, overdue: office?.overdue ?? 0, quotes: office?.quotesWaiting ?? 0, cameBack: callbacks(visits, limits.callbackDays).filter((c) => c.again.at >= now - limits.callbackDays * 86_400_000).length, complaints: Number.isFinite(complaints) ? complaints : 0 },
    sales: { quiet: sales?.quiet ?? 0, followUps: sales?.followUps ?? 0, renewals: sales?.renewals ?? 0, flagged: sales?.flagged ?? 0 },
    ready,
  };
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

// ---- The last counts, kept on the phone so the first screen already shows them ----

const badgeKey = (client: OdooClient) => `badges.last.${client.session.url}|${client.session.db}|${client.session.login}`;

/** The counts last seen for this login, or null when none were saved. */
export async function loadSavedBadges(client: OdooClient): Promise<Badges | null> {
  try {
    const raw = await AsyncStorage.getItem(badgeKey(client));
    const d = raw ? (JSON.parse(raw) as Partial<Badges>) : null;
    if (d && d.purchasing && d.warehouse && d.dispatch && d.office && d.sales && typeof d.ready === 'number') return { ...NO_BADGES, ...d } as Badges;
  } catch {
    // Nothing saved.
  }
  return null;
}

export function saveBadges(client: OdooClient, b: Badges): void {
  AsyncStorage.setItem(badgeKey(client), JSON.stringify(b)).catch(() => undefined);
}
