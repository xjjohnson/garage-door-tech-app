/**
 * Red numbers for what needs a look in Warehouse and Purchasing (and, for a
 * tech, parts ready at the warehouse). Counted from Odoo on each sync, kept
 * here so the Tools tab, the area's list and its rows all read one answer.
 * Kept free of React so it can be tested directly.
 */
import type { OdooClient } from './odoo';
import { doubleBooked, lateJobs } from './dispatchAlerts';
import { listPurchases, toOrder } from './odooPurchasing';
import { addDays, startOfDay } from './schedule';
import { Access, openReceipts } from './odooWarehouse';

export interface Badges {
  /** Purchasing: under minimum (to order), draft orders to review, orders past their date. */
  purchasing: { toOrder: number; drafts: number; late: number };
  /** Warehouse: receipts waiting to come in. */
  warehouse: { receive: number };
  /** Dispatch: open jobs nobody is assigned to. */
  dispatch: { unassigned: number; noTime: number; late: number; double: number };
  /** A tech's own job parts that are ready to pick up at the warehouse. */
  ready: number;
}

export const NO_BADGES: Badges = { purchasing: { toOrder: 0, drafts: 0, late: 0 }, warehouse: { receive: 0 }, dispatch: { unassigned: 0, noTime: 0, late: 0, double: 0 }, ready: 0 };

/** Everything a buyer has waiting, as one number for the Purchasing row. */
export const purchasingTotal = (b: Badges): number => b.purchasing.toOrder + b.purchasing.drafts + b.purchasing.late;

/** Everything a dispatcher has waiting, as one number for the Dispatch row. */
export const dispatchTotal = (b: Badges): number => b.dispatch.unassigned + b.dispatch.noTime + b.dispatch.late + b.dispatch.double;

/** What the department rows and the More tab show: the sum of what the person's roles own, plus parts ready for them. */
export function toolsTotal(b: Badges, access: Pick<Access, 'warehouse' | 'purchasing'> & { dispatch?: boolean }): number {
  return (access.purchasing ? purchasingTotal(b) : 0) + (access.warehouse ? b.warehouse.receive : 0) + (access.dispatch ? dispatchTotal(b) : 0) + b.ready;
}

/** Counts from Odoo for the areas this person can open. A count Odoo can't answer stays 0, never an error. */
export async function computeBadges(client: OdooClient, access: Pick<Access, 'warehouse' | 'purchasing'> & { dispatch?: boolean }, ready: number, now = Date.now()): Promise<Badges> {
  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);
  const [orders, vendors, receipts, unassigned, noTime, today] = await Promise.all([
    access.purchasing ? safe(listPurchases(client, now), []) : Promise.resolve([]),
    access.purchasing ? safe(toOrder(client), []) : Promise.resolve([]),
    access.warehouse ? safe(openReceipts(client, now), []) : Promise.resolve([]),
    access.dispatch ? safe(client.unassignedTasks(), []) : Promise.resolve([]),
    access.dispatch ? safe(client.jobsWithoutTime(), []) : Promise.resolve([]),
    access.dispatch ? safe(client.jobsBetween(startOfDay(now), addDays(startOfDay(now), 1)), []) : Promise.resolve([]),
  ]);
  return {
    purchasing: {
      toOrder: vendors.reduce((n, v) => n + v.lines.length, 0),
      drafts: orders.filter((o) => o.group === 'draft').length,
      late: orders.filter((o) => o.late).length,
    },
    warehouse: { receive: receipts.length },
    dispatch: { unassigned: unassigned.length, noTime: noTime.length, late: lateJobs(today, now).length, double: doubleBooked(today).length },
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
