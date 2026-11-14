/**
 * Puts the parts Justin tracks on the house's Field Service
 * location in Odoo as equipment, with the job's warranty, in the background
 * while signed in. It reads the invoices: a part ticked under "Track as
 * equipment" on an invoice makes (or updates) its equipment record; the warranty comes from
 * the invoice's "Warranty on this job". Only invoices made after this phone
 * started doing this go up, so an update never sends old invoices in bulk.
 * Renders nothing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { log } from '../lib/log';
import { equipmentKey, equipmentReady, orderLocation, sendEquipment, soldEquipment } from '../lib/odooEquipment';
import { onSyncNow } from '../lib/syncNow';
import { useAppForeground } from '../lib/useAppForeground';
import { useFollowUps } from '../lib/useFollowUps';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';

export const EQUIPMENT_SYNC_KEY = 'johnsons.equipmentSync.v1';

const EVERY_MS = 5 * 60_000;
const AFTER_CHANGE_MS = 3000;

interface Store {
  since: number;
  /** Invoice id → what was sent for it, so an unchanged invoice isn't sent again. */
  done: Record<string, string>;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function OdooEquipmentSync() {
  const { status, client } = useOdoo();
  const { jobs, loaded: jobsLoaded } = useJobs();
  const { invoices } = useInvoices();
  const { settings } = useFollowUps();
  const [store, setStore] = useState<Store | null>(null);
  const running = useRef(false);
  const latest = useRef({ jobs, invoices, settings, store });
  latest.current = { jobs, invoices, settings, store };

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(EQUIPMENT_SYNC_KEY)
      .catch(() => null)
      .then(async (v) => {
        let s: Store | null = null;
        try {
          const d = JSON.parse(v ?? 'null');
          if (d && typeof d.since === 'number') s = { since: d.since, done: d.done && typeof d.done === 'object' ? d.done : {} };
        } catch {
          // Start fresh.
        }
        if (!s) {
          s = { since: Date.now(), done: {} };
          await AsyncStorage.setItem(EQUIPMENT_SYNC_KEY, JSON.stringify(s)).catch(() => undefined);
        }
        if (live) setStore(s);
      });
    return () => {
      live = false;
    };
  }, []);

  const online = status === 'signedIn' && !!client && jobsLoaded && store !== null;
  // Cheap check for the timers: any invoice since the start that isn't done yet.
  const pending = online ? invoices.filter((i) => !i.voidedAt && i.createdAt >= store!.since && soldEquipment(i, settings).length > 0 && store!.done[i.id] === undefined && jobs.some((j) => j.id === i.jobId && j.odooJob)).length : 0;

  const pass = useCallback(async () => {
    const cur = latest.current;
    if (!client || !cur.store || running.current) return;
    running.current = true;
    try {
      const todo = cur.invoices
        .filter((i) => !i.voidedAt && i.createdAt >= cur.store!.since)
        .map((inv) => ({ inv, items: soldEquipment(inv, cur.settings), job: cur.jobs.find((j) => j.id === inv.jobId) }))
        .filter((x) => x.items.length && x.job?.odooJob?.model === 'fsm.order' && cur.store!.done[x.inv.id] !== equipmentKey(x.items));
      if (!todo.length) return;
      const ready = await equipmentReady(client);
      if (!ready) return;
      const done = { ...cur.store.done };
      for (const { inv, items, job } of todo) {
        try {
          const loc = await orderLocation(client, job!.odooJob!.id);
          if (!loc) continue;
          const n = await sendEquipment(client, loc, items, ready);
          log.info('odoo', `${n} door/opener record(s) on location ${loc} (invoice ${inv.number})`);
          done[inv.id] = equipmentKey(items);
        } catch (e) {
          log.warn('odoo', `equipment for invoice ${inv.number}: ${message(e)}`);
          break;
        }
      }
      const next = { ...cur.store, done };
      await AsyncStorage.setItem(EQUIPMENT_SYNC_KEY, JSON.stringify(next)).catch(() => undefined);
      setStore(next);
    } finally {
      running.current = false;
    }
  }, [client]);

  useEffect(() => {
    if (!online || pending === 0) return;
    const t = setTimeout(pass, AFTER_CHANGE_MS);
    return () => clearTimeout(t);
  }, [online, pending, pass]);

  useEffect(() => {
    if (!online) return;
    const t = setInterval(pass, EVERY_MS);
    return () => clearInterval(t);
  }, [online, pass]);

  useAppForeground(useCallback(() => online && pass(), [online, pass]));
  useEffect(() => (online ? onSyncNow(pass) : undefined), [online, pass]);
  return null;
}
