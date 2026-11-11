/**
 * Two-way customer sync with Odoo contacts (res.partner), worked out without
 * React or the network so it can be tested directly:
 *
 * - Odoo customers the phone doesn't have come in (matched first by Odoo id,
 *   then by phone number or name, so a customer already on the phone is linked
 *   rather than doubled).
 * - Customers made on the phone that Odoo doesn't have are created there.
 * - A customer changed on the phone since the last sync sends its name, phone
 *   and email to Odoo; one changed only in Odoo takes Odoo's details. When both
 *   changed, the phone wins, since that's where the tech just typed it.
 */
import { Customer, CustomerFields, findCustomer } from './customers';

/** An Odoo contact, as the sync needs it. */
export interface OdooPartner extends CustomerFields {
  id: number;
  /** When Odoo last changed it, ms. */
  changedAt: number;
}

export interface CustomerSyncPlan {
  /** The phone's list after taking what came from Odoo (new customers added, links and Odoo changes applied). */
  customers: Customer[];
  /** Phone customers to create in Odoo. */
  toCreate: Customer[];
  /** Linked customers whose phone changes go to Odoo. */
  toWrite: { odooId: number; customerId: string; fields: Partial<CustomerFields> }[];
  /** How many came in new, and how many took Odoo's changes. */
  added: number;
  updated: number;
}

const SENT: (keyof CustomerFields)[] = ['name', 'phone', 'email'];

export function planCustomerSync(customers: Customer[], partners: OdooPartner[], now: number): CustomerSyncPlan {
  const out = customers.map((c) => ({ ...c }));
  const byOdoo = new Map(out.filter((c) => c.odooId).map((c) => [c.odooId!, c]));
  const toWrite: CustomerSyncPlan['toWrite'] = [];
  let added = 0;
  let updated = 0;

  for (const p of partners) {
    let c = byOdoo.get(p.id);
    if (!c) {
      const match = findCustomer(
        out.filter((x) => !x.odooId),
        { customer: p.name, address: p.address, phone: p.phone },
      );
      if (match) {
        // Same person on both sides: link them, and fill in what the phone was missing.
        match.odooId = p.id;
        for (const k of ['phone', 'email', 'address', 'notes'] as const) if (!match[k] && p[k]) match[k] = p[k];
        match.syncedAt = match.updatedAt;
        byOdoo.set(p.id, match);
        continue;
      }
      const fresh: Customer = { id: `odoo-${p.id}`, name: p.name, phone: p.phone, email: p.email, address: p.address, notes: p.notes, createdAt: now, updatedAt: now, odooId: p.id, syncedAt: now };
      out.push(fresh);
      byOdoo.set(p.id, fresh);
      added++;
      continue;
    }
    const synced = c.syncedAt ?? 0;
    if (c.updatedAt > synced) {
      const fields: Partial<CustomerFields> = {};
      for (const k of SENT) if (c[k] !== p[k] && c[k]) fields[k] = c[k];
      if (Object.keys(fields).length) toWrite.push({ odooId: p.id, customerId: c.id, fields });
    } else if (p.changedAt > synced) {
      const before = JSON.stringify([c.name, c.phone, c.email, c.address, c.notes]);
      Object.assign(c, { name: p.name || c.name, phone: p.phone, email: p.email, address: p.address || c.address, notes: p.notes || c.notes });
      if (JSON.stringify([c.name, c.phone, c.email, c.address, c.notes]) !== before) {
        c.updatedAt = now;
        updated++;
      }
      c.syncedAt = c.updatedAt;
    }
  }

  const toCreate = out.filter((c) => !c.odooId && c.name.trim());
  return { customers: out, toCreate, toWrite, added, updated };
}

/**
 * The list to keep once Odoo has answered: the plan's list with the new Odoo
 * ids and everything marked synced, laid over the phone's list as it is now so
 * an edit made while the sync ran isn't lost. `sent` is the customers whose
 * changes reached Odoo (all of toWrite when every call worked).
 */
export function finishCustomerSync(current: Customer[], before: Customer[], plan: CustomerSyncPlan, created: Record<string, number>, sent: Set<string> = new Set(plan.toWrite.map((w) => w.customerId))): Customer[] {
  const was = new Map(before.map((c) => [c.id, c.updatedAt]));
  const done = new Map(
    plan.customers.map((c) => {
      const odooId = c.odooId ?? created[c.id];
      // A change that didn't reach Odoo stays unsynced, so the next sync sends it again.
      const unsent = plan.toWrite.some((w) => w.customerId === c.id) && !sent.has(c.id);
      return [c.id, odooId && !unsent ? { ...c, odooId, syncedAt: c.updatedAt } : { ...c, ...(odooId ? { odooId } : {}) }];
    }),
  );
  const out = current.map((c) => {
    const d = done.get(c.id);
    // Changed on the phone while syncing: keep that edit; the next sync sends it.
    if (!d || c.updatedAt !== was.get(c.id)) return c;
    return d;
  });
  const have = new Set(out.map((c) => c.id));
  for (const d of done.values()) if (!have.has(d.id) && !was.has(d.id)) out.push(d);
  return out;
}
