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
  /** Placed by ZIP code only, because the street wasn't found: roughly right, not at the door. */
  approx?: boolean;
}

/** A found point, or `null` when Nominatim had nothing (asked again after a day). */
export interface CacheEntry {
  p: Point | null;
  /** When it was looked up, ms. */
  t: number;
}

export type GeoCache = Record<string, CacheEntry>;

export const MISS_RETRY_MS = 24 * 3600 * 1000;
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
      else if (p && typeof p.lat === 'number' && typeof p.lon === 'number') out[k] = { p: { lat: p.lat, lon: p.lon, ...((p as { approx?: unknown }).approx === true ? { approx: true } : {}) }, t: e.t };
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

/** The street, city and ZIP in an address typed any which way: "400 Main St, Kyle TX 78640", "400 Main St Kyle 78640"... */
export function addressParts(address: string): { street: string; city: string; zip: string } {
  // The last 5-digit number is the ZIP, unless it's the house number at the start.
  const hits = [...address.matchAll(/\b\d{5}(?:-\d{4})?\b/g)].filter((m) => (m.index ?? 0) > address.search(/\S/));
  const last = hits[hits.length - 1];
  const zip = last ? last[0].slice(0, 5) : '';
  const noZip = last ? address.slice(0, last.index) + address.slice((last.index ?? 0) + last[0].length) : address;
  const clean = (t: string) => t.replace(/\b(TX|Texas|USA|US)\b\.?/gi, ' ').replace(/\s+/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '');
  const parts = noZip.split(',').map(clean).filter(Boolean);
  if (parts.length >= 2) return { street: parts[0], city: parts.slice(1).join(' '), zip };
  // No commas: the street ends at its suffix (St, Blvd, Dr...), the rest is the city.
  const one = parts[0] ?? '';
  const m = one.match(/^(.*?\b(?:st|street|rd|road|dr|drive|ave|avenue|blvd|boulevard|ln|lane|ct|court|cir|circle|way|trl|trail|pkwy|parkway|hwy|highway|pl|place|loop|cv|cove|ter|terrace|path|run|pass|bend)\.?)\s+(.+)$/i);
  return m ? { street: m[1], city: m[2], zip } : { street: one, city: '', zip };
}

export interface GeoQuery {
  params: Record<string, string>;
  /** A hit from this query is only roughly where the customer is. */
  approx: boolean;
}

/**
 * What to ask Nominatim, best first: the address as typed, then the street
 * with the ZIP (a city that doesn't match the ZIP, say "Austin 78640",
 * makes the whole address miss), then the street with the city, and last
 * the ZIP alone, which puts the pin in the middle of the ZIP area.
 */
export function geoQueries(address: string): GeoQuery[] {
  const { street, city, zip } = addressParts(address);
  const hasNumber = /^\d/.test(street);
  const out: GeoQuery[] = [{ params: { q: address.trim() }, approx: false }];
  if (hasNumber && zip) out.push({ params: { street, postalcode: zip }, approx: false });
  if (hasNumber && city) out.push({ params: { q: `${street}, ${city}` }, approx: false });
  if (zip) out.push({ params: { postalcode: zip }, approx: true });
  const seen = new Set<string>();
  return out.filter((g) => {
    const k = JSON.stringify(g.params);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function nominatimUrl(params: Record<string, string> | string): string {
  const p = typeof params === 'string' ? { q: params } : params;
  const query = Object.entries(p)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&${query}`;
}

const HEADERS = { Accept: 'application/json', 'User-Agent': 'Johnsons-field-app (garage door service)' };

async function ask(fetchFn: GeoFetch, params: Record<string, string>): Promise<Point | null> {
  const res = await fetchFn(nominatimUrl(params), { headers: HEADERS });
  if (!res.ok) throw new Error('Nominatim error');
  const rows = (await res.json()) as { lat?: string; lon?: string }[];
  const r = Array.isArray(rows) ? rows[0] : undefined;
  const lat = Number(r?.lat);
  const lon = Number(r?.lon);
  return r && Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

/** Looks the address up as typed only. Throws when the network or Nominatim fails, so a miss is only saved when it really found nothing. */
export function lookUp(fetchFn: GeoFetch, address: string): Promise<Point | null> {
  return ask(fetchFn, { q: address });
}

/**
 * Tries each of `geoQueries` until one finds the place. `pace` is awaited
 * before every call after the first, to keep to Nominatim's one a second.
 */
export async function geocodeAddress(fetchFn: GeoFetch, address: string, pace: () => Promise<void> = async () => undefined): Promise<Point | null> {
  const queries = geoQueries(address);
  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await pace();
    const p = await ask(fetchFn, queries[i].params);
    if (p) return queries[i].approx ? { ...p, approx: true } : p;
  }
  return null;
}

/** Google Maps searching for an address, to see where Google thinks it is. */
export function googleSearchLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
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
