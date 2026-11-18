import { canChangeRoles, listPeople, saveRoles } from '../lib/odooRoles';

const GROUPS: Record<string, number> = { 'base.group_system': 1, 'fieldservice.group_fsm_manager': 2, 'stock.group_stock_manager': 3, 'purchase.group_purchase_user': 4, 'purchase.group_purchase_manager': 5 };
type Call = [string, string, unknown[], Record<string, unknown>?];

function fake(opts: { actingGroups: number[]; people: Record<number, number[]>; refuseWrite?: boolean }) {
  const calls: Call[] = [];
  const people = { ...opts.people };
  const client = {
    session: { kind: 'oca', uid: 1 } as never,
    call: async (model: string, method: string, args: unknown[] = [], kw: Record<string, unknown> = {}) => {
      calls.push([model, method, args, kw]);
      const k = `${model}.${method}`;
      if (k === 'res.users.has_group') return opts.actingGroups.includes(GROUPS[args[1] as string] ?? -1);
      if (k === 'ir.model.data.search_read') return Object.entries(GROUPS).map(([x, id]) => ({ module: x.split('.')[0], name: x.split('.')[1], res_id: id }));
      if (k === 'res.users.fields_get') return { group_ids: {} };
      if (k === 'res.users.search_read') return Object.entries(people).map(([id, g]) => ({ id: Number(id), name: `User ${id}`, login: `u${id}`, group_ids: g }));
      if (k === 'res.users.read') return [{ id: (args[0] as number[])[0], group_ids: people[(args[0] as number[])[0]!] ?? [] }];
      if (k === 'res.users.write') {
        if (opts.refuseWrite) return true;
        const id = (args[0] as number[])[0]!;
        for (const [op, g] of (args[1] as { group_ids: [number, number][] }).group_ids) people[id] = op === 4 ? [...(people[id] ?? []), g] : (people[id] ?? []).filter((x) => x !== g);
        return true;
      }
      throw new Error(`unexpected ${k}`);
    },
  };
  return { client, calls, people };
}
const none = { owner: false, warehouse: false, buyer: false };

describe('team roles', () => {
  it('lists who holds which role', async () => {
    const { client } = fake({ actingGroups: [1], people: { 1: [1], 2: [3], 3: [5], 4: [] } });
    const p = await listPeople(client);
    expect(p.find((x) => x.id === 1)).toMatchObject({ admin: true });
    expect(p.find((x) => x.id === 2)!.roles).toEqual({ ...none, warehouse: true });
    expect(p.find((x) => x.id === 3)!.roles).toEqual({ ...none, buyer: true });
    expect(p.find((x) => x.id === 4)!.roles).toEqual(none);
  });

  it('only an Odoo admin can change roles, and nothing is written for anyone else', async () => {
    const { client, calls } = fake({ actingGroups: [2], people: { 4: [] } });
    expect(await canChangeRoles(client)).toBe(false);
    await expect(saveRoles(client, 4, { ...none, buyer: true })).rejects.toThrow(/administrator/);
    expect(calls.some((c) => c[1] === 'write')).toBe(false);
  });

  it('adds and removes only the role groups, never the Administrator group', async () => {
    const { client, calls, people } = fake({ actingGroups: [1], people: { 4: [3, 5] } });
    const r = await saveRoles(client, 4, { owner: true, warehouse: false, buyer: false });
    expect(r).toEqual({ ...none, owner: true });
    expect(people[4]!.sort()).toEqual([2]);
    const w = calls.find((c) => c[1] === 'write')!;
    expect(JSON.stringify(w[3] ?? w[2])).not.toContain('[4,1]');
    expect(JSON.stringify(w[2])).not.toContain('[3,1]');
  });

  it('says so when Odoo does not keep a change', async () => {
    const { client } = fake({ actingGroups: [1], people: { 4: [] }, refuseWrite: true });
    await expect(saveRoles(client, 4, { ...none, warehouse: true })).rejects.toThrow(/did not keep/);
  });
});
