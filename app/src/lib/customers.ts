/**
 * Customers: one record per person or business, with every job at their
 * place linked to it, so a callback shows the door's history. Kept free of
 * React so it can be tested directly.
 *
 * Jobs keep their own copy of the name, address and phone as typed (the job
 * site can differ from the customer's main address). Every job is linked to a
 * customer by `customerId`; jobs saved before customers existed, or restored
 * from a backup, are linked by matching phone number, then name.
 *
 * The fields follow what an accounting or field-service system keeps for a
 * contact (name, phone, email, street, notes), so a later sync can map them
 * one to one.
 */
import { Job } from './jobs';

export const CUSTOMERS_STORAGE_KEY = 'customers/v1';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  /** The main address; each job keeps its own site address too. */
  address: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
  /** The Odoo contact (res.partner id) this customer syncs with. */
  odooId?: number;
  /** `updatedAt` as of the last sync with Odoo; a later updatedAt means the phone has changes to send. */
  syncedAt?: number;
}

export type CustomerFields = Pick<Customer, 'name' | 'phone' | 'email' | 'address' | 'notes'>;

export const EMPTY_CUSTOMER: CustomerFields = { name: '', phone: '', email: '', address: '', notes: '' };

export function newCustomerId(now: number, random: () => number = Math.random): string {
  return `c-${now.toString(36)}-${Math.floor(random() * 1e9).toString(36)}`;
}

export function cleanCustomer(f: CustomerFields): CustomerFields {
  return { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), address: f.address.trim(), notes: f.notes.trim() };
}

export function customerName(c: Pick<Customer, 'name' | 'address'>): string {
  return c.name || c.address || 'No name';
}

/** The digits of a phone number, without a leading US 1, so "(555) 123-4567" and "1-555-123-4567" match. */
export function phoneKey(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The customer a job's details belong to: same phone number first, then same name (or same address when there's no name). */
export function findCustomer(customers: Customer[], d: { customer: string; address: string; phone: string }): Customer | undefined {
  const p = phoneKey(d.phone);
  if (p.length >= 7) {
    const byPhone = customers.find((c) => phoneKey(c.phone) === p);
    if (byPhone) return byPhone;
  }
  const name = squash(d.customer);
  if (name) return customers.find((c) => squash(c.name) === name && (!p || !c.phone || phoneKey(c.phone) === p));
  const addr = squash(d.address);
  if (addr) return customers.find((c) => !c.name && squash(c.address) === addr);
  return undefined;
}

export interface LinkResult {
  customers: Customer[];
  /** Job id → the customer it now belongs to, for jobs that weren't linked (or pointed at a customer that's gone). */
  links: Record<string, string>;
}

/**
 * Makes sure every job belongs to a customer, creating customers from job
 * details where none matches. Changes nothing when everything is linked.
 */
export function linkJobs(jobs: Job[], customers: Customer[], now: number, makeId: () => string = () => newCustomerId(now)): LinkResult {
  const out = [...customers];
  const ids = new Set(out.map((c) => c.id));
  const links: Record<string, string> = {};
  // Oldest first, so a customer is created from their first job.
  for (const job of [...jobs].sort((a, b) => a.savedAt - b.savedAt)) {
    if (job.customerId && ids.has(job.customerId)) continue;
    let c = findCustomer(out, job);
    if (!c) {
      c = {
        id: makeId(),
        name: job.customer,
        phone: job.phone,
        email: '',
        address: job.address,
        notes: '',
        createdAt: job.savedAt,
        updatedAt: now,
      };
      out.push(c);
      ids.add(c.id);
    } else if (!c.phone && job.phone) {
      // Fill in a phone number learned from a later job.
      const filled: Customer = { ...c, phone: job.phone, updatedAt: now };
      out[out.indexOf(c)] = filled;
      c = filled;
    }
    links[job.id] = c.id;
  }
  return { customers: out, links };
}

export interface CustomerSummary {
  customer: Customer;
  jobs: Job[];
  openJobs: number;
  /** Sum of the quotes the customer said yes to, in cents. */
  acceptedTotal: number;
  lastJobAt: number | null;
}

export function summarize(customer: Customer, jobs: Job[]): CustomerSummary {
  const mine = jobs.filter((j) => j.customerId === customer.id).sort((a, b) => b.savedAt - a.savedAt);
  return {
    customer,
    jobs: mine,
    openJobs: mine.filter((j) => j.status === 'open').length,
    acceptedTotal: mine.reduce((sum, j) => sum + (j.accepted?.total ?? 0), 0),
    lastJobAt: mine[0]?.savedAt ?? null,
  };
}

/** Most recent job first; customers with no jobs last, by name. */
export function sortCustomers(list: CustomerSummary[]): CustomerSummary[] {
  return [...list].sort((a, b) => (b.lastJobAt ?? -1) - (a.lastJobAt ?? -1) || customerName(a.customer).localeCompare(customerName(b.customer)));
}

/** Matches name, phone, email, address and notes, plus the addresses and springs of their jobs. */
export function searchCustomers(list: CustomerSummary[], query: string): CustomerSummary[] {
  const words = query.toLowerCase().split(/\s+/).map(squash).filter(Boolean);
  if (words.length === 0) return list;
  return list.filter((s) => {
    const c = s.customer;
    const hay = squash([c.name, c.phone, c.email, c.address, c.notes, ...s.jobs.flatMap((j) => [j.address, j.summaryTitle])].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/** Customers whose name or phone starts like what's being typed, for picking a repeat customer. */
export function suggestCustomers(customers: Customer[], typed: string, limit = 3): Customer[] {
  const q = squash(typed);
  if (q.length < 2) return [];
  const p = phoneKey(typed);
  return customers
    .filter((c) => squash(c.name).includes(q) || (p.length >= 3 && phoneKey(c.phone).includes(p)))
    .filter((c) => squash(c.name) !== q)
    .slice(0, limit);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Reads the saved list; anything that isn't a customer is dropped. */
export function parseCustomers(raw: string | null | unknown[]): Customer[] {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];
  const out: Customer[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    if (typeof c.id !== 'string' || !c.id) continue;
    const createdAt = typeof c.createdAt === 'number' ? c.createdAt : 0;
    out.push({
      id: c.id,
      name: str(c.name),
      phone: str(c.phone),
      email: str(c.email),
      address: str(c.address),
      notes: str(c.notes),
      createdAt,
      updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : createdAt,
      ...(typeof c.odooId === 'number' && c.odooId > 0 ? { odooId: c.odooId } : {}),
      ...(typeof c.syncedAt === 'number' ? { syncedAt: c.syncedAt } : {}),
    });
  }
  return out;
}

/** A backup's customers merged into the phone's: nothing deleted, the copy changed last wins. */
export function mergeCustomers(current: Customer[], incoming: Customer[]): Customer[] {
  const byId = new Map(current.map((c) => [c.id, c]));
  for (const c of incoming) {
    const mine = byId.get(c.id);
    if (!mine || c.updatedAt > mine.updatedAt) byId.set(c.id, c);
  }
  return [...byId.values()];
}

/** A mailto: link, or nothing when it doesn't look like an email address. */
export function emailLink(email: string): string | undefined {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? `mailto:${email.trim()}` : undefined;
}
