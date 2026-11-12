/**
 * Talking to the business's Odoo: signing in, reading the jobs assigned to a
 * tech, and (for whoever dispatches) assigning jobs to techs. Uses Odoo's
 * JSON-RPC endpoint (/jsonrpc), which every Odoo since 8 has, with the user's
 * password or an API key (Odoo 14+: Preferences > Account Security > New API
 * key). Jobs are Field Service tasks when the Field Service app is installed,
 * otherwise ordinary Project tasks. Kept free of React; the network call is
 * passed in, so tests use a fake server.
 */
import type { CustomerFields } from './customers';
import type { OdooPartner } from './customerSync';
import { pretendOffline } from './devFlags';
import { log } from './log';
import { Appointment } from './schedule';

export const ODOO_STORAGE_KEY = 'odoo/v1';

export interface OdooLogin {
  /** "https://acme.odoo.com" or a self-hosted address. */
  url: string;
  db: string;
  login: string;
}

export interface OdooSession extends OdooLogin {
  uid: number;
  name: string;
  /**
   * Where jobs live: `oca` is the community Field Service app (fsm.order),
   * `task` is Project tasks (with or without Enterprise Field Service), and
   * `none` means neither app is installed yet.
   */
  kind: 'oca' | 'task' | 'none';
  /** Who "me" is when assigning: the user id for tasks, the Field Service worker id for OCA orders (0 if this user isn't a worker). */
  me: number;
  /** True when Enterprise Field Service is installed (project.task has is_fsm). */
  fsm: boolean;
  /** How tasks name their assignees: `user_ids` (Odoo 16+) or `user_id` (older). Unused for OCA orders. */
  assignField: 'user_ids' | 'user_id';
  /** Optional fields this Odoo has on its jobs, so reads never ask for one that isn't there. */
  fields: string[];
  /** OCA only: whether fsm.stage has is_closed, to leave finished orders out. */
  closedStage?: boolean;
  /** Which other Odoo apps this user can reach, so the app only offers syncs that will work. */
  apps: OdooApps;
  /** Optional fields product.product has here (sale_ok, default_code). */
  productFields: string[];
}

export interface OdooApps {
  /** Products (product.product), from Sales, Invoicing or Inventory. */
  products: boolean;
  /** Quotations and sales orders (sale.order). */
  sales: boolean;
  /** Invoices (account.move). */
  invoicing: boolean;
}

export const NO_APPS: OdooApps = { products: false, sales: false, invoicing: false };

/** "Field Service, Sales, Invoicing, Products": what the app found, for the Team screen. */
export function appsFound(s: Pick<OdooSession, 'kind' | 'fsm' | 'apps'>): string[] {
  return [
    ...(s.kind === 'oca' || s.fsm ? ['Field Service'] : s.kind === 'task' ? ['Project'] : []),
    ...(s.apps.sales ? ['Sales'] : []),
    ...(s.apps.invoicing ? ['Invoicing'] : []),
    ...(s.apps.products ? ['Products'] : []),
  ];
}

/** A product as the price sheet sees it. */
export interface OdooProduct {
  id: number;
  name: string;
  /** Internal reference, if any. */
  code: string;
  /** Sales price in cents. */
  cents: number;
}

export type Fetch = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export class OdooError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'login' | 'server',
  ) {
    super(message);
  }
}

