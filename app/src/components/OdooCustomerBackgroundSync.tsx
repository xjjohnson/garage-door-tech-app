/**
 * Keeps the phone's customers and Odoo's contacts in step in the background
 * while signed in: Odoo's customers come in, and a customer made or changed
 * on the phone goes up, shortly after the change, when the app comes back,
 * and every few minutes. Odoo wins, except for an edit still waiting to go
 * up. Nothing from before this phone started sending is written to Odoo
 * (that stays on Customers' Sync button). Renders nothing.
 */
import { useCallback, useEffect, useRef } from 'react';
import { log } from '../lib/log';
import { onSyncNow } from '../lib/syncNow';
import { useAppForeground } from '../lib/useAppForeground';
import { useCustomers } from '../lib/useCustomers';
import { useCustomerSync } from '../lib/useCustomerSync';
import { useJobsSince } from '../lib/useJobsSince';
import { useOdoo } from '../lib/useOdoo';

const EVERY_MS = 5 * 60_000;
const AFTER_CHANGE_MS = 4000;

export function OdooCustomerBackgroundSync({ now = Date.now }: { now?: () => number }) {
  const { status, client } = useOdoo();
  const { customers, loaded } = useCustomers();
  const since = useJobsSince(now);
  const sync = useCustomerSync(now);
  const latest = useRef({ sync, since });
  latest.current = { sync, since };
  const running = useRef(false);
  const online = status === 'signedIn' && !!client && loaded && since !== null;

  const pass = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const from = latest.current.since;
      if (from === null) return;
      const text = await latest.current.sync({ since: from });
      if (!/already match/.test(text)) log.info('odoo', `customer sync: ${text}`);
    } catch (e) {
      log.warn('odoo', `customer sync: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    if (!online) return;
    pass();
    const t = setInterval(pass, EVERY_MS);
    return () => clearInterval(t);
  }, [online, pass]);

  // Shortly after a customer is made or edited on the phone (not after the sync's own writes, which leave nothing waiting).
  const waiting = since === null ? '' : customers.filter((c) => c.name.trim() && c.updatedAt >= since && (!c.odooId ? c.createdAt >= since : c.updatedAt > (c.syncedAt ?? 0))).map((c) => `${c.id}:${c.updatedAt}`).join(',');
  useEffect(() => {
    if (!online || !waiting) return;
    const t = setTimeout(pass, AFTER_CHANGE_MS);
    return () => clearTimeout(t);
  }, [online, pass, waiting]);

  useAppForeground(() => {
    if (online) pass();
  });

  useEffect(() => {
    if (!online) return;
    return onSyncNow(pass);
  }, [online, pass]);

  return null;
}
