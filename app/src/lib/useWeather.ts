import { useEffect, useMemo, useState } from 'react';
import { Point } from './geocode';
import { pretendOffline } from './devFlags';
import { log } from './log';
import { fetchHours, Hour, weatherKey, WeatherFetch } from './weather';

const FRESH_MS = 30 * 60 * 1000;
/** Kept in memory only: a forecast that old is worth nothing, and offline shows none. */
const cache = new Map<string, { hours: Hour[]; t: number }>();
const deps: { fetchFn: WeatherFetch; now: () => number } = { fetchFn: (url) => fetch(url), now: () => Date.now() };

/** For tests: a fake Open-Meteo. Returns a reset. */
export function setWeatherDeps(d: Partial<typeof deps>): () => void {
  const before = { ...deps };
  Object.assign(deps, d);
  cache.clear();
  return () => {
    Object.assign(deps, before);
    cache.clear();
  };
}

/** Forecast hours for each point (keyed by `weatherKey`); a point with no signal or no answer is just missing. */
export function useWeather(points: Point[]): Record<string, Hour[]> {
  const keys = useMemo(() => [...new Set(points.map(weatherKey))], [points]);
  const listKey = keys.join('|');
  const [, tick] = useState(0);

  useEffect(() => {
    if (pretendOffline()) return;
    let alive = true;
    const now = deps.now();
    for (const key of keys) {
      const hit = cache.get(key);
      if (hit && now - hit.t < FRESH_MS) continue;
      const [lat, lon] = key.split(',').map(Number);
      fetchHours(deps.fetchFn, { lat, lon })
        .then((hours) => {
          cache.set(key, { hours, t: deps.now() });
          if (alive) tick((n) => n + 1);
        })
        .catch((e) => log.warn('weather', `lookup failed: ${e instanceof Error ? e.message : String(e)}`));
    }
    return () => {
      alive = false;
    };
    // listKey stands for keys.
  }, [listKey]);

  const out: Record<string, Hour[]> = {};
  const now = deps.now();
  for (const key of keys) {
    const hit = cache.get(key);
    if (hit && now - hit.t < FRESH_MS) out[key] = hit.hours;
  }
  return out;
}
