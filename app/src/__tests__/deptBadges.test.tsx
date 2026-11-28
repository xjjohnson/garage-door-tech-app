import { fireEvent, render, screen } from '@testing-library/react-native';
import { CountBadge, SectionMenu } from '../components/SectionMenu';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Badges, computeBadges, getBadges, loadSavedBadges, NO_BADGES, onBadgeRefresh, overviewTotal, refreshBadges, saveBadges, purchasingTotal, setBadges, tabBadges, toolsTotal } from '../lib/deptBadges';
import { overviewGroups } from '../lib/ownerOverview';
import type { OdooClient } from '../lib/odoo';

const clientWith = (answers: Record<string, unknown>) =>
  ({
    call: async (model: string, method: string) => {
      const v = answers[`${model}.${method}`];
      if (v instanceof Error) throw v;
      return v ?? [];
    },
  }) as unknown as OdooClient;

describe('red numbers (plain logic)', () => {
  it('counts drafts, late orders, what is under minimum and receipts waiting', async () => {
    const now = Date.parse('2026-11-18T12:00:00Z');
    const client = clientWith({
      'purchase.order.search_read': [
        { id: 1, name: 'P1', partner_id: [5, 'ABC'], state: 'draft', amount_total: 10, date_planned: false },
        { id: 2, name: 'P2', partner_id: [5, 'ABC'], state: 'draft', amount_total: 10, date_planned: false },
        { id: 3, name: 'P3', partner_id: [5, 'ABC'], state: 'purchase', amount_total: 10, date_planned: '2026-11-10 12:00:00' },
      ],
      'stock.picking.search_read': [{ id: 9, name: 'WH/IN/1', partner_id: [5, 'ABC'], origin: 'P3', scheduled_date: '2026-11-10 12:00:00' }],
      'stock.move.search_read': [],
    });
    const b = await computeBadges(client, { warehouse: true, purchasing: true }, 2, now);
    expect(b.purchasing).toMatchObject({ drafts: 2, late: 1 });
    expect(b.warehouse.receive).toBe(1);
    expect(b.ready).toBe(2);
  });

  it('leaves out areas the person cannot open, and a failed count is 0 not an error', async () => {
    const client = clientWith({ 'purchase.order.search_read': new Error('no access'), 'stock.picking.search_read': new Error('no access') });
    expect(await computeBadges(client, { warehouse: false, purchasing: false }, 0)).toEqual(NO_BADGES);
    const b = await computeBadges(client, { warehouse: true, purchasing: true }, 0);
    expect(b.purchasing.drafts).toBe(0);
    expect(b.warehouse.receive).toBe(0);
  });

  it('adds up what each role owns, plus parts ready for a tech', () => {
    const b = { purchasing: { toOrder: 4, drafts: 2, late: 1, requests: 0 }, warehouse: { receive: 3, handOver: 0 }, dispatch: { unassigned: 2, noTime: 1, late: 0, double: 0, upcoming: 5, waiting: 5 }, office: NO_BADGES.office, sales: NO_BADGES.sales, ready: 1 };
    expect(purchasingTotal(b)).toBe(7);
    expect(toolsTotal(b, { warehouse: true, purchasing: true })).toBe(11);
    expect(toolsTotal(b, { warehouse: true, purchasing: false })).toBe(4);
    expect(toolsTotal(b, { warehouse: false, purchasing: false })).toBe(1);
    expect(toolsTotal(b, { warehouse: false, purchasing: false, dispatch: true })).toBe(4);
  });

  it('counts the jobs nobody has, only for a dispatcher', async () => {
    const client = {
      session: { kind: 'oca' },
      unassignedTasks: async () => [{ id: 1 }, { id: 2 }, { id: 3 }],
      jobsWithoutTime: async () => [{ id: 4 }],
      jobsWithoutDate: async () => [{ id: 7 }, { id: 8 }],
      jobsPlannedBetween: async () => [{ id: 9, assignees: [] }, { id: 10, assignees: [3] }],
      jobsBetween: async () => [{ id: 5, assignees: [7], start: Date.now() - 3600_000 }, { id: 6, assignees: [8], start: Date.now() - 3600_000, arrivedAt: Date.now() - 3000_000 }],
      call: async () => [],
    } as unknown as OdooClient;
    const b = await computeBadges(client, { warehouse: false, purchasing: false, dispatch: true }, 0);
    expect(b.dispatch).toEqual({ unassigned: 3, noTime: 1, late: 1, double: 0, upcoming: 2, waiting: 2 });
    expect((await computeBadges(client, { warehouse: false, purchasing: false }, 0)).dispatch.unassigned).toBe(0);
    const failing = { ...client, unassignedTasks: async () => { throw new Error('no access'); } } as unknown as OdooClient;
    expect((await computeBadges(failing, { warehouse: false, purchasing: false, dispatch: true }, 0)).dispatch.unassigned).toBe(0);
  });

  it('shares one answer through the store', () => {
    const b = { ...NO_BADGES, ready: 3 };
    setBadges(b);
    expect(getBadges()).toBe(b);
    setBadges(NO_BADGES);
  });
});

