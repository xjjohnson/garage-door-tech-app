/**
 * Address suggestions while typing, from Photon (photon.komoot.io): an
 * OpenStreetMap search made for type-ahead, with no key. (Nominatim, used
 * for the map, doesn't allow autocomplete.) Results lean toward Kyle, Buda
 * and Austin and come back as "400 Main St, Kyle, TX 78640" with their map
 * point, so a picked one needs no lookup later. Kept free of React; the
 * network call is passed in, so tests use a fake.
 */
import type { Customer } from './customers';
import type { GeoFetch, Point } from './geocode';

/** Kyle, between Buda and San Marcos: where most jobs are. */
export const HOME_AREA: Point = { lat: 29.99, lon: -97.88 };

export interface AddressSuggestion {
  /** "400 Main St, Kyle, TX 78640". */
  address: string;
  street: string;
  city: string;
  zip: string;
  point?: Point;
  /** Set when it's a saved customer (or an Odoo contact brought in as one). */
  customerId?: string;
  /** For a customer: their name, shown above the address. */
  name?: string;
}

const STATE_ABBR: Record<string, string> = { Texas: 'TX' };

/** Whether typing is far enough along to ask: a few characters with a letter in them. */
export const worthAsking = (q: string) => q.trim().length >= 4 && /[a-z]/i.test(q);

export function photonUrl(q: string, near: Point = HOME_AREA, limit = 5): string {
  return `https://photon.komoot.io/api/?q=${encodeURIComponent(q.trim())}&lat=${near.lat}&lon=${near.lon}&limit=${limit}&lang=en&layer=house&layer=street`;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown>;
}

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** One Photon result as an address, or null when it isn't a US street or house. */
export function fromPhoton(f: PhotonFeature): AddressSuggestion | null {
  const p = f.properties ?? {};
  if (s(p.countrycode).toUpperCase() !== 'US') return null;
  const road = s(p.street) || (s(p.type) === 'street' ? s(p.name) : '');
  if (!road) return null;
  const street = [s(p.housenumber), road].filter(Boolean).join(' ');
  const city = s(p.city) || s(p.town) || s(p.village) || s(p.locality) || s(p.district) || s(p.county);
  const state = STATE_ABBR[s(p.state)] ?? s(p.state);
  const zip = s(p.postcode).slice(0, 5);
  const address = [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const [lon, lat] = f.geometry?.coordinates ?? [];
  return { address, street, city, zip, ...(typeof lat === 'number' && typeof lon === 'number' ? { point: { lat, lon } } : {}) };
}

/** Addresses for what's been typed, best first, no repeats. Throws when the network or Photon fails. */
export async function suggestAddresses(fetchFn: GeoFetch, q: string, near: Point = HOME_AREA): Promise<AddressSuggestion[]> {
  if (!worthAsking(q)) return [];
  const res = await fetchFn(photonUrl(q, near), { headers: { Accept: 'application/json', 'User-Agent': 'Johnsons-field-app (garage door service)' } });
  if (!res.ok) throw new Error('Photon error');
  const data = (await res.json()) as { features?: PhotonFeature[] };
  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];
  for (const f of data.features ?? []) {
    const a = fromPhoton(f);
    if (!a || seen.has(a.address.toLowerCase())) continue;
    seen.add(a.address.toLowerCase());
    out.push(a);
  }
  return out;
}

const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Saved customers (Odoo contacts come in as customers) whose address or name matches what's typed. */
export function customerAddresses(customers: Customer[], q: string, limit = 3): AddressSuggestion[] {
  const k = squash(q);
  if (k.length < 3) return [];
  return customers
    .filter((c) => c.address.trim() && (squash(c.address).includes(k) || squash(c.name).includes(k)))
    .filter((c) => squash(c.address) !== k)
    .slice(0, limit)
    .map((c) => ({ address: c.address.trim(), street: '', city: '', zip: '', customerId: c.id, name: c.name }));
}
