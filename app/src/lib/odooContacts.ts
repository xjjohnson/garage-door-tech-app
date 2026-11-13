/**
 * A customer's other addresses in Odoo: the child contacts on their Odoo
 * contact (res.partner with parent_id), such as the delivery address Justin
 * uses for the house when a property manager is the customer. Read, added
 * and changed here; the ticket, quote and invoice pick a delivery address
 * from the same list. Kept free of React; the client is passed in, so tests
 * use a fake.
 */
import type { OdooClient } from './odoo';
import { addressVals } from './odoo';
import { likeExact } from './odooStock';
import { fillRegion, regionVals } from './odooRegion';

type Client = Pick<OdooClient, 'call'>;

export const ADDRESSES_STORAGE_KEY = 'odoo-addresses/v1';

/** Odoo's address types, in the words the app shows. */
export const ADDRESS_TYPES = [
  { value: 'delivery', label: 'House (delivery)' },
  { value: 'invoice', label: 'Billing' },
  { value: 'contact', label: 'Person' },
  { value: 'other', label: 'Other' },
] as const;
export type AddressType = (typeof ADDRESS_TYPES)[number]['value'];

export interface ContactAddress {
  id: number;
  type: AddressType;
  /** A person or place name; often empty for a plain address. */
  name: string;
  /** "400 Main St, Kyle 78640". */
  address: string;
  phone: string;
  email: string;
}

export interface AddressFields {
  type: AddressType;
  name: string;
  address: string;
  phone: string;
  email: string;
}

export const EMPTY_ADDRESS: AddressFields = { type: 'delivery', name: '', address: '', phone: '', email: '' };

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const TYPES = ADDRESS_TYPES.map((t) => t.value) as string[];

export const typeLabel = (t: AddressType) => ADDRESS_TYPES.find((x) => x.value === t)?.label ?? 'Other';

function toAddress(r: Record<string, unknown>): ContactAddress {
  const street = [str(r.street), str(r.street2)].filter(Boolean).join(' ');
  return {
    id: r.id as number,
    type: (TYPES.includes(str(r.type)) ? str(r.type) : 'other') as AddressType,
    name: str(r.name),
    address: [street, [str(r.city), str(r.zip)].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    phone: str(r.phone),
    email: str(r.email),
  };
}

/** The addresses under a customer's Odoo contact: houses first, then billing, people and the rest. */
export async function fetchAddresses(c: Client, partnerId: number): Promise<ContactAddress[]> {
  const rows = (await c.call('res.partner', 'search_read', [[['parent_id', '=', partnerId]]], { fields: ['name', 'type', 'street', 'street2', 'city', 'zip', 'phone', 'email'], order: 'id asc', limit: 500 })) as Record<string, unknown>[];
  return rows.map(toAddress).sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type));
}

function vals(f: AddressFields): Record<string, unknown> {
  return { type: f.type, name: f.name.trim() || false, phone: f.phone.trim() || false, email: f.email.trim() || false, ...addressVals(f.address) };
}

/** Adds an address under the customer's contact. Returns its id. */
export async function addAddress(c: Client, partnerId: number, f: AddressFields): Promise<number> {
  const v = Object.fromEntries(Object.entries(vals(f)).filter(([, x]) => x !== false));
  return (await c.call('res.partner', 'create', [{ parent_id: partnerId, ...v, ...(await regionVals(c, f.address)) }])) as number;
}

export async function saveAddress(c: Client, id: number, f: AddressFields): Promise<void> {
  await c.call('res.partner', 'write', [[id], vals(f)]);
  await fillRegion(c, 'res.partner', [id], f.address);
}

/** What one line of the address list says: "400 Main St, Kyle 78640" or "Unit 4 · 400 Main St". */
/** An address with its name, leaving the name out when it only repeats the street. */
export const addressLine = (a: Pick<ContactAddress, 'name' | 'address'>) => {
  const name = a.name.trim();
  const repeats = !!name && a.address.trim().toLowerCase().startsWith(name.toLowerCase());
  return [repeats ? '' : name, a.address].filter(Boolean).join(' · ');
};

/** The addresses read last time, by Odoo contact, so they show with no signal. */
export function parseSavedAddresses(raw: string | null): Record<string, ContactAddress[]> {
  try {
    const d = raw ? JSON.parse(raw) : null;
    if (!d || typeof d !== 'object' || Array.isArray(d)) return {};
    const out: Record<string, ContactAddress[]> = {};
    for (const [k, v] of Object.entries(d)) if (Array.isArray(v)) out[k] = v.filter((a) => a && typeof a.id === 'number' && typeof a.address === 'string');
    return out;
  } catch {
    return {};
  }
}

