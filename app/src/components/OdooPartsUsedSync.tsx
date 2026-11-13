/**
 * Notes the parts taken off the truck for a job in that job's Odoo order, in
 * the background while signed in, once the job is in Odoo. Only parts used
 * after this phone started sending to Odoo go; older ones stay on the phone.
 * Renders nothing.
 */
import { useCallback, useEffect, useRef } from 'react';
import { log } from '../lib/log';
import { postPartsUsed } from '../lib/odooStock';
import { onSyncNow } from '../lib/syncNow';
import { PartUse } from '../lib/stock';
import { useAppForeground } from '../lib/useAppForeground';
import { useJobs } from '../lib/useJobs';
import { useJobsSince } from '../lib/useJobsSince';
import { useOdoo } from '../lib/useOdoo';
import { useStock } from '../lib/useStock';

const EVERY_MS = 5 * 60_000;
const AFTER_CHANGE_MS = 4000;

export function OdooPartsUsedSync({ now = Date.now }: { now?: () => number }) {
  const { status, client } = useOdoo();
  const { jobs, loaded: jobsLoaded } = useJobs();
  const stock = useStock();
  const since = useJobsSince(now);
  const latest = useRef({ jobs, used: stock.used, mark: stock.markUsesSent, since });
  latest.current = { jobs, used: stock.used, mark: stock.markUsesSent, since };
  const running = useRef(false);
  const online = status === 'signedIn' && !!client && jobsLoaded && stock.loaded && since !== null;

  const waiting = (stock.used ?? []).filter((u) => u.jobId && !u.sentAt && since !== null && u.at >= since && jobs.some((j) => j.id === u.jobId && j.odooJob)).length;

  const pass = useCallback(async () => {
    if (!client || running.current) return;
    running.current = true;
    try {
      const { jobs: J, used, mark, since: from } = latest.current;
      if (from === null) return;
      const byJob = new Map<string, PartUse[]>();
      for (const u of used ?? []) if (u.jobId && !u.sentAt && u.at >= from) byJob.set(u.jobId, [...(byJob.get(u.jobId) ?? []), u]);
      for (const [jobId, uses] of byJob) {
        const ref = J.find((j) => j.id === jobId)?.odooJob;
        if (!ref) continue;
        try {
          await postPartsUsed(client, ref, uses);
          mark(uses.map((u) => u.id), now());
        } catch (e) {
          log.warn('odoo', `parts used on ${ref.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } finally {
      running.current = false;
    }
  }, [client, now]);

  useEffect(() => {
    if (!online) return;
    const t = setInterval(pass, EVERY_MS);
    return () => clearInterval(t);
  }, [online, pass]);

  useEffect(() => {
    if (!online || waiting === 0) return;
    const t = setTimeout(pass, AFTER_CHANGE_MS);
    return () => clearTimeout(t);
  }, [online, waiting, pass]);

  useAppForeground(() => {
    if (online) pass();
  });
  useEffect(() => (online ? onSyncNow(pass) : undefined), [online, pass]);
  return null;
}
