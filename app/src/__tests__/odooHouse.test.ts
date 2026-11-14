import { badgeText, fetchCustomerBadge, fetchHouseHistory, isRepeat, readEquipmentNotes, warrantyStatus } from '../lib/odooHouse';

const NOW = Date.UTC(2026, 10, 14, 12);

describe('readEquipmentNotes', () => {
  it('drops the app markers, keeps typed notes and finds warranty dates', () => {
    const r = readEquipmentNotes('<p>Gate code 1234</p><p>--- Johnsons app ---</p><p>johnsons-equipment:i1:0:0</p><p>Sold: Nov 14, 2026 (invoice 1004)</p><p>Warranty on parts until Nov 14, 2027 (invoice 1004)</p><p>Warranty on labor until Feb 12, 2027 (invoice 1004)</p><p>--- end ---</p>');
    expect(r.lines).toEqual(['Gate code 1234', 'Sold: Nov 14, 2026 (invoice 1004)', 'Warranty on parts until Nov 14, 2027 (invoice 1004)', 'Warranty on labor until Feb 12, 2027 (invoice 1004)']);
    expect(new Date(r.partsUntil!).getFullYear()).toBe(2027);
    expect(new Date(r.laborUntil!).getMonth()).toBe(1);
  });
  it('has no dates when none are written', () => {
    expect(readEquipmentNotes('Old Clopay door')).toEqual({ lines: ['Old Clopay door'] });
  });
});

describe('warrantyStatus', () => {
  it('says in warranty until the later date, or that it ended', () => {
    expect(warrantyStatus({ partsUntil: Date.UTC(2027, 10, 14, 12), laborUntil: Date.UTC(2027, 1, 12, 12) }, NOW)).toEqual({ text: 'In warranty until Nov 14, 2027', active: true });
    expect(warrantyStatus({ laborUntil: Date.UTC(2026, 0, 5, 12) }, NOW)).toEqual({ text: 'Warranty ended Jan 5, 2026', active: false });
    expect(warrantyStatus({}, NOW)).toBeNull();
  });
});

type Call = [string, string, unknown[]];
const fake = (answers: (model: string, method: string, args: unknown[]) => unknown, kind: 'oca' | 'task' = 'oca') => {
  const calls: Call[] = [];
  return {
    calls,
    client: {
      session: { kind } as never,
      call: async (m: string, f: string, a: unknown[]) => {
        calls.push([m, f, a]);
        return answers(m, f, a);
      },
    },
  };
};

describe('fetchHouseHistory', () => {
  it('reads the house equipment and earlier visits, leaving out this job', async () => {
    const { client, calls } = fake((m, f) => {
      if (f === 'fields_get') return m === 'fsm.equipment' ? { name: {}, location_id: {}, notes: {} } : { name: {}, location_id: {}, stage_id: {}, description: {}, scheduled_date_start: {}, date_end: {} };
      if (m === 'fsm.equipment') return [{ id: 4, name: 'Clopay 16x7 Door', notes: '<p>Warranty on parts until Nov 14, 2027</p>' }];
      return [
        { id: 20, name: 'FSM/20', stage_id: [3, 'Completed'], description: '<p>Broken spring</p>', date_end: '2026-06-01 15:00:00' },
        { id: 11, name: 'FSM/11', stage_id: [1, 'New'], description: false, scheduled_date_start: '2027-01-01 15:00:00' },
      ];
    });
    const h = await fetchHouseHistory(client, 77, 30, NOW);
    expect(h.equipment.map((e) => e.name)).toEqual(['Clopay 16x7 Door']);
    expect(h.visits.map((v) => [v.name, v.stage, v.what])).toEqual([
      ['FSM/20', 'Completed', 'Broken spring'],
      ['FSM/11', 'New', ''],
    ]);
    expect(h.lastVisit).toBe(Date.UTC(2026, 5, 1, 15));
    const search = calls.find((c) => c[0] === 'fsm.order' && c[1] === 'search_read')!;
    expect(JSON.stringify(search[2])).toContain('["id","!=",30]');
  });
  it('shows what it can on an Odoo without equipment', async () => {
    const { client } = fake((m, f) => {
      if (f === 'fields_get') {
        if (m === 'fsm.equipment') throw new Error('no such model');
        return { name: {}, location_id: {} };
      }
      return [];
    });
    const h = await fetchHouseHistory(client, 77, undefined, NOW);
    expect(h.equipment).toEqual([]);
    expect(h.visits).toEqual([]);
  });
});

describe('fetchCustomerBadge', () => {
  it('counts finished visits and adds posted invoices less credit notes', async () => {
    const { client } = fake((m, f) => (f === 'search_count' ? 12 : [{ move_type: 'out_invoice', amount_total: 500 }, { move_type: 'out_invoice', amount_total: 4400.5 }, { move_type: 'out_refund', amount_total: 100.5 }]));
    expect(await fetchCustomerBadge(client, 9, NOW)).toEqual({ visits: 12, spend: 480000, at: NOW });
  });
  it('counts all visits when this Odoo has no closed flag on stages', async () => {
    let n = 0;
    const { client } = fake((m, f) => {
      if (f === 'search_count') {
        if (n++ === 0) throw new Error('bad field is_closed');
        return 3;
      }
      return [];
    });
    expect((await fetchCustomerBadge(client, 9, NOW)).visits).toBe(3);
  });
  it('skips visits on task-based Odoo', async () => {
    const { client } = fake(() => [], 'task');
    expect((await fetchCustomerBadge(client, 9, NOW)).visits).toBe(0);
  });
});

describe('badge text', () => {
  const money = (c: number) => `$${c / 100}`;
  it('reads like 12 visits · $4800 spent, and nothing for no history', () => {
    expect(badgeText({ visits: 12, spend: 480000 }, money)).toBe('12 visits · $4800 spent');
    expect(badgeText({ visits: 1, spend: 0 }, money)).toBe('1 visit');
    expect(badgeText({ visits: 0, spend: 0 }, money)).toBeNull();
  });
  it('is a repeat customer from two visits', () => {
    expect(isRepeat({ visits: 1 })).toBe(false);
    expect(isRepeat({ visits: 2 })).toBe(true);
  });
});
