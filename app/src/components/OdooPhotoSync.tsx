/**
 * Sends job photos to the job in Odoo in the background while signed in: a
 * photo goes once its job is in Odoo, a few at a time, shortly after it's
 * taken, when the app comes back, and every few minutes. A photo that fails
 * waits for the next pass. Deleting a photo on the phone leaves Odoo's copy.
 * Renders nothing.
 */
import { useCallback, useEffect, useRef } from 'react';
import { log } from '../lib/log';
import { onSyncNow } from '../lib/syncNow';
import { photosToSend, sendPhoto } from '../lib/odooPhotos';
import { useAppForeground } from '../lib/useAppForeground';
import { useAttachments } from '../lib/useAttachments';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';

const EVERY_MS = 5 * 60_000;
const AFTER_CHANGE_MS = 3000;
/** Photos sent in one pass, so a slow signal isn't tied up. */
const BATCH = 4;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function OdooPhotoSync() {
  const { status, client } = useOdoo();
  const { jobs, loaded: jobsLoaded } = useJobs();
  const { photos, media, loaded, markPhotoSent } = useAttachments();
  const running = useRef(false);
  const latest = useRef({ photos, jobs });
  latest.current = { photos, jobs };

  const read = media?.photoDataUrl;
  const online = status === 'signedIn' && !!client && !!read && loaded && jobsLoaded;
  const waiting = online ? photosToSend(photos, jobs).length : 0;

  const pass = useCallback(async () => {
    if (!client || !read || running.current) return;
    running.current = true;
    try {
      for (const { photo, ref } of photosToSend(latest.current.photos, latest.current.jobs).slice(0, BATCH)) {
        try {
          const data = await read(photo.uri);
          if (!data) continue;
          markPhotoSent(photo.id, await sendPhoto(client, ref, photo, data));
        } catch (e) {
          log.warn('odoo', `photo to ${ref.name}: ${message(e)}`);
          break;
        }
      }
    } finally {
      running.current = false;
    }
  }, [client, read, markPhotoSent]);

  useEffect(() => {
    if (!online || waiting === 0) return;
    const t = setTimeout(pass, AFTER_CHANGE_MS);
    return () => clearTimeout(t);
  }, [online, waiting, pass]);

  useEffect(() => {
    if (!online) return;
    const t = setInterval(pass, EVERY_MS);
    return () => clearInterval(t);
  }, [online, pass]);

  useAppForeground(useCallback(() => online && pass(), [online, pass]));
  useEffect(() => (online ? onSyncNow(pass) : undefined), [online, pass]);
  return null;
}
