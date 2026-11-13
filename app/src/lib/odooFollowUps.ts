/**
 * Follow-ups from Odoo's own invoices, and each one as an Odoo activity on
 * the customer. A tune-up is worked out from every posted customer invoice in
 * Odoo (not only ones the phone made), and shows in Odoo as a to-do on the
 * customer's contact, so it is there for anyone and on every phone. Marking a
 * follow-up handled in the app completes the activity; completing or deleting
 * it in Odoo marks it handled in the app. Kept free of React.
 *
 * Only follow-ups due soon (a window around today) become activities, and at
 * most a few a pass, so old invoices never flood Odoo.
 */
import { FollowUp, DAY } from './followups';
import { Invoice } from './invoices';
import type { OdooClient } from './odoo';
import { toOdooTime } from './odoo';

type Caller = Pick<OdooClient, 'call' | 'session'>;

/** How far back Odoo invoices are read for follow-ups. */
export const INVOICE_LOOKBACK_DAYS = 430;
/** Follow-ups due this long ago, or sooner than this far ahead, become activities. */
export const ACTIVITY_PAST_DAYS = 14;
export const ACTIVITY_AHEAD_DAYS = 45;
/** Activities made in one pass. */
export const ACTIVITY_BATCH = 15;

export interface OdooInvoiceRow {
  id: number;
  name: string;
  partnerId: number;
  partnerName: string;
  at: number;
}

const day = (v: unknown): number | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = Date.parse(`${v.slice(0, 10)}T12:00:00`);
  return Number.isFinite(t) ? t : undefined;
};

/** Posted customer invoices from the last 14 months or so. */
export async function readOdooInvoices(client: Caller, now: number): Promise<OdooInvoiceRow[]> {
  const from = toOdooTime(now - INVOICE_LOOKBACK_DAYS * DAY).slice(0, 10);
  const rows = (await client.call('account.move', 'search_read', [[['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['invoice_date', '>=', from]]], { fields: ['name', 'partner_id', 'invoice_date'], limit: 1000, order: 'invoice_date desc' })) as Record<string, unknown>[];
  return rows.flatMap((r): OdooInvoiceRow[] => {
    const p = r.partner_id;
    const at = day(r.invoice_date);
    if (!Array.isArray(p) || typeof p[0] !== 'number' || at === undefined) return [];
    return [{ id: r.id as number, name: typeof r.name === 'string' ? r.name : '', partnerId: p[0], partnerName: typeof p[1] === 'string' ? p[1] : '', at }];
  });
}

/**
 * An Odoo invoice shaped like a phone one, so the follow-up list can use it.
 * It only brings tune-ups: Odoo does not say which spring option was put in.
 * `customerId` is the phone's customer for that Odoo contact, when there is one.
 */
export function asFollowUpInvoice(row: OdooInvoiceRow, customerId?: string): Invoice {
  return {
    id: `odoo-move-${row.id}`,
    number: row.name,
    jobId: `odoo-move-${row.id}`,
    ...(customerId ? { customerId } : {}),
    billTo: row.partnerName,
    address: `odoo-partner-${row.partnerId}`,
    tier: 'good',
    lines: [],
    subtotal: 0,
    tax: 0,
    total: 0,
    payments: [],
    createdAt: row.at,
    updatedAt: row.at,
    source: 'ticket',
    odoo: { id: row.id, name: row.name, total: 0, residual: 0, paymentState: 'paid', sentPayments: [], checkedAt: row.at },
  };
}

/** Odoo invoices the phone has no copy of. */
export function notOnPhone(rows: OdooInvoiceRow[], invoices: Pick<Invoice, 'odoo'>[]): OdooInvoiceRow[] {
  const have = new Set(invoices.flatMap((i) => (i.odoo ? [i.odoo.id] : [])));
  return rows.filter((r) => !have.has(r.id));
}

/** Follow-ups worth putting in Odoo now. */
export function activityWindow(list: FollowUp[], now: number): FollowUp[] {
  return list.filter((f) => f.due >= now - ACTIVITY_PAST_DAYS * DAY && f.due <= now + ACTIVITY_AHEAD_DAYS * DAY);
}

const marker = (id: string) => `johnsons-followup:${id}`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function todoType(client: Caller): Promise<number | undefined> {
  try {
    const [x] = (await client.call('ir.model.data', 'search_read', [[['module', '=', 'mail'], ['name', '=', 'mail_activity_data_todo']]], { fields: ['res_id'], limit: 1 })) as { res_id?: number }[];
    return x?.res_id || undefined;
  } catch {
    return undefined;
  }
}

/** Whether this Odoo has activities on contacts. */
export async function activitiesReady(client: Caller): Promise<boolean> {
  try {
    const f = (await client.call('mail.activity', 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;
    return 'res_model_id' in f && 'date_deadline' in f;
  } catch {
    return false;
  }
}

/**
 * The to-do on the customer's contact for a follow-up: the one already there
 * (found by the id in its note), else a new one. Returns its id.
 */
export async function ensureActivity(client: Caller, partnerId: number, f: FollowUp, id: string): Promise<number> {
  const found = (await client.call('mail.activity', 'search', [[['res_model', '=', 'res.partner'], ['res_id', '=', partnerId], ['note', 'ilike', marker(id)]]], { limit: 1 })) as number[];
  if (found[0]) return found[0];
  const [model] = (await client.call('ir.model', 'search', [[['model', '=', 'res.partner']]], { limit: 1 })) as number[];
  if (!model) throw new Error('Odoo has no contact model to put the to-do on.');
  const type = await todoType(client);
  return (await client.call('mail.activity', 'create', [
    {
      res_model_id: model,
      res_id: partnerId,
      summary: f.title,
      note: `<p>${esc(f.message)}</p><p><small>${marker(id)}</small></p>`,
      date_deadline: toOdooTime(f.due).slice(0, 10),
      user_id: client.session.uid,
      ...(type ? { activity_type_id: type } : {}),
    },
  ])) as number;
}

/** Which of these activities still exist. Odoo's read leaves a done or deleted one out of its answer. */
export async function liveActivities(client: Caller, ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const rows = (await client.call('mail.activity', 'read', [ids], { fields: ['id'] })) as { id: number }[];
  return new Set(rows.map((r) => r.id));
}

/** Completes an activity because the follow-up was handled in the app. */
export async function completeActivity(client: Caller, id: number): Promise<void> {
  await client.call('mail.activity', 'action_done', [[id]]);
}
