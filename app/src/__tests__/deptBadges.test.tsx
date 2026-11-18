import { fireEvent, render, screen } from '@testing-library/react-native';
import { CountBadge, SectionMenu } from '../components/SectionMenu';
import { computeBadges, getBadges, NO_BADGES, purchasingTotal, setBadges, toolsTotal } from '../lib/deptBadges';
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
    const b = { purchasing: { toOrder: 4, drafts: 2, late: 1 }, warehouse: { receive: 3 }, dispatch: { unassigned: 2, noTime: 1, late: 0, double: 0, upcoming: 5, waiting: 5 }, office: NO_BADGES.office, sales: NO_BADGES.sales, ready: 1 };
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
    expect(b.dispatch).toEqual({ unassigned: 3, noTime: 1, late: 1, double: 0, upcoming: 1, waiting: 2 });
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
