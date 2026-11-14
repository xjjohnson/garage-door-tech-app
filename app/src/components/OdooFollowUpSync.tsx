/**
 * Follow-ups and Odoo, in the background while signed in: puts each follow-up that is due soon on the customer's contact in Odoo as a
 * to-do (activity), completes it when the tech marks the follow-up handled,
 * and marks the follow-up handled when its activity is done or deleted in
 * Odoo. Renders nothing.
 */
import { useCallback, useEffect, useRef } from 'react';
import { followUpId, followUps } from '../lib/followups';
import { log } from '../lib/log';
import { activitiesReady, activityWindow, ACTIVITY_BATCH, completeActivity, ensureActivity, liveActivities } from '../lib/odooFollowUps';
import { onSyncNow } from '../lib/syncNow';
import { useAppForeground } from '../lib/useAppForeground';
import { useCustomers } from '../lib/useCustomers';
import { useFollowUps } from '../lib/useFollowUps';
import { useInvoices } from '../lib/useInvoices';
import { useOdoo } from '../lib/useOdoo';

const EVERY_MS = 15 * 60_000;
const AFTER_CHANGE_MS = 5000;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function OdooFollowUpSync({ now = Date.now }: { now?: () => number }) {
  const { status, client } = useOdoo();
  const inv = useInvoices();
  const cust = useCustomers();
  const fu = useFollowUps();
  const latest = useRef({ inv, cust, fu });
  latest.current = { inv, cust, fu };
  const running = useRef(false);
  const online = status === 'signedIn' && !!client && inv.loaded;

  const pass = useCallback(async () => {
    if (!client || running.current) return;
    running.current = true;
    try {
      const t = now();
      if (!(await activitiesReady(client))) return;

      const { inv: I, cust: C, fu: F } = latest.current;
      const partnerOf = (i: (typeof I.invoices)[number]): number | undefined => C.customers.find((c) => c.id === i.customerId)?.odooId;

      // 1. Activities done or deleted in Odoo mean the follow-up was handled; handled in the app completes the activity.
      const mapped = Object.entries(F.activities);
      const live = await liveActivities(client, mapped.map(([, n]) => n));
      for (const [id, n] of mapped) {
        if (F.dismissed[id]) {
          if (live.has(n)) await completeActivity(client, n).catch((e) => log.warn('odoo', `follow-up ${id} not completed: ${message(e)}`));
          F.setActivity(id, null);
        } else if (!live.has(n)) {
          F.dismiss(id);
          F.setActivity(id, null);
        }
      }

      // 2. New activities for follow-ups due soon, a few a pass.
      const due = activityWindow(followUps(I.invoices, F.settings, I.business, t, F.dismissed), t).filter((f) => !F.activities[followUpId(f.kind, f.invoice)]);
      let made = 0;
      for (const f of due) {
        if (made >= ACTIVITY_BATCH) break;
        const partner = partnerOf(f.invoice);
        if (!partner) continue;
        const id = followUpId(f.kind, f.invoice);
        try {
          F.setActivity(id, await ensureActivity(client, partner, f, id));
          made++;
        } catch (e) {
          log.warn('odoo', `follow-up ${id} not sent: ${message(e)}`);
        }
      }
    } catch (e) {
      log.warn('odoo', `follow-up sync: ${message(e)}`);
    } finally {
      running.current = false;
    }
  }, [client, now]);

  useEffect(() => {
    if (!online) return;
    pass();
    const t = setInterval(pass, EVERY_MS);
    return () => clearInterval(t);
  }, [online, pass]);

  // Shortly after a follow-up is handled or the invoices change.
  useEffect(() => {
    if (!online) return;
    const t = setTimeout(pass, AFTER_CHANGE_MS);
    return () => clearTimeout(t);
  }, [online, pass, fu.dismissed, inv.invoices]);

  useAppForeground(() => {
    if (online) pass();
  });

  useEffect(() => {
    if (!online) return;
    return onSyncNow(pass);
  }, [online, pass]);

  return null;
}
