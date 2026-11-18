/**
 * Team roles: who is an owner, warehouse manager or buyer, kept as Odoo
 * groups on each user. The app only reads and writes those groups; Odoo is
 * still the one that decides. Only an Odoo administrator may change roles
 * (Odoo refuses anyone else), and the app never touches the Administrator
 * group itself, so it can't make or remove an Odoo admin. Kept free of React;
 * the client is passed in, so tests use a fake.
 */
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call' | 'session'>;

export type RoleId = 'owner' | 'warehouse' | 'buyer';

export const ROLE_INFO: { id: RoleId; label: string; detail: string; add: string; remove: string[] }[] = [
  { id: 'owner', label: 'Owner', detail: 'Management, business numbers, scorecard, Developer', add: 'fieldservice.group_fsm_manager', remove: ['fieldservice.group_fsm_manager'] },
  { id: 'warehouse', label: 'Warehouse manager', detail: 'Warehouse: counts, moves, receiving', add: 'stock.group_stock_manager', remove: ['stock.group_stock_manager'] },
  { id: 'buyer', label: 'Buyer', detail: 'Purchasing: what to order and purchase orders', add: 'purchase.group_purchase_user', remove: ['purchase.group_purchase_user', 'purchase.group_purchase_manager'] },
];

const ADMIN = 'base.group_system';

export interface Person {
  id: number;
  name: string;
  login: string;
  /** An Odoo administrator: an owner already, and not changed here. */
  admin: boolean;
  roles: Record<RoleId, boolean>;
}

type Roles = Record<RoleId, boolean>;

/** xml id to group id, for the groups this Odoo has. */
async function groupIds(c: Client, xmlids: string[]): Promise<Record<string, number>> {
  const names = xmlids.map((x) => x.split('.'));
  const domain = [['model', '=', 'res.groups'], ['module', 'in', [...new Set(names.map((n) => n[0]))]], ['name', 'in', names.map((n) => n[1])]];
  const rows = (await c.call('ir.model.data', 'search_read', [domain], { fields: ['module', 'name', 'res_id'] })) as { module?: string; name?: string; res_id?: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) if (r.module && r.name && typeof r.res_id === 'number' && xmlids.includes(`${r.module}.${r.name}`)) out[`${r.module}.${r.name}`] = r.res_id;
  return out;
}

/** Odoo 19 calls the user's group field group_ids; older ones groups_id. */
async function groupField(c: Client): Promise<string> {
  try {
    const f = (await c.call('res.users', 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;
    if ('group_ids' in f) return 'group_ids';
  } catch {
    // Use the older name.
  }
  return 'groups_id';
}

const ALL = [ADMIN, ...ROLE_INFO.flatMap((r) => [r.add, ...r.remove])].filter((x, i, a) => a.indexOf(x) === i);

function rolesOf(held: Set<number>, ids: Record<string, number>): Roles {
  const has = (x: string) => ids[x] !== undefined && held.has(ids[x]!);
  return {
    owner: has('fieldservice.group_fsm_manager'),
    warehouse: has('stock.group_stock_manager'),
    buyer: has('purchase.group_purchase_user') || has('purchase.group_purchase_manager'),
  };
}

/** Whether the signed-in user is an Odoo administrator, the only one who may change roles. */
export async function canChangeRoles(c: Client): Promise<boolean> {
  try {
    if ((await c.call('res.users', 'has_group', [[c.session.uid], ADMIN])) === true) return true;
  } catch {
    // Try reading the user's own groups.
  }
  try {
    const ids = await groupIds(c, [ADMIN]);
    const field = await groupField(c);
    const [me] = (await c.call('res.users', 'read', [[c.session.uid]], { fields: [field] })) as Record<string, unknown>[];
    const held = Array.isArray(me?.[field]) ? (me![field] as number[]) : [];
    return ids[ADMIN] !== undefined && held.includes(ids[ADMIN]!);
  } catch {
    return false;
  }
}

/** The people with an Odoo login (not portal users) and which roles each holds. */
export async function listPeople(c: Client): Promise<Person[]> {
  const ids = await groupIds(c, ALL);
  const field = await groupField(c);
  const rows = (await c.call('res.users', 'search_read', [[['share', '=', false], ['active', '=', true]]], { fields: ['name', 'login', field], order: 'name asc', limit: 200 })) as Record<string, unknown>[];
  return rows.map((r) => {
    const held = new Set(Array.isArray(r[field]) ? (r[field] as number[]) : []);
    return { id: r.id as number, name: typeof r.name === 'string' ? r.name : '', login: typeof r.login === 'string' ? r.login : '', admin: ids[ADMIN] !== undefined && held.has(ids[ADMIN]!), roles: rolesOf(held, ids) };
  }).filter((p) => p.name);
}

/**
 * Sets one person's roles in Odoo. Refuses unless the signed-in user is an
 * Odoo administrator, never touches the Administrator group, and reads the
 * person back afterwards so a change Odoo quietly refused isn't reported as
 * saved. Returns the roles Odoo now shows.
 */
export async function saveRoles(c: Client, personId: number, want: Roles): Promise<Roles> {
  if (!(await canChangeRoles(c))) throw new Error('Only an Odoo administrator can change roles.');
  const ids = await groupIds(c, ALL);
  const field = await groupField(c);
  const [now] = (await c.call('res.users', 'read', [[personId]], { fields: [field] })) as Record<string, unknown>[];
  const held = new Set(Array.isArray(now?.[field]) ? (now![field] as number[]) : []);
  const cmds: [number, number][] = [];
  for (const r of ROLE_INFO) {
    const has = rolesOf(held, ids)[r.id];
    if (want[r.id] && !has) {
      const g = ids[r.add];
      if (g === undefined) throw new Error(`${r.label} needs an Odoo app that isn't installed here.`);
      cmds.push([4, g]);
    } else if (!want[r.id] && has) {
      for (const x of r.remove) if (ids[x] !== undefined && held.has(ids[x]!)) cmds.push([3, ids[x]!]);
    }
  }
  if (cmds.length) await c.call('res.users', 'write', [[personId], { [field]: cmds }]);
  const [after] = (await c.call('res.users', 'read', [[personId]], { fields: [field] })) as Record<string, unknown>[];
  const got = rolesOf(new Set(Array.isArray(after?.[field]) ? (after![field] as number[]) : []), ids);
  for (const r of ROLE_INFO) if (got[r.id] !== want[r.id]) throw new Error(`Odoo did not keep the ${r.label} change. Check the user in Odoo's Settings, Users.`);
  return got;
}
