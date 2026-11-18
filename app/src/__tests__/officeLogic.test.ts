import { callbacks, coveredNow, DAY_MS, JobVisit, lateCutoff, lostByReason, lostReason, markLost, monthsAgo, notSeen, parseWarranty } from '../lib/odooOffice';
import { DEFAULT_LIMITS, parseLimits } from '../lib/deptLimits';
import { offerUnsoldRepairs, REPAIR_REMINDERS_FROM, unsoldRepairs, whereOf } from '../lib/odooRepairs';
import { NO_BADGES, overviewTotal } from '../lib/deptBadges';
import { overviewGroups } from '../lib/ownerOverview';

const v = (id: number, place: number, daysAgo: number, now: number): JobVisit => ({ id, name: `J${id}`, place, placeName: `House ${place}`, tech: 'Sam', at: now - daysAgo * DAY_MS });
const NOW = Date.UTC(2026, 10, 18, 18);

describe('limits', () => {
  it('uses the approved defaults and ignores nonsense', () => {
    expect(DEFAULT_LIMITS).toEqual({ quoteQuietDays: 3, lateInvoiceDays: 1, invoiceLookbackDays: 60, notSeenMonths: 12, planRenewDays: 60, callbackDays: 30 });
    expect(parseLimits({ quoteQuietDays: 5, notSeenMonths: -2, planRenewDays: 'x' })).toEqual({ ...DEFAULT_LIMITS, quoteQuietDays: 5 });
    expect(parseLimits(null)).toEqual(DEFAULT_LIMITS);
  });
  it('counts an invoice late the day after it is due', () => {
    expect(lateCutoff(DEFAULT_LIMITS, NOW)).toBe('2026-11-17');
  });
});

describe('callbacks and not seen', () => {
  it('pairs visits to one house within 30 days', () => {
    const list = [v(1, 1, 20, NOW), v(2, 1, 5, NOW), v(3, 2, 90, NOW), v(4, 2, 5, NOW)];
    const c = callbacks(list, 30);
    expect(c).toHaveLength(1);
    expect(c[0]!.first.id).toBe(1);
    expect(c[0]!.again.id).toBe(2);
    expect(c[0]!.gapDays).toBe(15);
  });
  it('lists a customer whose newest visit is older than the cutoff', () => {
    const list = [v(1, 1, 500, NOW), v(2, 1, 400, NOW), v(3, 2, 30, NOW), v(4, 3, 380, NOW)];
    const r = notSeen(list, monthsAgo(NOW, 12));
    expect(r.map((x) => x.place)).toEqual([1, 3]);
    expect(r[0]!.id).toBe(2);
  });
});

describe('warranty', () => {
  it('reads the dates the app writes into equipment notes', () => {
    const w = parseWarranty('<p>Warranty on parts until Nov 2, 2028</p><p>Warranty on labor until Dec 1, 2026</p>');
    expect(new Date(w.partsUntil!).getFullYear()).toBe(2028);
    expect(new Date(w.laborUntil!).getMonth()).toBe(11);
    expect(parseWarranty('nothing here')).toEqual({});
  });
  it('lists only what is still covered, soonest ending first', () => {
    const items = [
      { equipmentId: 1, name: 'Opener', customer: 'A', notes: 'Warranty on parts until Nov 2, 2028' },
      { equipmentId: 2, name: 'Spring', customer: 'B', notes: 'Warranty on parts until Jan 5, 2027' },
      { equipmentId: 3, name: 'Roller', customer: 'C', notes: 'Warranty on parts until Jan 5, 2025' },
      { equipmentId: 4, name: 'Old', customer: 'D', notes: '' },
    ];
    expect(coveredNow(items, NOW).map((x) => x.equipmentId)).toEqual([2, 1]);
  });
});

describe('lost quotes', () => {
  it('reads the reason back from the note', () => {
    expect(lostReason('<p>Lost: Too expensive <small>johnsons-lost</small></p>')).toBe('Too expensive');
    expect(lostReason('<p>Hello</p>')).toBeUndefined();
    expect(lostByReason([{ orderId: 1, name: 'S1', customer: '', reason: 'Not now' }, { orderId: 2, name: 'S2', customer: '', reason: 'Not now' }, { orderId: 3, name: 'S3', customer: '', reason: 'Other' }])).toEqual([{ reason: 'Not now', count: 2 }, { reason: 'Other', count: 1 }]);
  });
  it('writes the note then cancels, and refuses a reason that is not on the list', async () => {
    const calls: string[] = [];
    const c = { session: {}, call: async (m: string, method: string) => (calls.push(`${m}.${method}`), true) } as never;
    await expect(markLost(c, 5, 'Whatever')).rejects.toThrow();
    expect(calls).toEqual([]);
    await markLost(c, 5, 'No answer');
    expect(calls).toEqual(['sale.order.message_post', 'sale.order.action_cancel']);
  });
});

describe('repairs not sold', () => {
  const insp = (o: Record<string, unknown>) => ({ at: REPAIR_REMINDERS_FROM + 1000, doors: [{ id: 'a' }, { id: 'b' }], repairs: [{ id: 'r1', label: 'Replace rollers', item: 'd:b:rollers' }, { id: 'r2', label: 'Typed by hand' }], ...o }) as never;
  it('finds flagged repairs that are not on any ticket, only for new inspections', () => {
    expect(unsoldRepairs(insp({}))).toEqual([{ id: 'r1', label: 'Replace rollers', where: 'Door 2' }]);
    expect(unsoldRepairs(insp({}), new Set(['r1']))).toEqual([]);
    expect(unsoldRepairs(insp({ at: REPAIR_REMINDERS_FROM - 1 }))).toEqual([]);
    expect(unsoldRepairs(undefined)).toEqual([]);
    expect(whereOf({ doors: [{ id: 'a' }] } as never, 'g:gate')).toBe('Gate');
  });
  it('makes one to-do per repair and never doubles it', async () => {
    const made: unknown[][] = [];
    let exists = false;
    const c = {
      session: { uid: 2 },
      call: async (m: string, method: string, args: unknown[]) => {
        if (m === 'ir.model') return [3];
        if (m === 'mail.activity' && method === 'search') return exists ? [9] : [];
        if (m === 'mail.activity' && method === 'create') {
          made.push(args);
          return 1;
        }
        return [];
      },
    } as never;
    const job = { id: 'j1', inspection: insp({}) };
    expect(await offerUnsoldRepairs(c, 7, job, NOW)).toBe(1);
    expect(JSON.stringify(made)).toContain('Offer repair: Replace rollers (Door 2)');
    exists = true;
    expect(await offerUnsoldRepairs(c, 7, job, NOW)).toBe(0);
    exists = false;
    const sold = { ...job, ticket: { lines: [{ repairId: 'r1' }] } as never };
    expect(await offerUnsoldRepairs(c, 7, sold, NOW)).toBe(0);
  });
});

describe('owner overview', () => {
  it('shows only areas and lines that need a look, busiest first', () => {
    expect(overviewGroups(NO_BADGES)).toEqual([]);
    const b = { ...NO_BADGES, office: { ...NO_BADGES.office, overdue: 2, notInvoiced: 3 }, sales: { ...NO_BADGES.sales, quiet: 1 } };
    const g = overviewGroups(b);
    expect(g.map((x) => x.area)).toEqual(['office', 'sales']);
    expect(g[0]!.lines.every((l) => l.n > 0)).toBe(true);
    expect(overviewTotal(b)).toBe(6);
  });
});
