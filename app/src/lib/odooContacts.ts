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
