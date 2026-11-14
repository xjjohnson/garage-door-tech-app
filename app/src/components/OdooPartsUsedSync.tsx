/**
 * Puts the parts taken off the truck for a job on that job's Odoo order, in
 * the background while signed in, once the job is in Odoo. With Field Service
 * Stock they go as real stock moves off the truck (uses marked `move` when
 * they were taken, see odooPartMoves.ts); without it, as a note in the
 * order's chatter. Only parts used after this phone started sending to Odoo
 * go; older ones stay on the phone. Renders nothing.
 */
import { useCallback, useEffect, useRef } from 'react';
import { log } from '../lib/log';
import { partMovesSupport } from '../lib/odooPartMoves';
import { setMovesAvailable } from '../lib/partMovesGate';
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
  const latest = useRef({ jobs, used: stock.used, mark: stock.markUsesSent, moves: stock.recordMoves, since });
  latest.current = { jobs, used: stock.used, mark: stock.markUsesSent, moves: stock.recordMoves, since };
  const running = useRef(false);
  const online = status === 'signedIn' && !!client && jobsLoaded && stock.loaded && since !== null;

  const waiting = (stock.used ?? []).filter((u) => u.jobId && !u.sentAt && since !== null && u.at >= since && jobs.some((j) => j.id === u.jobId && j.odooJob)).length;

  // Find out once per sign-in whether parts can go as stock moves; until then (and signed out) they don't.
  useEffect(() => {
    if (status !== 'signedIn' || !client) {
      setMovesAvailable(false);
      return;
    }
    let live = true;
    partMovesSupport(client)
      .then((r) => {
        if (live) setMovesAvailable(r.ok);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [status, client]);

  const pass = useCallback(async () => {
    if (!client || running.current) return;
    running.current = true;
    try {
      const { jobs: J, mark, moves, since: from } = latest.current;
      if (from === null) return;
      // Uses marked as stock moves go through recordMoves, which never overlaps a truck sync.
      await moves(client).catch((e) => log.warn('odoo', `parts used as moves: ${e instanceof Error ? e.message : String(e)}`));
      const byJob = new Map<string, PartUse[]>();
      for (const u of latest.current.used ?? []) if (u.jobId && !u.sentAt && !u.move && u.at >= from) byJob.set(u.jobId, [...(byJob.get(u.jobId) ?? []), u]);
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
