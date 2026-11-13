import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { pretendOffline } from './devFlags';
import { addressKey, cached, GAP_MS, GEOCODE_STORAGE_KEY, GeoCache, GeoFetch, geocodeAddress, parseCache, Point } from './geocode';
import { log } from './log';

/**
 * One queue for the whole app, so two screens never look up at once and
 * Nominatim sees at most one lookup a second.
 */
let cache: GeoCache | null = null;
let loading: Promise<GeoCache> | null = null;
const queue: string[] = [];
let running = false;
let lastCall = 0;
const listeners = new Set<() => void>();

const deps: { fetchFn: GeoFetch; sleep: (ms: number) => Promise<void>; now: () => number } = {
  fetchFn: (url, init) => fetch(url, init),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
};

/** For tests: a fake Nominatim and no waiting. Returns a reset. */
export function setGeocodeDeps(d: Partial<typeof deps>): () => void {
  const before = { ...deps };
  Object.assign(deps, d);
  return () => {
    Object.assign(deps, before);
    cache = null;
    loading = null;
    queue.length = 0;
    running = false;
    lastCall = 0;
  };
}

function load(): Promise<GeoCache> {
  if (cache) return Promise.resolve(cache);
  if (!loading) {
    loading = AsyncStorage.getItem(GEOCODE_STORAGE_KEY)
      .catch(() => null)
      .then((raw) => {
        cache = { ...parseCache(raw), ...(cache ?? {}) };
        return cache;
      });
  }
  return loading;
}

const notify = () => listeners.forEach((l) => l());

async function run() {
  if (running) return;
  running = true;
  try {
    const c = await load();
    while (queue.length) {
      const address = queue[0];
      if (cached(c, address, deps.now()) === undefined && !pretendOffline()) {
        // One lookup a second, however many tries an address takes.
        const pace = async () => {
          const wait = lastCall + GAP_MS - deps.now();
          if (wait > 0) await deps.sleep(wait);
          lastCall = deps.now();
        };
        try {
          await pace();
          const p = await geocodeAddress(deps.fetchFn, address, pace);
          c[addressKey(address)] = { p, t: deps.now() };
          AsyncStorage.setItem(GEOCODE_STORAGE_KEY, JSON.stringify(c)).catch(() => undefined);
        } catch (e) {
          // No signal or Nominatim busy: leave it for next time.
          log.warn('map', `address lookup failed: ${e instanceof Error ? e.message : String(e)}`);
          queue.length = 0;
          notify();
          break;
        }
      }
      queue.shift();
      notify();
    }
  } finally {
    running = false;
  }
}

/** Saves a point already known for an address (a picked address suggestion), so the map never looks it up. */
export function rememberPoint(address: string, p: Point) {
  load().then((c) => {
    c[addressKey(address)] = { p, t: deps.now() };
    AsyncStorage.setItem(GEOCODE_STORAGE_KEY, JSON.stringify(c)).catch(() => undefined);
    notify();
  });
}

/** Forgets what was found for an address (or that nothing was) and looks it up again. */
export function retryGeocode(address: string) {
  load().then((c) => {
    delete c[addressKey(address)];
    AsyncStorage.setItem(GEOCODE_STORAGE_KEY, JSON.stringify(c)).catch(() => undefined);
    if (!queue.includes(address.trim())) queue.push(address.trim());
    notify();
    run();
  });
}

/**
 * Map points for addresses, looked up in the background and kept on the
 * phone. `points` has each address that's been answered (`null` when
 * nothing was found); `waiting` counts the rest.
 */
export function useGeocode(addresses: string[]): { points: Record<string, Point | null>; waiting: number } {
  const list = useMemo(() => [...new Set(addresses.map((a) => a.trim()).filter(Boolean))], [addresses]);
  const listKey = list.join('\n');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    let alive = true;
    load().then((c) => {
      if (!alive) return;
      const now = deps.now();
      for (const a of list) if (cached(c, a, now) === undefined && !queue.includes(a)) queue.push(a);
      setTick((n) => n + 1);
      run();
    });
    return () => {
      alive = false;
      listeners.delete(l);
    };
    // listKey stands for list.
  }, [listKey]);

  return useMemo(() => {
    const points: Record<string, Point | null> = {};
    let waiting = 0;
    const now = deps.now();
    for (const a of list) {
      const v = cache ? cached(cache, a, now) : undefined;
      if (v !== undefined) points[a] = v;
      else if (queue.includes(a)) waiting++;
    }
    return { points, waiting };
    // tick re-reads the shared cache.
  }, [listKey, tick]);
}
