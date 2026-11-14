/**
 * Sends notes written on the phone (with their photos and voice notes) to
 * Odoo in the background: shortly after one is added, when the app comes back,
 * on Sync now, and every few minutes. A note that fails waits for the next
 * pass. Renders nothing.
 */
import { useCallback, useEffect, useRef } from 'react';
import { log } from '../lib/log';
import { onOutboxChange, sendOutbox } from '../lib/odooNotes';
import { onSyncNow } from '../lib/syncNow';
import { useAppForeground } from '../lib/useAppForeground';
import { useAttachments } from '../lib/useAttachments';
import { useOdoo } from '../lib/useOdoo';

const EVERY_MS = 5 * 60_000;
const AFTER_CHANGE_MS = 2000;

export function OdooNotesSync() {
  const { status, client } = useOdoo();
  const { media } = useAttachments();
  const running = useRef(false);
  const read = media?.fileBase64;
  const online = status === 'signedIn' && !!client && !!read;

  const pass = useCallback(async () => {
    if (!client || !read || running.current) return;
    running.current = true;
    try {
      await sendOutbox(client, read, (e) => log.warn('odoo', `note: ${e instanceof Error ? e.message : String(e)}`));
    } finally {
      running.current = false;
    }
  }, [client, read]);

  useEffect(() => {
    if (!online) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      if (t) clearTimeout(t);
      t = setTimeout(pass, AFTER_CHANGE_MS);
    };
    soon();
    const off = onOutboxChange(soon);
    return () => {
      off();
      if (t) clearTimeout(t);
    };
  }, [online, pass]);

  useEffect(() => {
    if (!online) return;
    const t = setInterval(pass, EVERY_MS);
    return () => clearInterval(t);
  }, [online, pass]);

  useAppForeground(useCallback(() => online && pass(), [online, pass]));
  useEffect(() => (online ? onSyncNow(pass) : undefined), [online, pass]);
  return null;
}
