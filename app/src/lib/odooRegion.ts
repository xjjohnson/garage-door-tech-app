/**
 * State and country on the addresses the app writes to Odoo. Justin works in
 * Texas, and Odoo leaves State and Country empty unless they're picked, so a
 * contact or location the app saves gets Texas and United States when those
 * are empty (Justin, Nov 13: "It doesn't fill out texas"). A State or Country
 * Odoo already has is never changed, and an address that names another state
 * ("..., OK 74101") is left alone. Kept free of React.
 */
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call'>;

export interface Region {
  stateId: number;
  countryId: number;
}

const found = new WeakMap<object, Promise<Region | null>>();

/** Texas in Odoo's res.country.state, and its country (US); null when Odoo has no such state. Read once per sign-in. */
export function texas(c: Client): Promise<Region | null> {
  let p = found.get(c);
  if (!p) {
    p = (async () => {
      const rows = (await c.call('res.country.state', 'search_read', [[['code', '=', 'TX'], ['country_id.code', '=', 'US']]], { fields: ['country_id'], limit: 1 })) as { id: number; country_id?: unknown }[];
      const r = rows[0];
      const countryId = r && Array.isArray(r.country_id) ? (r.country_id[0] as number) : 0;
      return r && countryId ? { stateId: r.id, countryId } : null;
    })().catch(() => null);
    found.set(c, p);
  }
  return p;
}

/** Whether a typed address names a state other than Texas ("Tulsa, OK 74101", "Ardmore, Oklahoma"). */
export function otherState(address: string): boolean {
  const m = /,\s*([A-Za-z]{2})\.?\s*(?:\d{5}(?:-\d{4})?)?\s*$/.exec(address.trim());
  if (m && STATES.has(m[1].toUpperCase()) && m[1].toUpperCase() !== 'TX') return true;
  return /\b(oklahoma|louisiana|new mexico|arkansas|colorado|california|florida|arizona)\b/i.test(address);
}

const STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));

/** State and country for a new record with this address; nothing when the address is empty or not in Texas. */
export async function regionVals(c: Client, address: string): Promise<Record<string, number>> {
  if (!address.trim() || otherState(address)) return {};
  const t = await texas(c);
  return t ? { state_id: t.stateId, country_id: t.countryId } : {};
}

/**
 * After an address is written to existing records, fills State and Country
 * where they're still empty. Never fails the save: a problem here only means
 * they stay empty.
 */
export async function fillRegion(c: Client, model: string, ids: number[], address: string): Promise<void> {
  if (ids.length === 0 || !address.trim() || otherState(address)) return;
  try {
    const t = await texas(c);
    if (!t) return;
    const rows = (await c.call(model, 'read', [ids], { fields: ['state_id', 'country_id'] })) as { id: number; state_id?: unknown; country_id?: unknown }[];
    const idOf = (v: unknown) => (Array.isArray(v) ? (v[0] as number) : typeof v === 'number' ? v : 0);
    for (const r of rows) {
      const country = idOf(r.country_id);
      const vals: Record<string, number> = {};
      if (!country) vals.country_id = t.countryId;
      // A state only goes with the US: a contact set to another country keeps its empty state.
      if (!idOf(r.state_id) && (!country || country === t.countryId)) vals.state_id = t.stateId;
      if (Object.keys(vals).length) await c.call(model, 'write', [[r.id], vals]);
    }
  } catch {
    // Left empty; the address itself is saved.
  }
}
