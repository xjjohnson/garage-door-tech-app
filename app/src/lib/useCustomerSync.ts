import { useCallback, useRef } from 'react';
import { finishCustomerSync, planCustomerSync } from './customerSync';
import { withContactLock } from './odooContactLock';
import { useCustomers } from './useCustomers';
import { useOdoo } from './useOdoo';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * One customer sync with Odoo: brings in Odoo's customers and sends the
 * phone's new or changed ones. Returns what happened in words; throws when
 * Odoo can't be reached. Used by Customers' Sync button and by Sync now.
 * `{ since }` is the background run: it leaves customers and edits from before
 * then alone (see planCustomerSync) and doesn't touch the list when nothing changed.
 * It runs one at a time with the job and visit syncs (see withContactLock), so a
 * new customer is never made in Odoo twice.
 */
export function useCustomerSync(now: () => number = Date.now) {
  const { client } = useOdoo();
  const { customers, apply } = useCustomers();
  const latest = useRef(customers);
  latest.current = customers;
  return useCallback(async (opts: { since?: number | null } = {}): Promise<string> => {
    if (!client) throw new Error('Sign in to Odoo first.');
    return withContactLock(async () => {
      const before = latest.current;
      const partners = await client.partners();
      const plan = planCustomerSync(before, partners, now(), opts.since);
      // Customers deleted or archived in Odoo leave the list (unless they have changes still waiting to go up).
      const listed = new Set(partners.map((x) => x.id));
      const gone = new Set<string>();
      const linked = before.filter((c) => c.odooId && !listed.has(c.odooId) && (c.syncedAt ?? 0) >= c.updatedAt);
      if (linked.length && listed.size > 0) {
        const alive = new Set(((await client.call('res.partner', 'search', [[['id', 'in', linked.map((c) => c.odooId!)]]])) as number[]) ?? []);
        for (const c of linked) if (!alive.has(c.odooId!)) gone.add(c.id);
      }
      if (opts.since != null && !gone.size && !plan.toCreate.length && !plan.toWrite.length && JSON.stringify(plan.customers) === JSON.stringify(before)) return 'Customers already match Odoo.';
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
        apply((current) => finishCustomerSync(current, before, plan, created, sent).filter((c) => !gone.has(c.id)));
      }
      const parts = [
        plan.added ? `brought in ${plural(plan.added, 'customer')} from Odoo` : '',
        plan.updated ? `updated ${plan.updated} with Odoo's changes` : '',
        plan.toCreate.length ? `added ${plan.toCreate.length} to Odoo` : '',
        gone.size ? `removed ${plural(gone.size, 'customer')} deleted in Odoo` : '',
        plan.toWrite.length ? `sent ${plural(plan.toWrite.length, 'change')} to Odoo` : '',
      ].filter(Boolean);
      return parts.length ? `Done: ${parts.join(', ')}.` : 'Customers already match Odoo.';
    });
  }, [client, apply, now]);
}
