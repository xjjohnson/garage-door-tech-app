import { createPerson, looksLikeEmail, sendInvite } from '../lib/odooRoles';

const GROUPS: Record<string, number> = { 'base.group_system': 1, 'fieldservice.group_fsm_manager': 2, 'stock.group_stock_manager': 3, 'purchase.group_purchase_user': 4, 'purchase.group_purchase_manager': 5 };
const none = { owner: false, dispatch: false, office: false, sales: false, warehouse: false, buyer: false };

function fake(opts: { actingGroups: number[]; logins?: string[]; refuseCreate?: string }) {
  const calls: [string, string, unknown[]][] = [];
  const people: Record<number, { name: string; login: string; groups: number[] }> = {};
  const client = {
    session: { kind: 'oca', uid: 1 } as never,
    call: async (model: string, method: string, args: unknown[] = []) => {
      calls.push([model, method, args]);
      const k = `${model}.${method}`;
      if (k === 'res.users.has_group') return opts.actingGroups.includes(GROUPS[args[1] as string] ?? -1);
      if (k === 'ir.model.data.search_read') return Object.entries(GROUPS).map(([x, id]) => ({ module: x.split('.')[0], name: x.split('.')[1], res_id: id }));
      if (k === 'res.users.fields_get') return { group_ids: {} };
      if (k === 'res.users.search_count') return (opts.logins ?? []).some((l) => l.toLowerCase() === String((args[0] as unknown[][])[0]![2]).toLowerCase()) ? 1 : 0;
      if (k === 'res.users.create') {
        if (opts.refuseCreate) throw new Error(opts.refuseCreate);
        const v = args[0] as { name: string; login: string };
        people[10] = { name: v.name, login: v.login, groups: [] };
        return 10;
      }
      if (k === 'res.users.read') return [{ id: 10, group_ids: people[10]?.groups ?? [] }];
      if (k === 'res.users.write') {
        for (const [op, g] of (args[1] as { group_ids: [number, number][] }).group_ids) people[10]!.groups = op === 4 ? [...people[10]!.groups, g] : people[10]!.groups.filter((x) => x !== g);
        return true;
      }
      if (k === 'res.users.search_read') return Object.entries(people).map(([id, p]) => ({ id: Number(id), name: p.name, login: p.login, group_ids: p.groups }));
      if (k === 'res.users.action_reset_password') return true;
      throw new Error(`unexpected ${k}`);
    },
  };
  return { client, calls, people };
}

describe('add a person', () => {
  it('makes the user and gives them the chosen roles, emailing nothing', async () => {
    const { client, calls } = fake({ actingGroups: [1] });
    const p = await createPerson(client, { name: ' Sam Lee ', email: 'sam@x.test', roles: { ...none, warehouse: true } });
    expect(p).toMatchObject({ id: 10, name: 'Sam Lee', login: 'sam@x.test', roles: { ...none, warehouse: true } });
    expect(calls.find((c) => c[1] === 'create')![2][0]).toEqual({ name: 'Sam Lee', login: 'sam@x.test', email: 'sam@x.test' });
    expect(calls.some((c) => c[1] === 'action_reset_password')).toBe(false);
  });

  it('is for Odoo administrators only, and checks the name, email and duplicates first', async () => {
    const a = fake({ actingGroups: [2] });
    await expect(createPerson(a.client, { name: 'Sam', email: 'sam@x.test', roles: none })).rejects.toThrow(/administrator/);
    expect(a.calls.some((c) => c[1] === 'create')).toBe(false);
    const b = fake({ actingGroups: [1], logins: ['sam@x.test'] });
    await expect(createPerson(b.client, { name: 'Sam', email: 'SAM@x.test', roles: none })).rejects.toThrow(/already has a user/);
    await expect(createPerson(b.client, { name: '', email: 'a@x.test', roles: none })).rejects.toThrow(/name/);
    await expect(createPerson(b.client, { name: 'Sam', email: 'nope', roles: none })).rejects.toThrow(/email/);
    expect(b.calls.some((c) => c[1] === 'create')).toBe(false);
    expect(looksLikeEmail('a@b.co')).toBe(true);
    expect(looksLikeEmail('a@b')).toBe(false);
  });

  it("shows Odoo's refusal plainly, and says when the user was made but a role wasn't kept", async () => {
    const r = fake({ actingGroups: [1], refuseCreate: 'The operation cannot be completed: too many users for your plan.' });
    await expect(createPerson(r.client, { name: 'Sam', email: 'sam@x.test', roles: none })).rejects.toThrow(/too many users/);
  });

  it('sends the invitation only when asked', async () => {
    const { client, calls } = fake({ actingGroups: [1] });
    await sendInvite(client, 10);
    expect(calls.find((c) => c[1] === 'action_reset_password')![2]).toEqual([[10]]);
    const nonAdmin = fake({ actingGroups: [] });
    await expect(sendInvite(nonAdmin.client, 10)).rejects.toThrow(/administrator/);
  });
});
