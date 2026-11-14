/**
 * Repeating visits (OCA Field Service Recurring, fsm.recurring) and service
 * agreements (OCA Agreement, agreement) as Odoo holds them, for a customer.
 * Read-only here: Odoo makes each upcoming order itself. Which fields exist
 * differs between versions, so only the ones fields_get lists are read. Kept
 * free of React; the client is passed in.
 */
import type { OdooClient } from './odoo';

type Caller = Pick<OdooClient, 'call' | 'session'>;

export interface RepeatRow {
  id: number;
  name: string;
  /** Odoo's state, as a label: Draft, Active, Paused or Closed. */
  status: string;
  active: boolean;
  /** The frequency set's name, such as "Yearly". */
  every?: string;
  start?: string;
  end?: string;
  /** The house the visits are at. */
  place?: string;
}

export interface AgreementRow {
  id: number;
  name: string;
  code?: string;
  status?: string;
  start?: string;
  end?: string;
  active: boolean;
}

const REPEAT_STATE: Record<string, string> = { draft: 'Draft', progress: 'Active', suspend: 'Paused', close: 'Closed' };

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const m2o = (v: unknown): string | undefined => (Array.isArray(v) && typeof v[1] === 'string' ? v[1] : undefined);

async function fieldsOf(c: Caller, model: string): Promise<string[] | null> {
  try {
    const f = (await c.call(model, 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;
    return f && typeof f === 'object' ? Object.keys(f) : null;
  } catch {
    // The app isn't installed, or this user can't see it.
    return null;
  }
}

/** Whether this Odoo has repeating visits and agreements, so the app only offers what works. */
export async function recurringSupport(c: Caller): Promise<{ repeats: boolean; agreements: boolean }> {
  const [r, a] = await Promise.all([fieldsOf(c, 'fsm.recurring'), fieldsOf(c, 'agreement')]);
  return { repeats: !!r && r.includes('location_id'), agreements: !!a && a.includes('partner_id') };
}

/** The repeating visits at this customer's houses. */
export async function fetchRepeats(c: Caller, partnerId: number, limit = 20): Promise<RepeatRow[]> {
  const have = await fieldsOf(c, 'fsm.recurring');
  if (!have || !partnerId) return [];
  const fields = ['name', 'state', 'fsm_frequency_set_id', 'start_date', 'end_date', 'location_id', 'active'].filter((f) => have.includes(f));
  const rows = (await c.call('fsm.recurring', 'search_read', [['|', ['location_id.owner_id', 'child_of', partnerId], ['location_id.partner_id', 'child_of', partnerId]]], { fields, order: 'id desc', limit })) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as number,
    name: str(r.name) ?? `#${r.id}`,
    status: REPEAT_STATE[str(r.state) ?? ''] ?? str(r.state) ?? '',
    active: r.active !== false,
    every: m2o(r.fsm_frequency_set_id),
    start: str(r.start_date),
    end: str(r.end_date),
    place: m2o(r.location_id),
  }));
}

/** The service agreements for this customer. */
export async function fetchAgreements(c: Caller, partnerId: number, limit = 20): Promise<AgreementRow[]> {
  const have = await fieldsOf(c, 'agreement');
  if (!have || !partnerId) return [];
  const fields = ['name', 'code', 'stage_id', 'start_date', 'end_date', 'active'].filter((f) => have.includes(f));
  const rows = (await c.call('agreement', 'search_read', [[['partner_id', 'child_of', partnerId]]], { fields, order: 'id desc', limit })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: str(r.name) ?? `#${r.id}`, code: str(r.code), status: m2o(r.stage_id), start: str(r.start_date), end: str(r.end_date), active: r.active !== false }));
}
