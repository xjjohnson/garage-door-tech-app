import { useEffect, useMemo, useState } from 'react';
import { AddressSuggestion, customerAddresses, suggestAddresses, worthAsking } from './addressSuggest';
import { pretendOffline } from './devFlags';
import type { GeoFetch } from './geocode';
import { log } from './log';
import { useCustomers } from './useCustomers';

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
 * name matches first, then addresses from the map. `off` (after a pick)
 * stops asking until the text changes again.
 */
export function useAddressSuggestions(typed: string, off = false): AddressSuggestion[] {
  const { customers } = useCustomers();
  const [found, setFound] = useState<{ q: string; list: AddressSuggestion[] }>({ q: '', list: [] });
  const q = typed.trim();

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
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, off]);

  return useMemo(() => {
    if (off || q.length < 3) return [];
    const saved = customerAddresses(customers, q);
    const savedKeys = new Set(saved.map((s) => s.address.toLowerCase()));
    const map = found.q === q ? found.list.filter((a) => !savedKeys.has(a.address.toLowerCase())) : [];
    return [...saved, ...map].slice(0, 6);
  }, [customers, q, off, found]);
}
