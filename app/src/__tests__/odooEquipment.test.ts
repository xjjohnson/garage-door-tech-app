import { DEFAULT_FOLLOW_UP } from '../lib/followups';
import { EMPTY_INSPECTION, Inspection } from '../lib/inspection';
import { equipmentFor, equipmentReady, equipmentToSend, mergeNotes, orderLocation, sendEquipment, warrantyLines } from '../lib/odooEquipment';

const insp = (): Inspection => {
  const i = EMPTY_INSPECTION(1_700_000_000_000);
  i.doors[0] = { ...i.doors[0], maker: 'Clopay', size: '16x7', age: '2015', springCode: '.234x2x32', motors: [{ ...i.doors[0].motors[0], maker: 'LiftMaster', built: '2019' }] };
  return i;
};
const ref = { model: 'fsm.order' as const, id: 5, name: 'FSO/0005' };

describe('equipmentFor', () => {
  it('makes a door and its opener, with the warranty on both', () => {
    const items = equipmentFor(insp(), ['Warranty on parts until Jan 1, 2028 (invoice 1004)']);
    expect(items.map((i) => [i.kind, i.name])).toEqual([['door', 'Garage door: Clopay 16x7'], ['opener', 'Opener: LiftMaster 2019']]);
    expect(items[0].lines).toEqual(expect.arrayContaining(['Maker: Clopay', 'Installed: 2015', 'Spring .234x2x32', 'Warranty on parts until Jan 1, 2028 (invoice 1004)']));
    expect(items[1].lines).toContain('Built: 2019');
  });
  it('skips an opener with nothing typed', () => {
    expect(equipmentFor(EMPTY_INSPECTION(1)).map((i) => i.kind)).toEqual(['door']);
  });
  it('writes warranty lines only for what is covered', () => {
    expect(warrantyLines({ partsUntil: null, laborUntil: null })).toEqual([]);
    expect(warrantyLines({ partsUntil: null, laborUntil: Date.UTC(2027, 5, 15, 12) })[0]).toMatch(/^Warranty on labor until Jun 15, 2027/);
  });
});

describe('mergeNotes', () => {
  const item = { key: 'd-1', lines: ['Maker: Clopay'] };
  it('adds the block after notes typed in Odoo and replaces only its own block later', () => {
    const first = mergeNotes('Gate code 1234', item);
    expect(first.startsWith('Gate code 1234')).toBe(true);
    const next = mergeNotes(first, { key: 'd-1', lines: ['Maker: Amarr'] });
    expect(next).toContain('Gate code 1234');
    expect(next).toContain('Maker: Amarr');
    expect(next).not.toContain('Clopay');
  });
});

describe('equipmentToSend', () => {
  const sigs = [{ for: 'inspection' as const, refId: 'j1', at: 500 }];
  const base = { id: 'j1', inspection: insp(), odooJob: ref };
  const inv = { jobId: 'j1', number: '1004', createdAt: 600, warranty: { partsMonths: 12, laborMonths: 0 }, source: 'ticket' as const, tier: 'good' as const };
  it('sends jobs signed since the start, and not twice', () => {
    expect(equipmentToSend([base], sigs, [], DEFAULT_FOLLOW_UP, 200)).toHaveLength(1);
    expect(equipmentToSend([base], sigs, [], DEFAULT_FOLLOW_UP, 900)).toHaveLength(0);
    expect(equipmentToSend([{ ...base, odooJob: undefined }], sigs, [], DEFAULT_FOLLOW_UP, 200)).toHaveLength(0);
    const [r] = equipmentToSend([base], sigs, [], DEFAULT_FOLLOW_UP, 200);
    const done = { ...base, inspection: { ...base.inspection, equipment: { at: 1, key: r.key } } };
    expect(equipmentToSend([done], sigs, [], DEFAULT_FOLLOW_UP, 200)).toHaveLength(0);
  });
  it('sends again when the job gets a warranty', () => {
    const [r] = equipmentToSend([base], sigs, [], DEFAULT_FOLLOW_UP, 200);
    const done = { ...base, inspection: { ...base.inspection, equipment: { at: 1, key: r.key } } };
    const again = equipmentToSend([done], sigs, [inv], DEFAULT_FOLLOW_UP, 200);
    expect(again).toHaveLength(1);
    expect(again[0].items[0].lines.some((l) => l.startsWith('Warranty on parts until'))).toBe(true);
  });
});

describe('sending to Odoo', () => {
  it('skips Odoo without equipment', async () => {
    expect(await equipmentReady({ call: async () => { throw new Error('Object fsm.equipment doesn\'t exist'); } })).toBeNull();
  });
  it('reads the order location, then updates one by key or name and creates the rest', async () => {
    const calls: [string, string, unknown[]][] = [];
    const rows = [{ id: 9, name: 'Garage door: Clopay 16x7', notes: 'Gate code 1234' }];
    const client = {
      call: async (model: string, method: string, args: unknown[]) => {
        calls.push([model, method, args]);
        if (model === 'fsm.order' && method === 'read') return [{ location_id: [77, 'Oak St'] }];
        if (method === 'search_read') return rows;
        return 1;
      },
    };
    expect(await orderLocation(client, 5)).toBe(77);
    const n = await sendEquipment(client, 77, equipmentFor(insp()), false);
    expect(n).toBe(2);
    const write = calls.find((c) => c[1] === 'write')!;
    expect(write[2][0]).toEqual([9]);
    expect((write[2][1] as { notes: string }).notes).toContain('Gate code 1234');
    const create = calls.find((c) => c[1] === 'create')!;
    expect((create[2][0] as { name: string; location_id: number }).location_id).toBe(77);
  });
});
