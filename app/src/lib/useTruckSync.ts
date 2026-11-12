import { useCallback, useEffect, useRef, useState } from 'react';
import { log } from './log';
import type { SyncResult } from './odooStock';
import { unsyncedItems } from './stock';
import { useOdoo } from './useOdoo';
import { useStock } from './useStock';

/** How long after the last count change the truck syncs by itself. */
export const AUTO_SYNC_MS = 3000;

/**
 * Keeps the truck in step with Odoo while a screen that shows it is open:
 * syncs when the screen opens, and again a few seconds after counts change
 * on the phone. A sync that fails isn't tried again until something changes.
 */
export function useTruckSync({ onDone, onError }: { onDone?: (r: SyncResult) => void; onError?: (e: unknown) => void } = {}) {
  const { client } = useOdoo();
  const stock = useStock();
  const { sync } = stock;
  const [syncing, setSyncing] = useState(false);
  const alive = useRef(true);
  const tried = useRef<string | null>(null);
  const handlers = useRef({ onDone, onError });
  handlers.current = { onDone, onError };
  const pending = unsyncedItems(stock);
  const key = pending.map((i) => `${i.id}:${i.onHand}`).join(',');

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const go = useCallback(() => {
    if (!client) return;
    tried.current = key;
    setSyncing(true);
    sync(client)
      .then((r) => alive.current && handlers.current.onDone?.(r))
      .catch((e) => {
        log.warn('stock', `auto sync failed: ${e instanceof Error ? e.message : String(e)}`);
        if (alive.current) handlers.current.onError?.(e);
      })
      .finally(() => alive.current && setSyncing(false));
  }, [client, sync, key]);

  // On open, and when signing in.
  useEffect(() => {
    if (client && stock.loaded) go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, stock.loaded]);

  // A few seconds after the last change.
  useEffect(() => {
    if (!client || !stock.truck || !key || key === tried.current) return;
    const t = setTimeout(go, AUTO_SYNC_MS);
    return () => clearTimeout(t);
  }, [client, stock.truck, key, go]);

  return { syncing, pending: pending.length };
}
