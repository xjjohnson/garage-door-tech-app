import type { Customer } from './customers';
import type { Invoice } from './invoices';
import { balance, invoiceStatus } from './invoices';
import type { Job } from './jobs';

type Caller = { call(model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>): Promise<unknown> };

export interface DeletePlan {
  /** delete: Odoo has no records tied to them. archive: it does, so they are hidden, never erased. blocked: not safe to do either yet. */
  kind: 'delete' | 'archive' | 'blocked';
  /** Plain words for the person: why, and what will happen. */
  message: string;
  /** Jobs and invoices that only exist on this phone and go with the customer. */
  localJobs: string[];
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

async function count(client: Caller, model: string, domain: unknown[]): Promise<number> {
  try {
    const n = await client.call(model, 'search_count', [domain]);
    return typeof n === 'number' ? n : 0;
  } catch {
    return 0; // that part of Odoo isn't installed
  }
}

/**
 * What removing a customer should do. Odoo owns the books: a customer with
 * posted invoices, confirmed orders or field service jobs there is archived
 * (hidden, history kept), never deleted. One with nothing is deleted.
 */
export async function planCustomerDelete(client: Caller | null, customer: Customer, jobs: Job[], invoices: Invoice[]): Promise<DeletePlan> {
  const mine = jobs.filter((j) => j.customerId === customer.id);
  const phoneOnlyJobs = mine.filter((j) => !j.odooJob && !j.odooOrder);
  const phoneOnlyInvoices = invoices.filter((i) => (i.customerId === customer.id || mine.some((j) => j.id === i.jobId)) && !i.odoo && invoiceStatus(i) !== 'void');
  const unsent = phoneOnlyInvoices.filter((i) => balance(i) > 0 || i.payments.length > 0);
  if (unsent.length) {
    return { kind: 'blocked', localJobs: [], message: `${plural(unsent.length, 'invoice')} for this customer only ${unsent.length === 1 ? 'is' : 'are'} on this phone and not in Odoo yet. Send ${unsent.length === 1 ? 'it' : 'them'} to Odoo or void ${unsent.length === 1 ? 'it' : 'them'} first, so nothing is lost.` };
  }
  const localJobs = phoneOnlyJobs.map((j) => j.id);
  if (!customer.odooId) {
    return { kind: 'delete', localJobs, message: `This customer is only on this phone. Delete ${customer.name || 'them'}${mine.length ? ` and ${plural(mine.length, 'job')}` : ''}?` };
  }
  if (!client) return { kind: 'blocked', localJobs: [], message: 'Sign in to Odoo first. This customer is in Odoo, so the app has to check there before removing them.' };
  const pid = customer.odooId;
  const invoiceN = await count(client, 'account.move', [['partner_id', '=', pid], ['move_type', 'in', ['out_invoice', 'out_refund']], ['state', '!=', 'draft']]);
  const orderN = await count(client, 'sale.order', [['partner_id', '=', pid], ['state', 'in', ['sale', 'done']]]);
  const jobN = await count(client, 'fsm.order', [['location_id.partner_id', '=', pid]]);
  const history = [invoiceN ? plural(invoiceN, 'invoice') : '', orderN ? plural(orderN, 'confirmed order') : '', jobN ? plural(jobN, 'job') : ''].filter(Boolean);
  if (history.length) {
    return { kind: 'archive', localJobs, message: `Odoo has ${history.join(', ')} for this customer, so they can't be deleted without losing your books. Archive them instead: they leave the list here and in Odoo, and all their history stays in Odoo.` };
  }
  return { kind: 'delete', localJobs, message: `Odoo has no invoices, orders or jobs for this customer. Delete ${customer.name || 'them'} from the app and from Odoo?` };
}

/** Does it in Odoo: unlink, falling back to archive if Odoo refuses. Returns what was done. Throws if Odoo can't be reached or refuses both. */
export async function runCustomerDelete(client: Caller | null, customer: Customer, kind: 'delete' | 'archive'): Promise<'deleted' | 'archived'> {
  if (!customer.odooId) return 'deleted';
  if (!client) throw new Error('Sign in to Odoo first.');
  if (kind === 'delete') {
    try {
      await client.call('res.partner', 'unlink', [[customer.odooId]]);
      return 'deleted';
    } catch {
      // Odoo says it is still linked to something: archive instead.
    }
  }
  await client.call('res.partner', 'write', [[customer.odooId], { active: false }]);
  return 'archived';
}

export interface GoneResult {
  /** Customers to drop from the phone. */
  dropCustomers: Set<string>;
  /** Their jobs to drop with them. */
  dropJobs: string[];
  /** Names kept because they still have work on the phone that Odoo never got. */
  kept: string[];
}

/**
 * Customers Odoo no longer has (deleted or archived there). They leave the
 * phone with their jobs, unless a job exists only on the phone with an accepted
 * quote, or an invoice only on the phone has money on it: then that customer
 * stays and the sync says so, so nothing is lost silently.
 */
export function resolveGone(gone: Customer[], jobs: Job[], invoices: Invoice[]): GoneResult {
  const out: GoneResult = { dropCustomers: new Set(), dropJobs: [], kept: [] };
  for (const c of gone) {
    const mine = jobs.filter((j) => j.customerId === c.id);
    const ids = new Set(mine.map((j) => j.id));
    const phoneOnly = mine.filter((j) => !j.odooJob && !j.odooOrder);
    const unsentWork = phoneOnly.some((j) => !!j.accepted) || invoices.some((i) => (i.customerId === c.id || ids.has(i.jobId)) && !i.odoo && invoiceStatus(i) !== 'void' && (balance(i) > 0 || i.payments.length > 0));
    if (unsentWork) {
      out.kept.push(c.name || c.address || 'a customer');
      continue;
    }
    out.dropCustomers.add(c.id);
    out.dropJobs.push(...ids);
  }
  return out;
}
