/**
 * Customer types (Homeowner, Commercial, whatever the owner adds): the list
 * is kept in the company's business details; each type is a tag on the
 * customer's contact in Odoo (res.partner.category), so Odoo stays the source
 * of truth and a customer's type shows in Odoo's own contact list. Maintenance
 * plans can be limited to some types. Kept free of React.
 */
import type { Business } from './invoices';
import type { OdooClient } from './odoo';

type Caller = Pick<OdooClient, 'call'>;

export const DEFAULT_CUSTOMER_TYPES = ['Homeowner', 'Commercial'];

/** The types to offer, in the owner's order. */
export function typesFor(business: Pick<Business, 'customerTypes'>): string[] {
  return business.customerTypes && business.customerTypes.length ? business.customerTypes : DEFAULT_CUSTOMER_TYPES;
}

/** The tag ids for these names, making the ones Odoo doesn't have yet. */
async function tagIds(c: Caller, names: string[], create: boolean): Promise<Record<string, number>> {
  const rows = (await c.call('res.partner.category', 'search_read', [[['name', 'in', names]]], { fields: ['name'], limit: 200 })) as { id: number; name?: unknown }[];
  const out: Record<string, number> = {};
  for (const r of rows) if (typeof r.name === 'string') out[r.name] = r.id;
  if (create) {
    for (const n of names) if (!out[n]) out[n] = (await c.call('res.partner.category', 'create', [{ name: n }])) as number;
  }
  return out;
}

/** The first of the owner's types that is on this contact; undefined when none is. */
export async function customerTypeOf(c: Caller, partnerId: number, all: string[]): Promise<string | undefined> {
  const [p] = (await c.call('res.partner', 'read', [[partnerId]], { fields: ['category_id'] })) as { category_id?: unknown }[];
  const ids = Array.isArray(p?.category_id) ? (p.category_id as number[]) : [];
  if (ids.length === 0) return undefined;
  const tags = await tagIds(c, all, false);
  return all.find((n) => tags[n] !== undefined && ids.includes(tags[n]));
}

/** Puts this type on the contact and takes the other types off it; other tags are left alone. undefined clears the type. */
export async function setCustomerType(c: Caller, partnerId: number, type: string | undefined, all: string[]): Promise<void> {
  const tags = await tagIds(c, type && !all.includes(type) ? [...all, type] : all, !!type);
  const ops: unknown[] = [];
  for (const n of all) if (n !== type && tags[n] !== undefined) ops.push([3, tags[n]]);
  if (type && tags[type] !== undefined) ops.push([4, tags[type]]);
  if (ops.length) await c.call('res.partner', 'write', [[partnerId], { category_id: ops }]);
}

/** Renames a type tag in Odoo when the owner renames it here, so customers keep their type. Nothing happens if the old tag isn't there. */
export async function renameCustomerType(c: Caller, from: string, to: string): Promise<void> {
  const tags = await tagIds(c, [from, to], false);
  if (tags[from] !== undefined && tags[to] === undefined) await c.call('res.partner.category', 'write', [[tags[from]], { name: to }]);
}
