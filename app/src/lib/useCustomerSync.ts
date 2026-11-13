import { useCallback, useRef } from 'react';
import { finishCustomerSync, planCustomerSync } from './customerSync';
import { useCustomers } from './useCustomers';
import { useOdoo } from './useOdoo';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * One customer sync with Odoo: brings in Odoo's customers and sends the
 * phone's new or changed ones. Returns what happened in words; throws when
 * Odoo can't be reached. Used by Customers' Sync button and by Sync now.
 * `{ since }` is the background run: it leaves customers and edits from before
 * then alone (see planCustomerSync) and doesn't touch the list when nothing changed.
 */
export function useCustomerSync(now: () => number = Date.now) {
  const { client } = useOdoo();
  const { customers, apply } = useCustomers();
  const latest = useRef(customers);
  latest.current = customers;
  return useCallback(async (opts: { since?: number | null } = {}): Promise<string> => {
    if (!client) throw new Error('Sign in to Odoo first.');
    const before = latest.current;
    const plan = planCustomerSync(before, await client.partners(), now(), opts.since);
    if (opts.since != null && !plan.toCreate.length && !plan.toWrite.length && JSON.stringify(plan.customers) === JSON.stringify(before)) return 'Customers already match Odoo.';
    const created: Record<string, number> = {};
    const sent = new Set<string>();
    try {
      for (const c of plan.toCreate) created[c.id] = await client.createPartner(c);
      for (const w of plan.toWrite) {
        await client.writePartner(w.odooId, w.fields);
        sent.add(w.customerId);
      }
    } finally {
      // Keep whatever made it across, even if Odoo stopped answering part way.
      apply((current) => finishCustomerSync(current, before, plan, created, sent));
    }
    const parts = [
      plan.added ? `brought in ${plural(plan.added, 'customer')} from Odoo` : '',
      plan.updated ? `updated ${plan.updated} with Odoo's changes` : '',
      plan.toCreate.length ? `added ${plan.toCreate.length} to Odoo` : '',
      plan.toWrite.length ? `sent ${plural(plan.toWrite.length, 'change')} to Odoo` : '',
    ].filter(Boolean);
    return parts.length ? `Done: ${parts.join(', ')}.` : 'Customers already match Odoo.';
  }, [client, apply, now]);
}
