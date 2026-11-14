/**
 * Weather for a visit, from Open-Meteo (free, no key). Read-only and only
 * when there's signal: with none, the visit simply shows no weather. Kept
 * free of React; the network call is passed in so tests use a fake.
 */
import { Point } from './geocode';

export interface Hour {
  /** Local time at the house, "2026-11-14T15:00". */
  time: string;
  tempF: number;
  /** Chance of rain, percent. */
  rain: number;
  /** WMO weather code. */
  code: number;
}

export type WeatherFetch = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/** Two decimals is about a kilometre: close enough for weather, and houses on a street share one lookup. */
export function weatherKey(p: Point): string {
  return `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
}

export function weatherUrl(p: Point): string {
  return (
    'https://api.open-meteo.com/v1/forecast?' +
    `latitude=${p.lat.toFixed(2)}&longitude=${p.lon.toFixed(2)}` +
    '&hourly=temperature_2m,precipitation_probability,weather_code' +
    '&temperature_unit=fahrenheit&timezone=auto&forecast_days=3'
  );
}

export function parseHours(data: unknown): Hour[] {
  const h = (data as { hourly?: Record<string, unknown> } | null)?.hourly;
  const times = h?.time;
  const temp = h?.temperature_2m;
  const rain = h?.precipitation_probability;
  const code = h?.weather_code;
  if (!Array.isArray(times) || !Array.isArray(temp)) return [];
  const out: Hour[] = [];
  times.forEach((time, i) => {
    const t = temp[i];
    if (typeof time !== 'string' || typeof t !== 'number') return;
    const r = Array.isArray(rain) ? rain[i] : 0;
    const c = Array.isArray(code) ? code[i] : 0;
    out.push({ time, tempF: t, rain: typeof r === 'number' ? r : 0, code: typeof c === 'number' ? c : 0 });
  });
  return out;
}

export async function fetchHours(fetchFn: WeatherFetch, p: Point): Promise<Hour[]> {
  const res = await fetchFn(weatherUrl(p));
  if (!res.ok) throw new Error('weather lookup failed');
  return parseHours(await res.json());
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11-14T15" for a moment, in the phone's own clock (which is the house's, for a tech on the road). */
export function hourStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}`;
}

/** The forecast hours from `start` through `start + minutes`, at least one. */
export function hoursFor(hours: Hour[], start: number, minutes: number): Hour[] {
  const first = hourStamp(start);
  const last = hourStamp(start + Math.max(minutes, 60) * 60000 - 1);
  return hours.filter((x) => x.time.slice(0, 13) >= first && x.time.slice(0, 13) <= last);
}

export interface Summary {
  tempF: number;
  rain: number;
  /** Plain words: "Rain likely", "Hot", "Cold", "Clear"... */
  label: string;
  /** Worth a second look before loading the truck: rain, storm, snow, or extreme heat or cold. */
  warn: boolean;
}

function describe(code: number, rain: number, tempF: number): { label: string; warn: boolean } {
  if (code >= 95) return { label: 'Thunderstorms', warn: true };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Snow', warn: true };
  if (rain >= 50 || (code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Rain likely', warn: true };
  if (tempF >= 100) return { label: 'Very hot', warn: true };
  if (tempF <= 32) return { label: 'Freezing', warn: true };
  if (rain >= 30) return { label: 'Chance of rain', warn: false };
  if (tempF >= 90) return { label: 'Hot', warn: false };
  if (code === 0 || code === 1) return { label: 'Clear', warn: false };
  if (code === 2 || code === 3) return { label: 'Cloudy', warn: false };
  if (code === 45 || code === 48) return { label: 'Fog', warn: false };
  return { label: 'Showers', warn: false };
}

/** The worst of a few hours: hottest, wettest, and the most worrying code. */
export function summarize(hours: Hour[]): Summary | null {
  if (hours.length === 0) return null;
  const tempF = Math.round(Math.max(...hours.map((h) => h.tempF)));
  const rain = Math.max(...hours.map((h) => h.rain));
  const code = Math.max(...hours.map((h) => h.code));
  return { tempF, rain, ...describe(code, rain, tempF) };
}

/** "Rain likely · 62°F · 70% rain". */
export function weatherText(s: Summary): string {
  return `${s.label} · ${s.tempF}°F${s.rain >= 10 ? ` · ${s.rain}% rain` : ''}`;
}
