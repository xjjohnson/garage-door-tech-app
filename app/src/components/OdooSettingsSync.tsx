/**
 * Keeps the business details (name, phone, Cash App, Venmo, Zelle, review
 * link) in step with the settings file on the Odoo company, in the
 * background while signed in. What is in Odoo wins on every phone, except an
 * owner's edit that is still waiting to go up. Nothing is sent until the
 * owner edits or taps Save to Odoo, so a phone's old values are never
 * written over Odoo by themselves. Renders nothing.
 */
import { useCallback, useEffect, useRef } from 'react';
import { log } from '../lib/log';
import { sameBusiness, readSettings, writeSettings } from '../lib/odooSettings';
import { clearPending, onQueued, pendingBusiness } from '../lib/settingsSync';
import { onSyncNow } from '../lib/syncNow';
import { useAppForeground } from '../lib/useAppForeground';
import { useInvoices } from '../lib/useInvoices';
import { useOdoo } from '../lib/useOdoo';

const EVERY_MS = 10 * 60_000;
const AFTER_EDIT_MS = 1500;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function OdooSettingsSync() {
  const { status, client } = useOdoo();
  const { loaded, setBusiness } = useInvoices();
  const running = useRef(false);
  const online = status === 'signedIn' && !!client && loaded;

  const pass = useCallback(async () => {
    if (!client || running.current) return;
    running.current = true;
    try {
      const edit = pendingBusiness();
      if (edit) {
        await writeSettings(client, { business: edit });
        clearPending(edit);
        log.info('odoo', 'business details saved on the company');
        return;
      }
      const saved = await readSettings(client);
      if (saved) setBusiness((cur) => (sameBusiness(cur, saved.business) ? cur : saved.business));
    } catch (e) {
      log.warn('odoo', `business details sync: ${message(e)}`);
    } finally {
      running.current = false;
    }
  }, [client, setBusiness]);

  useEffect(() => {
    if (!online) return;
    pass();
    const t = setInterval(pass, EVERY_MS);
    return () => clearInterval(t);
  }, [online, pass]);

  useEffect(() => {
    if (!online) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = onQueued(() => {
      clearTimeout(t);
      t = setTimeout(pass, AFTER_EDIT_MS);
    });
    return () => {
      clearTimeout(t);
      off();
    };
  }, [online, pass]);

  useAppForeground(() => {
    if (online) pass();
  });

  useEffect(() => {
    if (!online) return;
    return onSyncNow(pass);
  }, [online, pass]);

  return null;
}