/** A house or other address under some customer's contact, found by a search. */
export interface FoundAddress extends ContactAddress {
  /** The customer's Odoo contact (the property manager), and their name. */
  parentId: number;
  parentName: string;
}

/**
 * Houses and other addresses under any customer's contact whose street or
 * name matches what's typed, for the New job address list.
 */
export async function searchAddresses(c: Client, q: string, limit = 3): Promise<FoundAddress[]> {
  const t = q.trim();
  if (t.length < 3) return [];
  const rows = (await c.call('res.partner', 'search_read', [[['parent_id', '!=', false], ['type', 'in', ['delivery', 'other']], '|', ['street', 'ilike', t], ['name', 'ilike', t]]], { fields: ['name', 'type', 'street', 'street2', 'city', 'zip', 'phone', 'email', 'parent_id'], limit })) as Record<string, unknown>[];
  return rows.flatMap((r) => (Array.isArray(r.parent_id) ? [{ ...toAddress(r), parentId: r.parent_id[0] as number, parentName: str(r.parent_id[1]) }] : []));
}

/**
 * A customer in Odoo found by name or street. Odoo can hold the same customer
 * twice (two top-level contacts with one name, the addresses under only one
 * of them), so contacts with the same name are one customer here: `ids` holds
 * them all, the one with the most addresses under it first.
 */
export interface FoundCustomer {
  id: number;
  ids: number[];
  name: string;
  address: string;
  /** How many contacts are under them in Odoo (all of the same-name contacts together). */
  under: number;
}

const nameKey = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');

/** Customers in Odoo (contacts with no parent) whose name or street matches what's typed, one per name. */
export async function searchCustomers(c: Client, q: string, limit = 10): Promise<FoundCustomer[]> {
  const t = q.trim();
  if (t.length < 2) return [];
  const rows = (await c.call('res.partner', 'search_read', [[['parent_id', '=', false], '|', ['name', 'ilike', t], ['street', 'ilike', t]]], { fields: ['name', 'type', 'street', 'street2', 'city', 'zip', 'phone', 'email', 'child_ids'], limit: limit * 3, order: 'name asc' })) as Record<string, unknown>[];
  const groups = new Map<string, { a: ContactAddress; under: number }[]>();
  const seen = new Set<number>();
  for (const r of rows) {
    const a = toAddress(r);
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    const k = nameKey(a.name) || `#${a.id}`;
    groups.set(k, [...(groups.get(k) ?? []), { a, under: Array.isArray(r.child_ids) ? r.child_ids.length : 0 }]);
  }
  return [...groups.values()].slice(0, limit).map((g) => {
    const sorted = [...g].sort((x, y) => y.under - x.under || x.a.id - y.a.id);
    return { id: sorted[0].a.id, ids: sorted.map((x) => x.a.id), name: sorted[0].a.name, address: sorted.find((x) => x.a.address)?.a.address ?? '', under: g.reduce((n, x) => n + x.under, 0) };
  });
}

/** The other top-level contacts in Odoo with exactly this customer's name (the same customer entered twice). */
export async function sameNameCustomers(c: Client, id: number, name: string): Promise<number[]> {
  if (!name.trim()) return [];
  const ids = (await c.call('res.partner', 'search', [[['parent_id', '=', false], ['id', '!=', id], ['name', '=ilike', likeExact(name.trim())]]], { limit: 5 })) as number[];
  return Array.isArray(ids) ? ids.filter((x) => typeof x === 'number') : [];
}

/** One address a job can be at: the customer's own (main) or one under them. */
export interface AddressChoice {
  id: number;
  title: string;
  line: string;
  address: string;
}

/**
 * Every address a customer has: their own (main) first, then each contact
 * under them that has an address (houses, billing, people, the rest). The
 * same address twice shows once.
 */
export function addressChoices(main: { id: number; address: string }, under: ContactAddress[], more: { id: number; address: string }[] = []): AddressChoice[] {
  const out: AddressChoice[] = [{ id: main.id, title: 'Main address', line: main.address || 'No address in Odoo', address: main.address }];
  const seen = new Set([nameKey(main.address)]);
  const add = (x: AddressChoice) => {
    const k = nameKey(x.address);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(x);
  };
  for (const m of more) add({ id: m.id, title: 'Main address', line: m.address, address: m.address });
  for (const a of under) add({ id: a.id, title: typeLabel(a.type), line: addressLine(a), address: a.address });
  return out;
}