/** Tidies what the tech typed: adds https://, drops a trailing slash and /web or /odoo paths. */
export function cleanUrl(url: string): string {
  let u = url.trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  u = u.replace(/[?#].*$/, '').replace(/\/+(web|odoo)(\/.*)?$/i, '').replace(/\/+$/, '');
  return u;
}

/** The database name an odoo.com address usually uses: "acme" for acme.odoo.com. */
export function guessDb(url: string): string {
  const m = cleanUrl(url).match(/^https?:\/\/([^./]+)\.odoo\.com$/i);
  return m ? m[1] : '';
}

let rpcId = 0;

/** What a call was, for the log: "sale.order.create" or "sign in". Never what was sent. */
function callName(service: string, method: string, args: unknown[]): string {
  if (service === 'object' && typeof args[3] === 'string' && typeof args[4] === 'string') return `${args[3]}.${args[4]}`;
  if (service === 'common' && method === 'authenticate') return 'sign in';
  return `${service}.${method}`;
}

async function rpc(fetchFn: Fetch, url: string, service: string, method: string, args: unknown[]): Promise<unknown> {
  const name = callName(service, method, args);
  const started = Date.now();
  try {
    const result = await rpcOnce(fetchFn, url, service, method, args);
    log.info('odoo', `${name} ok ${Date.now() - started} ms`);
    return result;
  } catch (e) {
    log.warn('odoo', `${name} failed after ${Date.now() - started} ms: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

async function rpcOnce(fetchFn: Fetch, url: string, service: string, method: string, args: unknown[]): Promise<unknown> {
  let res;
  try {
    if (pretendOffline()) throw new Error('Pretend offline is on (Developer screen).');
    res = await fetchFn(`${url}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: ++rpcId }),
    });
  } catch {
    throw new OdooError("Couldn't reach Odoo. Check the address and the phone's internet.", 'network');
  }
  if (!res.ok) throw new OdooError(`Odoo answered with an error (${res.status}). Check the address.`, 'network');
  let data: { result?: unknown; error?: { message?: string; data?: { message?: string; name?: string } } };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new OdooError("That address doesn't look like an Odoo server.", 'network');
  }
  if (data.error) {
    const msg = data.error.data?.message || data.error.message || 'Odoo error';
    if (/AccessDenied|Access Denied/i.test(`${data.error.data?.name} ${msg}`)) throw new OdooError('Wrong email, password or API key.', 'login');
    if (/database .* does not exist|KeyError/i.test(msg)) throw new OdooError("That database name isn't on this Odoo.", 'login');
    throw new OdooError(msg, 'server');
  }
  return data.result;
}

const missingModel = (e: unknown, model: string) => e instanceof OdooError && new RegExp(`${model.replace('.', '\\.')}.*(doesn.t|does not) exist`, 'i').test(e.message);

/** Odoo wants datetimes as "2026-11-12 14:00:00" in UTC. */
export function toOdooTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

const TASK_OPTIONAL = ['planned_date_begin', 'date_deadline', 'description', 'partner_phone', 'fsm_done'];
const PARTNER_OPTIONAL = ['customer_rank', 'mobile'];
const PRODUCT_OPTIONAL = ['sale_ok', 'default_code'];
const ORDER_OPTIONAL = ['scheduled_date_start', 'date_start', 'description', 'todo', 'stage_id', 'date_end'];

type Caller = Pick<OdooClient, 'call'>;

/**
 * The Field Service worker (fsm.person) this user is. Odoo doesn't link the
 * two directly: a worker is a contact, and a worker made from Field Service >
 * Workers > New gets a contact of its own rather than the user's. So it tries,
 * in order: the user's own contact, the same email (the user's email or
 * login), and, when Odoo has just one worker, that one. 0 when none fits.
 */
export async function findWorker(c: Caller, user: { partner_id?: unknown; email?: unknown; login?: unknown }, login: string): Promise<number> {
  const find = async (domain: unknown[], limit = 1) => (await c.call('fsm.person', 'search_read', [domain], { fields: ['name'], limit })) as { id: number }[];
  const partnerId = Array.isArray(user.partner_id) ? (user.partner_id as number[])[0] : 0;
  if (partnerId) {
    const byPartner = await find([['partner_id', '=', partnerId]]);
    if (byPartner[0]) return byPartner[0].id;
  }
  const emails = [...new Set([user.email, user.login, login].filter((e): e is string => typeof e === 'string' && e.includes('@')).map((e) => e.trim().toLowerCase()))];
  for (const e of emails) {
    const byEmail = await find([['email', '=ilike', e]]);
    if (byEmail[0]) return byEmail[0].id;
  }
  const all = await find([['active', '=', true]], 2);
  return all.length === 1 ? all[0].id : 0;
}

