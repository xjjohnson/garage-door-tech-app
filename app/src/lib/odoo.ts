/**
 * Talking to the business's Odoo: signing in, reading the jobs assigned to a
 * tech, and (for whoever dispatches) assigning jobs to techs. Uses Odoo's
 * JSON-RPC endpoint (/jsonrpc), which every Odoo since 8 has, with the user's
 * password or an API key (Odoo 14+: Preferences > Account Security > New API
 * key). Jobs are Field Service tasks when the Field Service app is installed,
 * otherwise ordinary Project tasks. Kept free of React; the network call is
 * passed in, so tests use a fake server.
 */
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
  /** True when the Field Service app is installed (project.task has is_fsm). */
  fsm: boolean;
  /** How tasks name their assignees: `user_ids` (Odoo 16+) or `user_id` (older). */
  assignField: 'user_ids' | 'user_id';
  /** False when neither Project nor Field Service is installed, so there are no jobs to read yet. */
  tasks: boolean;
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

async function rpc(fetchFn: Fetch, url: string, service: string, method: string, args: unknown[]): Promise<unknown> {
  let res;
  try {
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

export class OdooClient {
  constructor(
    private readonly fetchFn: Fetch,
    readonly session: OdooSession,
    private readonly secret: string,
  ) {}

  /** Signs in and works out which kind of tasks this Odoo has. */
  static async signIn(fetchFn: Fetch, login: OdooLogin, secret: string): Promise<OdooClient> {
    const url = cleanUrl(login.url);
    if (!url || !login.db.trim() || !login.login.trim() || !secret) throw new OdooError('Fill in the address, database, email and password or API key.', 'login');
    const uid = await rpc(fetchFn, url, 'common', 'authenticate', [login.db.trim(), login.login.trim(), secret, {}]);
    if (typeof uid !== 'number' || uid <= 0) throw new OdooError('Wrong email, password or API key.', 'login');
    const base = { url, db: login.db.trim(), login: login.login.trim(), uid };
    const probe = new OdooClient(fetchFn, { ...base, name: '', fsm: false, assignField: 'user_ids', tasks: true }, secret);
    const me = (await probe.call('res.users', 'read', [[uid]], { fields: ['name'] })) as { name?: string }[];
    const name = me[0]?.name ?? login.login;
    let fields: Record<string, unknown>;
    try {
      fields = (await probe.call('project.task', 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;
    } catch (e) {
      // No Project or Field Service app: signed in fine, just no jobs yet.
      if (e instanceof OdooError && /project\.task.*(doesn.t|does not) exist/i.test(e.message)) return new OdooClient(fetchFn, { ...base, name, fsm: false, assignField: 'user_ids', tasks: false }, secret);
      throw e;
    }
    return new OdooClient(fetchFn, { ...base, name, fsm: 'is_fsm' in fields, assignField: 'user_ids' in fields ? 'user_ids' : 'user_id', tasks: true }, secret);
  }

  call(model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<unknown> {
    const s = this.session;
    return rpc(this.fetchFn, s.url, 'object', 'execute_kw', [s.db, s.uid, this.secret, model, method, args, kwargs]);
  }

  private taskDomain(extra: unknown[]): unknown[] {
    return [...(this.session.fsm ? [['is_fsm', '=', true]] : []), ...extra];
  }

  private mine(uid: number): unknown[] {
    return this.session.assignField === 'user_ids' ? ['user_ids', 'in', [uid]] : ['user_id', '=', uid];
  }

  private unassigned(): unknown[] {
    return this.session.assignField === 'user_ids' ? ['user_ids', '=', false] : ['user_id', '=', false];
  }

  async readTasks(domain: unknown[]): Promise<OdooTask[]> {
    const fields = ['name', 'partner_id', 'planned_date_begin', 'date_deadline', 'stage_id', 'description', this.session.assignField, ...(this.session.fsm ? ['partner_phone', 'fsm_done'] : [])];
    const rows = (await this.call('project.task', 'search_read', [this.taskDomain([...domain, ['active', '=', true]])], { fields, limit: 200, order: 'planned_date_begin asc, id asc' })) as Record<string, unknown>[];
    const partnerIds = [...new Set(rows.map((r) => (Array.isArray(r.partner_id) ? (r.partner_id[0] as number) : 0)).filter(Boolean))];
    const partners = partnerIds.length
      ? ((await this.call('res.partner', 'read', [partnerIds], { fields: ['name', 'phone', 'mobile', 'street', 'city', 'zip'] })) as Record<string, unknown>[])
      : [];
    return rows.map((r) => toTask(r, partners, this.session.assignField));
  }

  /** Open jobs assigned to this tech (or to another user, for dispatch). */
  myTasks(uid = this.session.uid): Promise<OdooTask[]> {
    return this.readTasks([this.mine(uid), ...(this.session.fsm ? [['fsm_done', '=', false]] : [])]);
  }

  /** Open jobs nobody is assigned to. */
  unassignedTasks(): Promise<OdooTask[]> {
    return this.readTasks([this.unassigned(), ...(this.session.fsm ? [['fsm_done', '=', false]] : [])]);
  }

  /** The people who can be given jobs: internal users, by name. */
  async techs(): Promise<OdooUser[]> {
    const rows = (await this.call('res.users', 'search_read', [[['share', '=', false], ['active', '=', true]]], { fields: ['name', 'login'], order: 'name asc', limit: 100 })) as Record<string, unknown>[];
    return rows.map((r) => ({ id: r.id as number, name: str(r.name), login: str(r.login) }));
  }

  /** Gives a job to a tech (replacing whoever had it). */
  assign(taskId: number, userId: number): Promise<unknown> {
    const value = this.session.assignField === 'user_ids' ? [[6, 0, [userId]]] : userId;
    return this.call('project.task', 'write', [[taskId], { [this.session.assignField]: value }]);
  }

  /** Marks a Field Service job done, the way Odoo's own "Mark as done" button does. */
  async markDone(taskId: number): Promise<void> {
    if (!this.session.fsm) throw new OdooError('Marking done needs the Field Service app in Odoo. Close it in Odoo instead.', 'server');
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
