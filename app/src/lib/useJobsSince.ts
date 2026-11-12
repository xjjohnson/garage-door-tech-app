/**
 * When this phone started sending its jobs to Odoo (from 0.5.9). Set the
 * first time the app runs this version, so jobs saved before then aren't sent
 * on their own: the tech picks which older ones go (src/app/odoo-older-jobs.tsx).
 * Null until it has been read.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { JOBS_SINCE_KEY } from './odooJobs';

let since: number | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load(now: () => number) {
  loading ??= AsyncStorage.getItem(JOBS_SINCE_KEY)
    .then(async (v) => {
      const n = Number(v);
      if (v && Number.isFinite(n)) since = n;
      else {
        since = now();
        await AsyncStorage.setItem(JOBS_SINCE_KEY, String(since)).catch(() => undefined);
      }
    })
    .catch(() => {
      since = now();
    })
    .finally(() => listeners.forEach((l) => l()));
}

export function useJobsSince(now: () => number = Date.now): number | null {
  useEffect(() => load(now), [now]);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => since,
  );
}

/** For tests: forget what was read, so the next render reads storage again. */
export function resetJobsSince() {
  since = null;
  loading = null;
}
