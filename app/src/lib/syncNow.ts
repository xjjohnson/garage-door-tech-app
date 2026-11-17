/**
 * "Sync now": the background syncs (jobs and visits, photos, invoices) each
 * listen here and run a pass straight away when it's asked for, instead of
 * waiting for their next turn. Kept free of React.
 */
type Listener = () => unknown;

const listeners = new Set<Listener>();

/** Runs `fn` whenever Sync now is tapped; returns the unsubscribe. */
export function onSyncNow(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export interface SyncStatus {
  running: boolean;
  /** When the last Sync now pass finished, with or without problems. */
  lastRunAt: number | null;
  /** When the last pass finished with no problems. */
  lastOkAt: number | null;
  /** What went wrong in the last pass, if anything. */
  lastError: string | null;
  lastErrorAt: number | null;
}

let status: SyncStatus = { running: false, lastRunAt: null, lastOkAt: null, lastError: null, lastErrorAt: null };
const watchers = new Set<() => void>();
const setStatus = (next: Partial<SyncStatus>) => {
  status = { ...status, ...next };
  watchers.forEach((w) => w());
};

/** How the last Sync now went, for the Developer screen. */
export function syncStatus(): SyncStatus {
  return status;
}

export function onSyncStatus(fn: () => void): () => void {
  watchers.add(fn);
  return () => {
    watchers.delete(fn);
  };
}

/** For tests. */
export function resetSyncStatus() {
  status = { running: false, lastRunAt: null, lastOkAt: null, lastError: null, lastErrorAt: null };
}

/** Asks every background sync to run now; resolves once they've all finished their pass. */
export async function requestSyncNow(now: () => number = Date.now): Promise<void> {
  setStatus({ running: true });
  const errors: string[] = [];
  await Promise.all(
    [...listeners].map((fn) =>
      Promise.resolve()
        .then(fn)
        .catch((e) => {
          errors.push(e instanceof Error ? e.message : String(e));
        }),
    ),
  );
  const t = now();
  setStatus(errors.length ? { running: false, lastRunAt: t, lastError: errors[0], lastErrorAt: t } : { running: false, lastRunAt: t, lastOkAt: t });
}
