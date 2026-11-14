/**
 * Keeps the inspection checklist in step with Odoo's Surveys: reads it after
 * sign-in, when the app comes back and every 15 minutes, keeps a copy on the
 * phone for offline use, and uses the built-in checklist until Odoo has one.
 * Renders nothing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect } from 'react';
import { setChecklist } from '../lib/inspection';
import { log } from '../lib/log';
import { CHECKLIST_STORAGE_KEY, fetchChecklist, parseChecklist } from '../lib/odooChecklist';
import { onSyncNow } from '../lib/syncNow';
import { useAppForeground } from '../lib/useAppForeground';
import { useOdoo } from '../lib/useOdoo';

const EVERY_MS = 15 * 60_000;

export function OdooChecklistSync() {
  const { status, client } = useOdoo();
  const online = status === 'signedIn' && !!client;

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(CHECKLIST_STORAGE_KEY)
      .catch(() => null)
      .then((raw) => {
        const c = parseChecklist(raw);
        if (live && c) setChecklist(c);
      });
    return () => {
      live = false;
    };
  }, []);

  const pass = useCallback(async () => {
    if (!client) return;
    try {
      const c = await fetchChecklist(client);
      if (!c) return;
      setChecklist(c);
      await AsyncStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(c)).catch(() => undefined);
    } catch (e) {
      log.warn('odoo', `checklist: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [client]);

  useEffect(() => {
    if (!online) return;
    pass();
    const t = setInterval(pass, EVERY_MS);
    return () => clearInterval(t);
  }, [online, pass]);

  useAppForeground(useCallback(() => online && pass(), [online, pass]));
  useEffect(() => (online ? onSyncNow(pass) : undefined), [online, pass]);
  return null;
}