describe('saved counts', () => {
  const login = (name: string) => ({ session: { url: 'https://x.test', db: 'd', login: name }, call: async () => [] }) as unknown as OdooClient;
  it('keeps the last counts per login so the first screen can show them', async () => {
    const b = { ...NO_BADGES, ready: 3, office: { ...NO_BADGES.office, overdue: 9 } };
    expect(await loadSavedBadges(login('a'))).toBeNull();
    saveBadges(login('a'), b);
    expect(await loadSavedBadges(login('a'))).toMatchObject({ ready: 3, office: { overdue: 9 } });
    expect(await loadSavedBadges(login('b'))).toBeNull();
  });
});

describe('grouped list', () => {
  it('shows headings, rows with red numbers (none at 0) and opens a row', async () => {
    const onPick = jest.fn();
    await render(
      <SectionMenu
        groups={[
          { title: 'Right now', items: [{ id: 'a', label: 'Receive', badge: 3 }, { id: 'b', label: 'Overview', badge: 0 }] },
          { title: 'Records', items: [{ id: 'c', label: 'History' }] },
        ]}
        onPick={onPick}
        rowTestID={(id) => `row-${id}`}
      />,
    );
    expect(await screen.findByText('Right now')).toBeTruthy();
    expect(screen.getByTestId('row-a-badge')).toBeTruthy();
    expect(screen.queryByTestId('row-b-badge')).toBeNull();
    await fireEvent.press(screen.getByTestId('row-c'));
    expect(onPick).toHaveBeenCalledWith('c');
  });

  it('draws nothing for a zero count and 99+ for a big one', async () => {
    await render(<CountBadge n={0} testID="z" />);
    expect(screen.queryByTestId('z')).toBeNull();
    await render(<CountBadge n={150} testID="big" />);
    expect(await screen.findByText('99+')).toBeTruthy();
  });
});

