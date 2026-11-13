import { useEffect, useMemo, useState } from 'react';
import { AddressSuggestion, customerAddresses, suggestAddresses, worthAsking } from './addressSuggest';
import { pretendOffline } from './devFlags';
import type { GeoFetch } from './geocode';
import { log } from './log';
import { FoundAddress, searchAddresses } from './odooContacts';
import { useCustomersIfAny } from './useCustomers';
import { useOdooIfAny } from './useOdoo';

/** Waits this long after the last key before asking, so a word typed fast is one lookup. */
export const DEBOUNCE_MS = 300;

const deps: { fetchFn: GeoFetch } = { fetchFn: (url, init) => fetch(url, init) };

/** For tests: a fake Photon. Returns a reset. */
export function setAddressSuggestDeps(d: Partial<typeof deps>): () => void {
  const before = { ...deps };
  Object.assign(deps, d);
  return () => Object.assign(deps, before);
}

/**
 * Suggestions for an address being typed: saved customers whose address or
 * name matches first, then houses under customers' Odoo contacts (signed
 * in), then addresses from the map. `off` (after a pick)
 * stops asking until the text changes again.
 */
const NONE: never[] = [];

export function useAddressSuggestions(typed: string, off = false): AddressSuggestion[] {
  const customers = useCustomersIfAny()?.customers ?? NONE;
  const signIn = useOdooIfAny();
  const status = signIn?.status;
  const client = signIn?.client ?? null;
  const [found, setFound] = useState<{ q: string; list: AddressSuggestion[] }>({ q: '', list: [] });
  const [houses, setHouses] = useState<{ q: string; list: FoundAddress[] }>({ q: '', list: [] });
  const q = typed.trim();
  const odoo = status === 'signedIn' ? client : null;

  useEffect(() => {
    if (off || !worthAsking(q) || pretendOffline()) return;
    let alive = true;
    const t = setTimeout(() => {
      suggestAddresses(deps.fetchFn, q)
        .then((list) => alive && setFound({ q, list }))
        .catch((e) => {
          // No signal: the box still takes typing; suggestions just don't show.
          log.warn('map', `address suggestions: ${e instanceof Error ? e.message : String(e)}`);
        });
      // Houses under customers' contacts in Odoo (a property manager's), too.
      if (odoo)
        searchAddresses(odoo, q)
          .then((list) => alive && setHouses({ q, list }))
          .catch((e) => log.warn('odoo', `address search: ${e instanceof Error ? e.message : String(e)}`));
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, off, odoo]);

  return useMemo(() => {
    if (off || q.length < 3) return [];
    const saved = customerAddresses(customers, q);
    const theirs: AddressSuggestion[] = (houses.q === q ? houses.list : []).map((h) => {
      const c = customers.find((x) => x.odooId === h.parentId);
      return { address: h.address, street: '', city: '', zip: '', name: [h.parentName || c?.name, h.name].filter(Boolean).join(' · '), addressId: h.id, odooCustomerId: h.parentId, customerName: h.parentName || c?.name || '', ...(c ? { customerId: c.id } : {}) };
    });
    const listed = new Set<string>();
    const keep = (a: AddressSuggestion) => {
      const k = a.address.toLowerCase();
      if (!k || listed.has(k)) return false;
      listed.add(k);
      return true;
    };
    const map = found.q === q ? found.list : [];
    return [...saved, ...theirs, ...map].filter(keep).slice(0, 6);
  }, [customers, q, off, found, houses]);
}
