/**
 * Where the techs are, kept in Odoo and nowhere else. While a tech is clocked
 * in and the app is open, their phone writes its position onto their own
 * contact in Odoo (the contact's latitude and longitude, which Odoo already
 * has for maps). Dispatchers and the owner read it back. No outside tracking
 * service; only the latest position is kept, and Odoo's own "last changed"
 * time on the contact says how fresh it is. Kept free of React.
 */
import type { OdooClient } from './odoo';

type Caller = Pick<OdooClient, 'call' | 'session'>;

/** A position older than this is shown as "last seen", not live. */
export const LIVE_MINUTES = 15;

export interface TechPosition {
  /** The Field Service worker's id. */
  id: number;
  name: string;
  lat: number;
  lon: number;
  /** When Odoo last saw the position change, ms. */
  at: number;
}

const partnerCache = new Map<string, number>();

/** The signed-in user's own contact id. */
async function myPartner(c: Caller): Promise<number> {
  const key = `${c.session.url}|${c.session.db}|${c.session.uid}`;
  const hit = partnerCache.get(key);
  if (hit) return hit;
  const rows = (await c.call('res.users', 'read', [[c.session.uid]], { fields: ['partner_id'] })) as { partner_id?: [number, string] | false }[];
  const id = Array.isArray(rows[0]?.partner_id) ? rows[0]!.partner_id[0] : 0;
  if (!id) throw new Error("Couldn't find your contact in Odoo.");
  partnerCache.set(key, id);
  return id;
}

/** Writes this phone's position onto the signed-in tech's own contact. */
export async function sharePosition(c: Caller, lat: number, lon: number, now = Date.now()): Promise<void> {
  const partner = await myPartner(c);
  await c.call('res.partner', 'write', [[partner], { partner_latitude: lat, partner_longitude: lon, date_localization: new Date(now).toISOString().slice(0, 10) }]);
}

const odooMs = (v: unknown) => (typeof v === 'string' ? Date.parse(`${v.replace(' ', 'T')}Z`) : NaN);

/** Every Field Service worker whose contact has a position, newest first. A worker with none is left out. */
export async function techPositions(c: Caller): Promise<TechPosition[]> {
  const rows = (await c.call('fsm.person', 'search_read', [[['active', '=', true]]], { fields: ['name', 'partner_latitude', 'partner_longitude', 'write_date'], limit: 100 })) as Record<string, unknown>[];
  return rows
    .flatMap((r): TechPosition[] => {
      const lat = r.partner_latitude;
      const lon = r.partner_longitude;
      const at = odooMs(r.write_date);
      if (typeof lat !== 'number' || typeof lon !== 'number' || (lat === 0 && lon === 0) || Number.isNaN(at)) return [];
      return [{ id: r.id as number, name: typeof r.name === 'string' ? r.name : '', lat, lon, at }];
    })
    .sort((a, b) => b.at - a.at);
}

export const isLive = (p: Pick<TechPosition, 'at'>, now: number): boolean => now - p.at <= LIVE_MINUTES * 60_000;

/** "now", "5 min ago", "3 h ago", or a date: how long ago a position was seen. */
export function seenText(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 24 * 60) return `${Math.round(m / 60)} h ago`;
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
