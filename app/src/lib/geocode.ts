/**
 * Turning addresses into map points with OpenStreetMap's Nominatim, kept on
 * the phone so each address is looked up once. Nominatim's rules ask for at
 * most one lookup a second and a name for the app, so lookups go one at a
 * time. Kept free of React; the network call, the clock and the wait are
 * passed in, so tests use fakes.
 */
export const GEOCODE_STORAGE_KEY = 'geocode/v1';

export interface Point {
  lat: number;
  lon: number;
}

/** A found point, or `null` when Nominatim had nothing (asked again after a week). */
export interface CacheEntry {
  p: Point | null;
  /** When it was looked up, ms. */
  t: number;
}

export type GeoCache = Record<string, CacheEntry>;

export const MISS_RETRY_MS = 7 * 24 * 3600 * 1000;
/** Nominatim allows one lookup a second; a little more to be safe. */
export const GAP_MS = 1100;

export type GeoFetch = (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/** The cache key: lower case, single spaces, no stray commas. */
export function addressKey(address: string): string {
  return address.toLowerCase().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').replace(/^[ ,]+|[ ,]+$/g, '');
}

export function parseCache(raw: string | null): GeoCache {
  try {
    const d = raw ? JSON.parse(raw) : null;
    if (!d || typeof d !== 'object' || Array.isArray(d)) return {};
    const out: GeoCache = {};
    for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
      const e = v as { p?: unknown; t?: unknown };
      if (typeof e?.t !== 'number') continue;
      const p = e.p as { lat?: unknown; lon?: unknown } | null;
      if (p === null) out[k] = { p: null, t: e.t };
      else if (p && typeof p.lat === 'number' && typeof p.lon === 'number') out[k] = { p: { lat: p.lat, lon: p.lon }, t: e.t };
    }
    return out;
  } catch {
    return {};
  }
}

/** What the cache already knows: a point, `null` for a recent miss, `undefined` to look it up. */
export function cached(cache: GeoCache, address: string, now: number): Point | null | undefined {
  const e = cache[addressKey(address)];
  if (!e) return undefined;
  if (e.p === null && now - e.t > MISS_RETRY_MS) return undefined;
  return e.p;
}

export function nominatimUrl(address: string): string {
  return `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`;
}

/** Looks one address up. Throws when the network or Nominatim fails, so a miss is only saved when it really found nothing. */
export async function lookUp(fetchFn: GeoFetch, address: string): Promise<Point | null> {
  const res = await fetchFn(nominatimUrl(address), { headers: { Accept: 'application/json', 'User-Agent': 'Johnsons-field-app (garage door service)' } });
  if (!res.ok) throw new Error('Nominatim error');
  const rows = (await res.json()) as { lat?: string; lon?: string }[];
  const r = Array.isArray(rows) ? rows[0] : undefined;
  const lat = Number(r?.lat);
  const lon = Number(r?.lon);
  return r && Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

/** Straight-line miles between two points. */
export function miles(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "3.2 mi", or "0.4 mi". */
export function formatMiles(m: number): string {
  return `${m < 10 ? m.toFixed(1) : Math.round(m)} mi`;
}

/** Google Maps directions to a place, by point when known (exact) and by address otherwise. */
export function googleNavLink(address: string, p?: Point | null): string {
  const dest = p ? `${p.lat},${p.lon}` : address;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}

/** Waze, by point when known. */
export function wazeNavLink(address: string, p?: Point | null): string {
  return p ? `https://waze.com/ul?ll=${p.lat},${p.lon}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

/**
 * The whole day in Google Maps, from where the phone is: the last stop is
 * the destination and the others are stops on the way, in order. Google's
 * phone app takes up to 9 stops on the way.
 */
export function googleRouteLink(addresses: string[]): string | undefined {
  const list = addresses.filter((a) => a.trim());
  if (list.length === 0) return undefined;
  const dest = list[list.length - 1];
  const way = list.slice(0, -1).slice(0, 9);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving${way.length ? `&waypoints=${encodeURIComponent(way.join('|'))}` : ''}`;
}
