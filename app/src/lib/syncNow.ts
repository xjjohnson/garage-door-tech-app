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

/** Asks every background sync to run now; resolves once they've all finished their pass. */
export async function requestSyncNow(): Promise<void> {
  await Promise.all([...listeners].map((fn) => Promise.resolve().then(fn).catch(() => undefined)));
}
