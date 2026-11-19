/**
 * How much work each customer has in Odoo, for the Customers list: Field
 * Service jobs (at the customer's locations, or for them or a contact under
 * them) and sales orders. The phone's own saved jobs are only the ones made
 * here, so the list can't count from them alone. Read in a few calls for
 * everyone, then rolled up to the parent contact.
 */
import type { OdooClient } from './odoo';

type Caller = Pick<OdooClient, 'call' | 'session'>;

export interface CustomerCounts {
  /** Field Service jobs, finished ones included. */
  jobs: number;
  /** Of those, not finished yet. */
  open: number;
  /** Quotations and sales orders. */
  quotes: number;
  /** Unpaid invoice balance in cents, left out when nothing is owed. */
  owed?: number;
}

export const CUSTOMER_COUNTS_STORAGE_KEY = 'odoo-customer-counts/v1';
const LIMIT = 3000;

const many2one = (v: unknown): number => (Array.isArray(v) && typeof v[0] === 'number' ? v[0] : 0);

const bump = (m: Map<number, CustomerCounts>, id: number, k: 'jobs' | 'open' | 'quotes') => {
  if (!id) return;
  const c = m.get(id) ?? { jobs: 0, open: 0, quotes: 0 };
  c[k]++;
  m.set(id, c);
};

/** Counts per Odoo contact id, with a contact under a customer counted for the customer. */
export async function fetchCustomerCounts(c: Caller): Promise<Record<number, CustomerCounts>> {
  const s = c.session;
  const own = new Map<number, CustomerCounts>();

  if (s.kind === 'oca') {
    try {
      const orders = (await c.call('fsm.order', 'search_read', [[]], { fields: ['location_id'], limit: LIMIT, order: 'id desc' })) as Record<string, unknown>[];
      let done = new Set<number>();
      if (s.closedStage) {
        const closed = (await c.call('fsm.order', 'search_read', [[['stage_id.is_closed', '=', true]]], { fields: ['id'], limit: LIMIT })) as { id: number }[];
        done = new Set(closed.map((r) => r.id));
      }
      const locIds = [...new Set(orders.map((o) => many2one(o.location_id)).filter(Boolean))];
      const locs = locIds.length ? ((await c.call('fsm.location', 'read', [locIds], { fields: ['owner_id', 'partner_id'] })) as Record<string, unknown>[]) : [];
      const who = new Map(locs.map((l) => [l.id as number, many2one(l.owner_id) || many2one(l.partner_id)]));
      for (const o of orders) {
        const p = who.get(many2one(o.location_id)) ?? 0;
        bump(own, p, 'jobs');
        if (!done.has(o.id as number)) bump(own, p, 'open');
      }
    } catch {
      /* no Field Service here, or no signal: the jobs stay uncounted */
    }
  } else if (s.kind === 'task') {
    try {
      const tasks = (await c.call('project.task', 'search_read', [[...(s.fsm ? [['is_fsm', '=', true]] : [])]], { fields: ['partner_id', ...(s.fields.includes('fsm_done') ? ['fsm_done'] : [])], limit: LIMIT, order: 'id desc' })) as Record<string, unknown>[];
      for (const t of tasks) {
        const p = many2one(t.partner_id);
        bump(own, p, 'jobs');
        if (!t.fsm_done) bump(own, p, 'open');
      }
    } catch {
      /* uncounted */
    }
  }

  try {
    const sales = (await c.call('sale.order', 'search_read', [[['state', '!=', 'cancel']]], { fields: ['partner_id'], limit: LIMIT, order: 'id desc' })) as Record<string, unknown>[];
    for (const o of sales) bump(own, many2one(o.partner_id), 'quotes');
  } catch {
    /* no Sales app */
  }

  // What each contact still owes on posted, unpaid or part-paid invoices, in cents.
  try {
    const inv = (await c.call('account.move', 'search_read', [[['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['payment_state', 'in', ['not_paid', 'partial']]]], { fields: ['partner_id', 'amount_residual'], limit: LIMIT })) as Record<string, unknown>[];
    for (const r of inv) {
      const id = many2one(r.partner_id);
      const cents = Math.round(Number(r.amount_residual ?? 0) * 100);
      if (!id || !(cents > 0)) continue;
      const c0 = own.get(id) ?? { jobs: 0, open: 0, quotes: 0 };
      c0.owed = (c0.owed ?? 0) + cents;
      own.set(id, c0);
    }
  } catch {
    /* no Accounting, or no signal: owed stays unknown */
  }

  // A contact under a customer (a house, an accounts person) counts for the customer.
  const ids = [...own.keys()];
  const parent = new Map<number, number>();
  if (ids.length) {
    try {
      const rows = (await c.call('res.partner', 'read', [ids], { fields: ['parent_id'] })) as Record<string, unknown>[];
      for (const r of rows) parent.set(r.id as number, many2one(r.parent_id));
    } catch {
      /* counted at the contact itself */
    }
  }
  const out: Record<number, CustomerCounts> = {};
  for (const [id, n] of own) {
    for (const target of new Set([id, parent.get(id) ?? 0])) {
      if (!target) continue;
      const t = (out[target] ??= { jobs: 0, open: 0, quotes: 0 });
      t.jobs += n.jobs;
      t.open += n.open;
      t.quotes += n.quotes;
      if (n.owed) t.owed = (t.owed ?? 0) + n.owed;
    }
  }
  return out;
}

export function parseSavedCounts(raw: string | null): Record<number, CustomerCounts> {
  try {
    const d = raw ? JSON.parse(raw) : null;
    if (!d || typeof d !== 'object') return {};
    const out: Record<number, CustomerCounts> = {};
    for (const [k, v] of Object.entries(d as Record<string, Record<string, unknown>>)) {
      if (v && typeof v.jobs === 'number' && typeof v.open === 'number' && typeof v.quotes === 'number') out[Number(k)] = { jobs: v.jobs, open: v.open, quotes: v.quotes, ...(typeof v.owed === 'number' && v.owed > 0 ? { owed: v.owed } : {}) };
    }
    return out;
  } catch {
    return {};
  }
}