export class OdooClient {
  constructor(
    private readonly fetchFn: Fetch,
    readonly session: OdooSession,
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** Signs in and works out which kind of jobs this Odoo has. */
  static async signIn(fetchFn: Fetch, login: OdooLogin, secret: string, now: () => number = Date.now): Promise<OdooClient> {
    const url = cleanUrl(login.url);
    if (!url || !login.db.trim() || !login.login.trim() || !secret) throw new OdooError('Fill in the address, database, email and password or API key.', 'login');
    const uid = await rpc(fetchFn, url, 'common', 'authenticate', [login.db.trim(), login.login.trim(), secret, {}]);
    if (typeof uid !== 'number' || uid <= 0) throw new OdooError('Wrong email, password or API key.', 'login');
    const base = { url, db: login.db.trim(), login: login.login.trim(), uid };
    const blank: OdooSession = { ...base, name: '', kind: 'none', me: uid, fsm: false, assignField: 'user_ids', fields: [], apps: NO_APPS, productFields: [] };
    const probe = new OdooClient(fetchFn, blank, secret, now);
    const me = (await probe.call('res.users', 'read', [[uid]], { fields: ['name', 'partner_id', 'email', 'login'] })) as { name?: string; partner_id?: unknown; email?: unknown; login?: unknown }[];
    const name = me[0]?.name ?? login.login;
    const fieldsOf = async (model: string) => {
      try {
        return (await probe.call(model, 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;
      } catch (e) {
        if (missingModel(e, model)) return null;
        throw e;
      }
    };
    // The other apps are optional: a model that's missing, or that this user can't read, just isn't offered.
    const maybe = (model: string) => fieldsOf(model).catch(() => null);
    const [product, sale, move] = await Promise.all([maybe('product.product'), maybe('sale.order'), maybe('account.move')]);
    const apps: OdooApps = { products: !!product, sales: !!sale, invoicing: !!move };
    const productFields = product ? PRODUCT_OPTIONAL.filter((f) => f in product) : [];
    const make = (s: Partial<OdooSession>) => new OdooClient(fetchFn, { ...blank, name, apps, productFields, ...s }, secret, now);

    // The community (OCA) Field Service app keeps jobs as fsm.order, given to workers (fsm.person).
    const order = await fieldsOf('fsm.order');
    if (order) {
      const worker = await findWorker(probe, me[0] ?? {}, login.login.trim());
      const stage = await fieldsOf('fsm.stage');
      return make({ kind: 'oca', me: worker, fields: ORDER_OPTIONAL.filter((f) => f in order), closedStage: !!stage && 'is_closed' in stage });
    }
    const task = await fieldsOf('project.task');
    if (!task) return make({ kind: 'none' });
    return make({ kind: 'task', fsm: 'is_fsm' in task, assignField: 'user_ids' in task ? 'user_ids' : 'user_id', fields: TASK_OPTIONAL.filter((f) => f in task) });
  }

  call(model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<unknown> {
    const s = this.session;
    return rpc(this.fetchFn, s.url, 'object', 'execute_kw', [s.db, s.uid, this.secret, model, method, args, kwargs]);
  }

  private has(f: string) {
    return this.session.fields.includes(f);
  }

  private productQuery(): { domain: unknown[]; fields: string[] } {
    const pf = this.session.productFields;
    return { domain: pf.includes('sale_ok') ? [['sale_ok', '=', true]] : [], fields: ['name', 'lst_price', ...(pf.includes('default_code') ? ['default_code'] : [])] };
  }

  /** Products that can be sold, by name or internal reference; all of them (up to the limit) for an empty search. */
  async products(search = '', limit = 50): Promise<OdooProduct[]> {
    if (!this.session.apps.products) return [];
    const q = search.trim();
    const { domain, fields } = this.productQuery();
    const match = q ? (fields.includes('default_code') ? ['|', ['name', 'ilike', q], ['default_code', 'ilike', q]] : [['name', 'ilike', q]]) : [];
    const rows = (await this.call('product.product', 'search_read', [[...domain, ...match]], { fields, limit, order: 'name asc' })) as Record<string, unknown>[];
    return rows.map(toProduct);
  }

  /** Every product that can be sold, for importing the price list (up to 2000). */
  async allProducts(): Promise<OdooProduct[]> {
    if (!this.session.apps.products) return [];
    const { domain, fields } = this.productQuery();
    const rows = (await this.call('product.product', 'search_read', [domain], { fields, limit: 2000, order: 'name asc' })) as Record<string, unknown>[];
    return rows.map(toProduct);
  }

  private partnerFieldsCache: Promise<string[]> | null = null;

  /** Optional res.partner fields this Odoo has (mobile went away in Odoo 19; customer_rank comes with Sales or Invoicing). */
  private partnerFields(): Promise<string[]> {
    if (!this.partnerFieldsCache) {
      this.partnerFieldsCache = (this.call('res.partner', 'fields_get', [], { attributes: ['type'] }) as Promise<Record<string, unknown>>).then((f) => PARTNER_OPTIONAL.filter((x) => x in f));
      this.partnerFieldsCache.catch(() => {
        this.partnerFieldsCache = null;
      });
    }
    return this.partnerFieldsCache;
  }

  /** The business's customers (contacts marked as customers once Sales or Invoicing is installed), up to 5000. */
  async partners(): Promise<OdooPartner[]> {
    const pf = await this.partnerFields();
    const domain = pf.includes('customer_rank') ? [['customer_rank', '>', 0]] : [['partner_share', '=', true], ['is_company', '=', false]];
    const fields = ['name', 'phone', 'email', 'street', 'street2', 'city', 'zip', 'comment', 'write_date', ...pf.filter((f) => f === 'mobile')];
    const rows = (await this.call('res.partner', 'search_read', [domain], { fields, limit: 5000, order: 'id asc' })) as Record<string, unknown>[];
    return rows.map(toPartner);
  }

  /** Makes a contact in Odoo for a customer from the phone, marked as a customer. Returns its id. */
  async createPartner(f: CustomerFields): Promise<number> {
    const pf = await this.partnerFields();
    const vals: Record<string, unknown> = { name: f.name, phone: f.phone || false, email: f.email || false, street: f.address || false, comment: f.notes ? escapeHtml(f.notes) : false };
    if (pf.includes('customer_rank')) vals.customer_rank = 1;
    return (await this.call('res.partner', 'create', [vals])) as number;
  }

  /** Sends a customer's changed name, phone or email to Odoo. */
  writePartner(id: number, f: Partial<CustomerFields>): Promise<unknown> {
    const vals: Record<string, unknown> = {};
    for (const k of ['name', 'phone', 'email'] as const) if (f[k] !== undefined) vals[k] = f[k] || false;
    return this.call('res.partner', 'write', [[id], vals]);
  }

  /** Marking done works with either Field Service app. */
  get canMarkDone(): boolean {
    return this.session.kind === 'oca' || this.session.fsm;
  }

  private open(): unknown[] {
    const s = this.session;
    if (s.kind === 'oca') return s.closedStage ? [['stage_id.is_closed', '=', false]] : [];
    return [...(s.fsm ? [['is_fsm', '=', true]] : []), ...(this.has('fsm_done') ? [['fsm_done', '=', false]] : []), ['active', '=', true]];
  }

  private assignedTo(id: number | false): unknown[] {
    const s = this.session;
    if (s.kind === 'oca') return ['person_id', '=', id];
    if (id === false) return [s.assignField, '=', false];
    return s.assignField === 'user_ids' ? ['user_ids', 'in', [id]] : ['user_id', '=', id];
  }

  private async readJobs(who: number | false): Promise<OdooTask[]> {
    const s = this.session;
    if (s.kind === 'none') return [];
    if (s.kind === 'oca') {
      const fields = ['name', 'location_id', 'person_id', ...s.fields];
      const order = this.has('scheduled_date_start') ? 'scheduled_date_start asc, id asc' : 'id asc';
      const rows = (await this.call('fsm.order', 'search_read', [[this.assignedTo(who), ...this.open()]], { fields, limit: 200, order })) as Record<string, unknown>[];
      const locIds = [...new Set(rows.map((r) => (Array.isArray(r.location_id) ? (r.location_id[0] as number) : 0)).filter(Boolean))];
      const locs = locIds.length ? ((await this.call('fsm.location', 'read', [locIds], { fields: ['name', 'phone', 'mobile', 'street', 'city', 'zip'] })) as Record<string, unknown>[]) : [];
      return rows.map((r) => orderToTask(r, locs));
    }
    const fields = ['name', 'partner_id', 'stage_id', s.assignField, ...s.fields];
    const order = this.has('planned_date_begin') ? 'planned_date_begin asc, id asc' : this.has('date_deadline') ? 'date_deadline asc, id asc' : 'id asc';
    const rows = (await this.call('project.task', 'search_read', [[this.assignedTo(who), ...this.open()]], { fields, limit: 200, order })) as Record<string, unknown>[];
    const partnerIds = [...new Set(rows.map((r) => (Array.isArray(r.partner_id) ? (r.partner_id[0] as number) : 0)).filter(Boolean))];
    const partners = partnerIds.length
      ? ((await this.call('res.partner', 'read', [partnerIds], { fields: ['name', 'phone', 'mobile', 'street', 'city', 'zip'] })) as Record<string, unknown>[])
      : [];
    return rows.map((r) => toTask(r, partners, s.assignField));
  }

  /** Open jobs assigned to this tech (or to another tech, for dispatch). */
  myTasks(who = this.session.me): Promise<OdooTask[]> {
    if (!who) return Promise.resolve([]);
    return this.readJobs(who);
  }

  /** Open jobs nobody is assigned to. */
  unassignedTasks(): Promise<OdooTask[]> {
    return this.readJobs(false);
  }

  /** The people who can be given jobs: Field Service workers, or internal users, by name. */
  async techs(): Promise<OdooUser[]> {
    const s = this.session;
    if (s.kind === 'none') return [];
    if (s.kind === 'oca') {
      const rows = (await this.call('fsm.person', 'search_read', [[['active', '=', true]]], { fields: ['name', 'email'], order: 'name asc', limit: 100 })) as Record<string, unknown>[];
      return rows.map((r) => ({ id: r.id as number, name: str(r.name), login: str(r.email) }));
    }
    const rows = (await this.call('res.users', 'search_read', [[['share', '=', false], ['active', '=', true]]], { fields: ['name', 'login'], order: 'name asc', limit: 100 })) as Record<string, unknown>[];
    return rows.map((r) => ({ id: r.id as number, name: str(r.name), login: str(r.login) }));
  }

  /** Gives a job to a tech (replacing whoever had it). */
  assign(taskId: number, techId: number): Promise<unknown> {
    const s = this.session;
    if (s.kind === 'oca') return this.call('fsm.order', 'write', [[taskId], { person_id: techId }]);
    const value = s.assignField === 'user_ids' ? [[6, 0, [techId]]] : techId;
    return this.call('project.task', 'write', [[taskId], { [s.assignField]: value }]);
  }

  /** Marks a job done the way Odoo's own button does. */
  async markDone(taskId: number): Promise<void> {
    const s = this.session;
    if (s.kind === 'oca') {
      // Odoo wants the actual end time filled in before an order can be completed.
      if (this.has('date_end')) await this.call('fsm.order', 'write', [[taskId], { date_end: toOdooTime(this.now()) }]);
      await this.call('fsm.order', 'action_complete', [[taskId]]);
      return;
    }
    if (!s.fsm) throw new OdooError('Marking done needs the Field Service app in Odoo. Close it in Odoo instead.', 'server');
    await this.call('project.task', 'action_fsm_validate', [[taskId]]);
  }
}

export interface OdooUser {
  id: number;
  name: string;
  login: string;
}

export interface OdooTask {
  id: number;
  name: string;
  customer: string;
  customerId?: number;
  phone: string;
  address: string;
  /** Planned start, ms, if set. */
  start?: number;
  /** Deadline, ms, if set. */
  deadline?: number;
  stage: string;
  notes: string;
  assignees: number[];
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

const escapeHtml = (t: string) =>
  `<p>${t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`;

function toPartner(r: Record<string, unknown>): OdooPartner {
  const street = [str(r.street), str(r.street2)].filter(Boolean).join(' ');
  const address = [street, [str(r.city), str(r.zip)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return {
    id: r.id as number,
    name: str(r.name),
    phone: str(r.phone) || str(r.mobile),
    email: str(r.email),
    address,
    notes: plainText(str(r.comment)),
    changedAt: odooTime(r.write_date) ?? 0,
  };
}

function toProduct(r: Record<string, unknown>): OdooProduct {
  const price = typeof r.lst_price === 'number' ? r.lst_price : 0;
  return { id: r.id as number, name: str(r.name), code: str(r.default_code), cents: Math.max(0, Math.round(price * 100)) };
}

/** Odoo sends datetimes as "2026-11-12 14:00:00" in UTC, and dates as "2026-11-12". */
export function odooTime(v: unknown): number | undefined {
  if (typeof v !== 'string' || !v) return undefined;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return undefined;
  if (m[4] === undefined) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9).getTime();
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
}

/** Odoo notes are HTML; keep the words. */
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toTask(r: Record<string, unknown>, partners: Record<string, unknown>[], assignField: OdooSession['assignField']): OdooTask {
  const pid = Array.isArray(r.partner_id) ? (r.partner_id[0] as number) : undefined;
  const p = partners.find((x) => x.id === pid) ?? {};
  const address = [str(p.street), [str(p.city), str(p.zip)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const a = r[assignField];
  const assignees = Array.isArray(a) ? (assignField === 'user_ids' ? (a as number[]) : [a[0] as number]) : [];
  return {
    id: r.id as number,
    name: str(r.name),
    customer: Array.isArray(r.partner_id) ? str(r.partner_id[1]) : '',
    ...(pid ? { customerId: pid } : {}),
    phone: str(r.partner_phone) || str(p.mobile) || str(p.phone),
    address,
    ...(odooTime(r.planned_date_begin) !== undefined ? { start: odooTime(r.planned_date_begin) } : {}),
    ...(odooTime(r.date_deadline) !== undefined ? { deadline: odooTime(r.date_deadline) } : {}),
    stage: Array.isArray(r.stage_id) ? str(r.stage_id[1]) : '',
    notes: plainText(str(r.description)),
    assignees: assignees.filter((n) => typeof n === 'number'),
  };
}

function orderToTask(r: Record<string, unknown>, locs: Record<string, unknown>[]): OdooTask {
  const lid = Array.isArray(r.location_id) ? (r.location_id[0] as number) : undefined;
  const l = locs.find((x) => x.id === lid) ?? {};
  const address = [str(l.street), [str(l.city), str(l.zip)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const start = odooTime(r.scheduled_date_start) ?? odooTime(r.date_start);
  const notes = [str(r.description), plainText(str(r.todo))].filter(Boolean).join('\n');
  return {
    id: r.id as number,
    name: str(r.name),
    customer: Array.isArray(r.location_id) ? str(r.location_id[1]) : '',
    phone: str(l.mobile) || str(l.phone),
    address,
    ...(start !== undefined ? { start } : {}),
    stage: Array.isArray(r.stage_id) ? str(r.stage_id[1]) : '',
    notes: plainText(notes),
    assignees: Array.isArray(r.person_id) ? [r.person_id[0] as number] : [],
  };
}

/** An Odoo job as a visit on the phone's schedule, so it shows with the day's other visits. */
export function taskToAppointment(t: OdooTask, now: number, existing?: Appointment): Appointment {
  const start = t.start ?? t.deadline ?? existing?.start ?? now;
  return {
    id: `odoo-${t.id}`,
    start,
    minutes: existing?.minutes ?? 60,
    ...(existing?.customerId ? { customerId: existing.customerId } : {}),
    name: t.customer || t.name,
    address: t.address,
    phone: t.phone,
    what: t.name,
    status: existing?.status ?? 'booked',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}
