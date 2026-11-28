import { canChangeRoles, listPeople, saveRoles } from '../lib/odooRoles';

const GROUPS: Record<string, number> = { 'base.group_system': 1, 'fieldservice.group_fsm_manager': 2, 'stock.group_stock_manager': 3, 'purchase.group_purchase_user': 4, 'purchase.group_purchase_manager': 5, 'fieldservice.group_fsm_dispatcher': 6, 'fieldservice.group_fsm_user': 7 };
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
const none = { tech: false, owner: false, dispatch: false, office: false, sales: false, warehouse: false };

describe('team roles', () => {
  it('lists who holds which role', async () => {
    const { client } = fake({ actingGroups: [1], people: { 1: [1], 2: [3], 3: [5], 4: [] } });
    const p = await listPeople(client);
    expect(p.find((x) => x.id === 1)).toMatchObject({ admin: true });
    expect(p.find((x) => x.id === 2)!.roles).toEqual({ ...none, warehouse: true });
    expect(p.find((x) => x.id === 3)!.roles).toEqual({ ...none, warehouse: true }); // a Purchase User is the warehouse: it does the buying
    expect(p.find((x) => x.id === 4)!.roles).toEqual(none);
  });

  it('only an Odoo admin can change roles, and nothing is written for anyone else', async () => {
    const { client, calls } = fake({ actingGroups: [2], people: { 4: [] } });
    expect(await canChangeRoles(client)).toBe(false);
    await expect(saveRoles(client, 4, { ...none, warehouse: true })).rejects.toThrow(/administrator/);
    expect(calls.some((c) => c[1] === 'write')).toBe(false);
  });

  it('adds and removes only the role groups, never the Administrator group', async () => {
    const { client, calls, people } = fake({ actingGroups: [1], people: { 4: [3, 5] } });
    const r = await saveRoles(client, 4, { ...none, owner: true });
    expect(r).toEqual({ ...none, owner: true });
    expect(people[4]!.sort()).toEqual([2]);
    const w = calls.find((c) => c[1] === 'write')!;
    expect(JSON.stringify(w[3] ?? w[2])).not.toContain('[4,1]');
    expect(JSON.stringify(w[2])).not.toContain('[3,1]');
  });

  it('gives and takes away the Dispatcher role like the others', async () => {
    const { client, people } = fake({ actingGroups: [1], people: { 4: [] } });
    expect(await saveRoles(client, 4, { ...none, dispatch: true })).toEqual({ ...none, dispatch: true });
    expect(people[4]).toEqual([6]);
    expect(await saveRoles(client, 4, none)).toEqual(none);
    expect(people[4]).toEqual([]);
  });

  it('gives a warehouse manager Odoo\'s Purchase User group too, so ordering is accepted', async () => {
    const { client, people } = fake({ actingGroups: [1], people: { 4: [] } });
    expect(await saveRoles(client, 4, { ...none, warehouse: true })).toEqual({ ...none, warehouse: true });
    expect(people[4]!.sort()).toEqual([3, 4]);
  });

  it('says so when Odoo does not keep a change', async () => {
    const { client } = fake({ actingGroups: [1], people: { 4: [] }, refuseWrite: true });
    await expect(saveRoles(client, 4, { ...none, warehouse: true })).rejects.toThrow(/did not keep/);
  });
});

import { linkEmployee, linkStatus, linkWorker } from '../lib/odooRoles';

function linkFake(opts: { admin: boolean; employees: { id: number; name: string; user_id: number | false }[]; workers: number[] }) {
  const calls: Call[] = [];
  const emps = [...opts.employees];
  const workers = [...opts.workers];
  const client = {
    session: { kind: 'oca', uid: 1 } as never,
    call: async (model: string, method: string, args: unknown[] = [], kw: Record<string, unknown> = {}) => {
      calls.push([model, method, args, kw]);
      const k = `${model}.${method}`;
      if (k === 'res.users.has_group') return opts.admin;
      if (k.endsWith('.fields_get')) return { name: {} };
      if (k === 'res.users.read') return [{ id: 7, name: 'Sam Tech', partner_id: [70, 'Sam Tech'] }];
      if (k === 'hr.employee.search_count') return emps.filter((e) => e.user_id === 7).length;
      if (k === 'hr.employee.search_read') return emps.filter((e) => e.user_id === false && e.name.toLowerCase() === 'sam tech').map((e) => ({ id: e.id }));
      if (k === 'hr.employee.write') {
        emps.find((e) => e.id === (args[0] as number[])[0])!.user_id = 7;
        return true;
      }
      if (k === 'hr.employee.create') {
        emps.push({ id: 99, name: 'Sam Tech', user_id: 7 });
        return 99;
      }
      if (k === 'fsm.person.search_count') return workers.length;
      if (k === 'fsm.person.create') {
        workers.push(70);
        return 5;
      }
      throw new Error(`unexpected ${k}`);
    },
  };
  return { client, calls };
}

describe('employee and worker links', () => {
  it('says what is linked and what is missing', async () => {
    const { client } = linkFake({ admin: true, employees: [], workers: [70] });
    expect(await linkStatus(client, 7)).toEqual({ employee: 'missing', worker: 'linked' });
  });

  it('links an unlinked employee with the same name instead of making a second one', async () => {
    const { client, calls } = linkFake({ admin: true, employees: [{ id: 3, name: 'Sam Tech', user_id: false }], workers: [] });
    expect(await linkEmployee(client, 7)).toBe('linked');
    expect(calls.some((c) => c[1] === 'create')).toBe(false);
    expect((await linkStatus(client, 7)).employee).toBe('linked');
  });

  it('makes an employee and a worker when there are none, and only for an admin', async () => {
    const a = linkFake({ admin: true, employees: [], workers: [] });
    expect(await linkEmployee(a.client, 7)).toBe('created');
    expect(await linkWorker(a.client, 7)).toBe('created');
    expect(a.calls.find((c) => c[0] === 'fsm.person' && c[1] === 'create')![2]).toEqual([{ partner_id: 70 }]);
    const b = linkFake({ admin: false, employees: [], workers: [] });
    await expect(linkEmployee(b.client, 7)).rejects.toThrow(/administrator/);
    await expect(linkWorker(b.client, 7)).rejects.toThrow(/administrator/);
    expect(b.calls.some((c) => c[1] === 'create' || c[1] === 'write')).toBe(false);
  });

  it('Tech is Odoo\'s Field Service User group', async () => {
    const { client, people } = fake({ actingGroups: [1], people: { 4: [] } });
    expect(await saveRoles(client, 4, { ...none, tech: true })).toEqual({ ...none, tech: true });
    expect(people[4]).toEqual([7]);
    expect((await listPeople(client)).find((x) => x.id === 4)!.roles.tech).toBe(true);
  });

  it('takes Warehouse (and its buying) away together', async () => {
    const { client, people } = fake({ actingGroups: [1], people: { 4: [3, 4] } });
    expect(await saveRoles(client, 4, none)).toEqual(none);
    expect(people[4]).toEqual([]);
  });

  it('keeps Tech while the person is a dispatcher, since Odoo gives dispatchers Tech', async () => {
    const { client, people } = fake({ actingGroups: [1], people: { 4: [6, 7] } });
    await saveRoles(client, 4, { ...none, dispatch: true });
    expect(people[4]!.sort()).toEqual([6, 7]);
  });
});