describe('numbers match the screens they point to', () => {
  const full = { warehouse: true, purchasing: true, dispatch: true, office: true, sales: true };

  it('keeps the last number when Odoo cannot answer one count, instead of showing 0', async () => {
    const previous = { ...NO_BADGES, purchasing: { ...NO_BADGES.purchasing, drafts: 4, late: 2 }, warehouse: { receive: 6, handOver: 1 }, office: { ...NO_BADGES.office, overdue: 5, complaints: 3 } };
    const client = clientWith({ 'purchase.order.search_read': new Error('timeout'), 'stock.picking.search_read': new Error('timeout'), 'mail.activity.search_count': new Error('timeout') });
    const b = await computeBadges(client, full, 0, Date.now(), undefined, previous);
    expect(b.purchasing).toMatchObject({ drafts: 4, late: 2 });
    expect(b.warehouse.receive).toBe(6);
    expect(b.office.complaints).toBe(3);
    // An area the person cannot open is 0, whatever it showed before.
    expect((await computeBadges(client, { warehouse: false, purchasing: false }, 0, Date.now(), undefined, previous)).purchasing.drafts).toBe(0);
  });

  it('counts parts asked for by sales on the buyer, and not as follow-up calls', async () => {
    const asked: unknown[][] = [];
    const client = {
      session: { kind: 'oca' },
      call: async (model: string, method: string, args: unknown[][] = []) => {
        if (model === 'mail.activity' && method === 'search_count') {
          asked.push(args[0] as unknown[]);
          return JSON.stringify(args[0]).includes('Parts request:') && !JSON.stringify(args[0]).includes('not ilike') ? 2 : 0;
        }
        return [];
      },
    } as unknown as OdooClient;
    const b = await computeBadges(client, { warehouse: false, purchasing: true }, 0);
    expect(b.purchasing.requests).toBe(2);
    expect(purchasingTotal(b)).toBe(2);
    await computeBadges(client, { warehouse: false, purchasing: false, sales: true }, 0);
    const followUps = asked.map((d) => JSON.stringify(d)).find((d) => d.includes('date_deadline'));
    expect(followUps).toContain('"summary","not ilike","Parts request:"');
  });

  it('puts each count on one tab for each kind of bar', () => {
    const b = { ...NO_BADGES, ready: 1, dispatch: { ...NO_BADGES.dispatch, unassigned: 2, late: 1 }, office: { ...NO_BADGES.office, notInvoiced: 3, overdue: 2, complaints: 4 }, sales: { quiet: 5, followUps: 2, renewals: 1, flagged: 1 }, purchasing: { ...NO_BADGES.purchasing, toOrder: 1, requests: 2 }, warehouse: { receive: 2, handOver: 1 } };
    const none = { warehouse: false, purchasing: false };
    expect(tabBadges('owner', b, none)).toEqual({ money: 5, areas: overviewTotal(b) });
    expect(tabBadges('dispatcher', b, none)).toEqual({ needs: 3, tools: 1 });
    expect(tabBadges('office', b, none)).toEqual({ officedesk: 9, tools: 1 });
    // Sales: quiet quotes sit on Quotes; the rest of the Sales area sits on More. Nothing is counted twice.
    expect(tabBadges('sales', b, none)).toEqual({ quotes: 5, tools: 5 });
    expect(tabBadges('tech', b, none)).toEqual({ tools: 1 });
    expect(tabBadges('other', b, { warehouse: true, purchasing: true })).toEqual({ tools: 7 });
  });

  it('shows every part of the owner total as a line on the overview', () => {
    const b = { ...NO_BADGES, warehouse: { receive: 1, handOver: 2 }, purchasing: { ...NO_BADGES.purchasing, requests: 3 }, office: { ...NO_BADGES.office, quotes: 9 } };
    const lines = overviewGroups(b).flatMap((g) => g.lines);
    expect(lines.reduce((n, l) => n + l.n, 0)).toBe(overviewTotal(b));
  });

  it('fills a number an older version never saved with 0', async () => {
    const old = { purchasing: { toOrder: 2, drafts: 1, late: 0 }, warehouse: { receive: 0, handOver: 0 }, dispatch: { unassigned: 0, noTime: 0, late: 0, double: 0 }, office: { notInvoiced: 0, overdue: 0, quotes: 0, cameBack: 0, complaints: 0 }, sales: { quiet: 0, followUps: 0, renewals: 0, flagged: 0 }, ready: 0 };
    const c = { session: { url: 'https://old.test', db: 'd', login: 'z' }, call: async () => [] } as unknown as OdooClient;
    await AsyncStorage.setItem('badges.last.https://old.test|d|z', JSON.stringify(old));
    const got = await loadSavedBadges(c);
    expect(got?.purchasing.requests).toBe(0);
    expect(got?.dispatch.upcoming).toBe(0);
    expect(purchasingTotal(got as Badges)).toBe(3);
  });

  it('tells the screens to count again when asked', () => {
    const fn = jest.fn();
    const off = onBadgeRefresh(fn);
    refreshBadges();
    off();
    refreshBadges();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
