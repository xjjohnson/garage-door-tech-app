/**
 * Counts what needs attention in Warehouse and Purchasing from Odoo, in the
 * background while signed in: when the app opens, every few minutes, when it
 * comes back to the screen, and on Sync now. For a tech it also counts job
 * parts that are ready at the warehouse. Renders nothing; the numbers are
 * shown by the Tools tab and the areas' lists.
 */
import { useCallback, useEffect, useRef } from 'react';
import { computeBadges, getBadges, loadSavedBadges, NO_BADGES, onBadgeRefresh, saveBadges, setBadges } from '../lib/deptBadges';
import { DEFAULT_LIMITS, readLimits } from '../lib/deptLimits';
import { log } from '../lib/log';
import { onSyncNow } from '../lib/syncNow';
import { useAppForeground } from '../lib/useAppForeground';
import { useAllAccess } from '../lib/useDepartments';
import { useOdoo } from '../lib/useOdoo';
import { useStock } from '../lib/useStock';

const EVERY_MS = 5 * 60_000;

export function DeptBadgeSync() {
  const { status, client } = useOdoo();
  // Counts every role the person holds (not just the one in use), so the role screen can show a badge on each.
  const { access, ready } = useAllAccess();
  const stock = useStock();
  const latest = useRef(stock);
  latest.current = stock;
  const running = useRef(false);
  const online = status === 'signedIn' && !!client && ready;

  const pass = useCallback(async () => {
    if (!client || running.current) return;
    running.current = true;
    try {
      // Job parts this phone ordered that the warehouse has received and nobody picked up yet.
      const s = latest.current;
      const waiting = (s.purchases ?? []).filter((p) => p.jobId && !p.receivedAt);
      let readyCount = 0;
      for (const p of waiting.slice(0, 20)) {
        if ((await s.jobOrderState(client, p.id).catch(() => 'gone' as const)) === 'ready') readyCount++;
      }
      const limits = access.office || access.sales ? await readLimits(client) : DEFAULT_LIMITS;
      const fresh = await computeBadges(client, access, readyCount, Date.now(), limits, getBadges());
      setBadges(fresh);
      saveBadges(client, fresh);
    } catch (e) {
      log.warn('badges', `counting what needs attention: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      running.current = false;
    }
  }, [client, access]);

  // Show the counts last seen on this phone at once; the fresh ones replace them as Odoo answers.
  useEffect(() => {
    if (!client) {
      setBadges(NO_BADGES);
      return;
    }
    let alive = true;
    loadSavedBadges(client).then((saved) => {
      if (alive && saved && getBadges() === NO_BADGES) setBadges(saved);
    });
    return () => {
      alive = false;
    };
  }, [client]);

  useEffect(() => {
    if (!online) return;
    pass();
    const t = setInterval(pass, EVERY_MS);
    return () => clearInterval(t);
  }, [online, pass]);

  useAppForeground(() => {
    if (online) pass();
  });

  useEffect(() => {
    if (!online) return;
    return onSyncNow(pass);
  }, [online, pass]);

  // A screen asks for a fresh count after the person changed something.
  useEffect(() => {
    if (!online) return;
    return onBadgeRefresh(() => {
      pass();
    });
  }, [online, pass]);

  return null;
}
