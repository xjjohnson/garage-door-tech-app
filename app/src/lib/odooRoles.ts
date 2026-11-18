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

export type RoleId = 'owner' | 'dispatch' | 'office' | 'sales' | 'warehouse' | 'buyer';

export const ROLE_INFO: { id: RoleId; label: string; detail: string; add: string; remove: string[] }[] = [
  { id: 'owner', label: 'Owner', detail: 'Management, business numbers, scorecard, Developer', add: 'fieldservice.group_fsm_manager', remove: ['fieldservice.group_fsm_manager'] },
  { id: 'dispatch', label: 'Dispatcher', detail: 'Dispatch: give out jobs, see each tech\'s day (the owner has this too)', add: 'fieldservice.group_fsm_dispatcher', remove: ['fieldservice.group_fsm_dispatcher'] },
  { id: 'office', label: 'Office', detail: 'Office: invoices, payments, quotes, customers. Gives Odoo Billing Administrator, which can do more in Odoo than a tech can.', add: 'account.group_account_manager', remove: ['account.group_account_manager'] },
  { id: 'sales', label: 'Sales', detail: 'Sales: quotes, follow-ups, renewals. Gives Odoo Sales Administrator, which can do more in Odoo than a tech can.', add: 'sales_team.group_sale_manager', remove: ['sales_team.group_sale_manager'] },
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
    dispatch: has('fieldservice.group_fsm_dispatcher'),
    office: has('account.group_account_manager'),
    sales: has('sales_team.group_sale_manager'),
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
  for (const r of ROLE_INFO) if (got[r.id] !== want[r.id] && !(r.id === 'dispatch' && got.owner)) throw new Error(`Odoo did not keep the ${r.label} change. Check the user in Odoo's Settings, Users.`);
  return got;
}

/** Whether this looks like an email address, which Odoo uses as the login. */
export const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/**
 * Makes a new Odoo user (an internal user, not a portal one) with these roles.
 * Only an Odoo administrator may; Odoo refuses anyone else. The login is the
 * email address. No password is set and nothing is emailed: the owner sends
 * Odoo's own invitation when ready (see `sendInvite`). Roles go through
 * `saveRoles`, so they are read back and a refusal is reported.
 */
export async function createPerson(c: Client, input: { name: string; email: string; roles: Roles }): Promise<Person> {
  if (!(await canChangeRoles(c))) throw new Error('Only an Odoo administrator can add people.');
  const name = input.name.trim();
  const email = input.email.trim();
  if (!name) throw new Error('Type their name.');
  if (!looksLikeEmail(email)) throw new Error('Type their email address. It is their login.');
  const taken = (await c.call('res.users', 'search_count', [[['login', '=ilike', email]]], { context: { active_test: false } })) as number;
  if (taken) throw new Error(`Odoo already has a user with the login ${email}. Find them in the list, or in Odoo's Settings, Users if they are archived.`);
  const id = (await c.call('res.users', 'create', [{ name, login: email, email }])) as number;
  if (typeof id !== 'number') throw new Error('Odoo did not make the user. Check Settings, Users.');
  try {
    await saveRoles(c, id, input.roles);
  } catch (e) {
    throw new Error(`${name} was made in Odoo, but their roles were not saved: ${e instanceof Error ? e.message : String(e)} Open them in the list to try again.`);
  }
  const person = (await listPeople(c)).find((p) => p.id === id);
  return person ?? { id, name, login: email, admin: false, roles: input.roles };
}

/** Sends Odoo's own invitation email (a link to set a password), the same as Send Password Reset Instructions on the user in Odoo. */
export async function sendInvite(c: Client, personId: number): Promise<void> {
  if (!(await canChangeRoles(c))) throw new Error('Only an Odoo administrator can send invitations.');
  await c.call('res.users', 'action_reset_password', [[personId]]);
}

/* ----------------------------------------------- Employee and worker links */

export type LinkState = 'linked' | 'missing' | 'unavailable';

export interface Links {
  employee: LinkState;
  worker: LinkState;
}

const m2o = (v: unknown): number => (Array.isArray(v) && typeof v[0] === 'number' ? v[0] : 0);

async function hasModel(c: Client, model: string): Promise<boolean> {
  try {
    const f = await c.call(model, 'fields_get', [], { attributes: ['type'] });
    return !!f && typeof f === 'object' && Object.keys(f as object).length > 0;
  } catch {
    return false;
  }
}

async function userRow(c: Client, personId: number): Promise<{ name: string; partner: number }> {
  const [u] = (await c.call('res.users', 'read', [[personId]], { fields: ['name', 'partner_id'] })) as Record<string, unknown>[];
  return { name: typeof u?.name === 'string' ? u.name : '', partner: m2o(u?.partner_id) };
}

/**
 * Whether this login has its employee record (time clock, profile) and its
 * Field Service worker (jobs can be given to them). The app finds both through
 * the login: the employee whose user it is, and the worker on the same contact.
 */
export async function linkStatus(c: Client, personId: number): Promise<Links> {
  const [hasEmp, hasWorker] = await Promise.all([hasModel(c, 'hr.employee'), c.session.kind === 'oca' ? hasModel(c, 'fsm.person') : Promise.resolve(false)]);
  const { partner } = await userRow(c, personId);
  const employee: LinkState = !hasEmp ? 'unavailable' : (await c.call('hr.employee', 'search_count', [[['user_id', '=', personId]]])) ? 'linked' : 'missing';
  const worker: LinkState = !hasWorker ? 'unavailable' : partner && (await c.call('fsm.person', 'search_count', [[['partner_id', '=', partner]]])) ? 'linked' : 'missing';
  return { employee, worker };
}

/** Links an existing employee with the same name that has no login yet, or makes a new one. Returns what it did. */
export async function linkEmployee(c: Client, personId: number): Promise<'linked' | 'created'> {
  if (!(await canChangeRoles(c))) throw new Error('Only an Odoo administrator can link employees.');
  const { name } = await userRow(c, personId);
  if (!name) throw new Error("Couldn't read this user in Odoo.");
  if ((await c.call('hr.employee', 'search_count', [[['user_id', '=', personId]]])) as number) return 'linked';
  const same = (await c.call('hr.employee', 'search_read', [[['user_id', '=', false], ['name', '=ilike', name]]], { fields: ['name'], limit: 2 })) as { id: number }[];
  if (same.length === 1) {
    await c.call('hr.employee', 'write', [[same[0]!.id], { user_id: personId }]);
    return 'linked';
  }
  await c.call('hr.employee', 'create', [{ name, user_id: personId }]);
  return 'created';
}

/** Makes this login's contact a Field Service worker, so jobs can be given to them. Returns what it did. */
export async function linkWorker(c: Client, personId: number): Promise<'linked' | 'created'> {
  if (!(await canChangeRoles(c))) throw new Error('Only an Odoo administrator can make Field Service workers.');
  const { partner } = await userRow(c, personId);
  if (!partner) throw new Error("This user has no contact in Odoo, so there is nothing to link.");
  const had = (await c.call('fsm.person', 'search_count', [[['partner_id', '=', partner]]])) as number;
  if (had) return 'linked';
  await c.call('fsm.person', 'create', [{ partner_id: partner }]);
  return 'created';
}