/** Customers' own addresses in Odoo, and every contact under any of them. */
export async function fetchCustomerAddresses(c: Client, ids: number[]): Promise<{ mains: FoundCustomer[]; under: ContactAddress[] }> {
  if (ids.length === 0) return { mains: [], under: [] };
  const fields = ['name', 'type', 'street', 'street2', 'city', 'zip', 'phone', 'email'];
  const [own, kids] = await Promise.all([c.call('res.partner', 'read', [ids], { fields }) as Promise<Record<string, unknown>[]>, c.call('res.partner', 'search_read', [[['parent_id', 'in', ids]]], { fields, order: 'id asc', limit: 500 }) as Promise<Record<string, unknown>[]>]);
  const mains = (Array.isArray(own) ? own : []).map(toAddress).map((a) => ({ id: a.id, ids: [a.id], name: a.name, address: a.address, under: 0 }));
  mains.sort((x, y) => ids.indexOf(x.id) - ids.indexOf(y.id));
  const under = (Array.isArray(kids) ? kids : []).map(toAddress).sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type));
  return { mains, under };
}

/** A contact whose whole address was typed into Street ("1 Main St, Kyle, TX 78640"), with how it splits. */
export interface CrampedAddress {
  id: number;
  name: string;
  street: string;
  /** Odoo's street, street2, city and ZIP for it. */
  vals: { street: string; street2: string; city: string; zip: string };
}

/**
 * Splits "400 Main St, Suite 200, Kyle, TX 78640" into street "400 Main St",
 * street2 "Suite 200", city "Kyle" and ZIP "78640". Only a line that clearly
 * ends in a town (letters only) and then a ZIP splits; with no ZIP in it, only
 * when the contact already has that ZIP and the line is "street, town[, TX]".
 * Anything else ("Smith Plaza, Building B") is left alone.
 */
export function splitStreet(line: string, zipAlready = ''): CrampedAddress['vals'] | null {
  const m = /^(.+?)[\s,]+(\d{5})(?:-\d{4})?\s*$/.exec(line.trim());
  const zip = m ? m[2] : zipAlready;
  const rest = (m ? m[1] : line).replace(/[\s,]+(?:TX|Texas)\.?$/i, '');
  const parts = rest.split(',').map((t) => t.trim()).filter(Boolean);
  if (!zip || parts.length < 2) return null;
  if (!m && parts.length !== 2) return null;
  const city = parts[parts.length - 1];
  if (!/^[A-Za-z][A-Za-z .'-]*$/.test(city) || /\b(suite|ste|unit|apt|bldg|building|floor|fl)\b/i.test(city)) return null;
  const street = parts[0];
  if (!/\d/.test(street)) return null;
  return { street, street2: parts.slice(1, -1).join(', '), city, zip };
}

/**
 * Contacts with the city or ZIP still inside Street and the City or ZIP box
 * empty, so Odoo's maps, Field Service locations and reports can't use them.
 * Only ones that split cleanly (see splitStreet) are offered.
 */
export async function crampedAddresses(c: Client, limit = 500): Promise<CrampedAddress[]> {
  const rows = (await c.call('res.partner', 'search_read', [[['street', 'ilike', ','], '|', ['city', '=', false], ['zip', '=', false]]], { fields: ['name', 'street', 'street2', 'city', 'zip'], limit, order: 'id asc' })) as Record<string, unknown>[];
  return rows.flatMap((r) => {
    const street = str(r.street);
    const v = splitStreet(street, str(r.zip));
    if (!v) return [];
    // Never overwrite a Street 2, City or ZIP Odoo already has with something else.
    if ((str(r.city) && str(r.city).toLowerCase() !== v.city.toLowerCase()) || (str(r.zip) && str(r.zip) !== v.zip)) return [];
    if (v.street2 && str(r.street2)) return [];
    return [{ id: r.id as number, name: str(r.name) || 'Contact', street, vals: { ...v, street2: v.street2 || str(r.street2) } }];
  });
}

/** Writes the split street, street2, city and ZIP to each contact; returns how many went. */
export async function splitAddresses(c: Client, list: CrampedAddress[]): Promise<number> {
  let n = 0;
  for (const a of list) {
    await c.call('res.partner', 'write', [[a.id], { street: a.vals.street, street2: a.vals.street2 || false, city: a.vals.city, zip: a.vals.zip }]);
    await fillRegion(c, 'res.partner', [a.id], a.street);
    n++;
  }
  return n;
}
