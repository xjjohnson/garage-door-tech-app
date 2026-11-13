import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { OdooError } from './odoo';
import { EMPTY_PRICE_BOOK, Favorites, fetchPriceBook, fetchSaleTaxPercent, parseFavorites, parsePriceBook, PRICE_BOOK_FAVORITES_KEY, PRICE_BOOK_STORAGE_KEY, PriceBook, techKey, toggleFavorite } from './priceBook';
import { importOdooProducts, OdooImport } from './prices';
import { useOdoo } from './useOdoo';
import { usePriceSheet } from './usePriceSheet';

/** Refresh from Odoo on open when the saved copy is older than this. */
const STALE_MS = 60 * 60 * 1000;

export interface PriceBookApi {
  book: PriceBook;
  loaded: boolean;
  /** This tech's favorite product ids. */
  favorites: number[];
  toggle: (id: number) => void;
  refresh: () => Promise<void>;
  busy: boolean;
  error: string | null;
  signedIn: boolean;
  /** What the last update changed on the estimate (good / better / best) prices. */
  sheetResult: Omit<OdooImport, 'sheet'> | null;
}

/**
 * The price book saved on the phone, refreshed from Odoo when signed in and
 * the copy is over an hour old (or on Update). Works offline from the copy.
 */
export function usePriceBook(now: () => number = Date.now): PriceBookApi {
  const { status, client } = useOdoo();
  const [book, setBook] = useState<PriceBook>(EMPTY_PRICE_BOOK);
  const [favs, setFavs] = useState<Favorites>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tried = useRef(false);
  const { sheet, update: updateSheet } = usePriceSheet();
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const [sheetResult, setSheetResult] = useState<Omit<OdooImport, 'sheet'> | null>(null);
  const key = techKey(client?.session);

  useEffect(() => {
    let alive = true;
    Promise.all([AsyncStorage.getItem(PRICE_BOOK_STORAGE_KEY), AsyncStorage.getItem(PRICE_BOOK_FAVORITES_KEY)])
      .then(([b, f]) => {
        if (!alive) return;
        setBook((cur) => (cur.fetchedAt ? cur : parsePriceBook(b)));
        setFavs(parseFavorites(f));
      })
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const fresh = await fetchPriceBook(client, now());
      setBook(fresh);
      AsyncStorage.setItem(PRICE_BOOK_STORAGE_KEY, JSON.stringify(fresh)).catch(() => undefined);
      // One update for both: the estimate prices linked to Odoo products follow the book.
      const products = fresh.items.map((i) => ({ id: i.id, name: i.name, ...(i.code ? { code: i.code } : {}), cents: i.cents }));
      // The phone's offline estimate uses Odoo's own sales tax rate, not one typed on the phone.
      const tax = await fetchSaleTaxPercent(client).catch(() => undefined);
      if (tax !== undefined) updateSheet((cur) => (cur.taxPercent === tax ? cur : { ...cur, taxPercent: tax }));
      if (products.length) {
        const { changed, added, missing } = importOdooProducts(sheetRef.current, products);
        // Applied to the sheet as it is by then, in case a price was typed while Odoo answered.
        updateSheet((cur) => importOdooProducts(cur, products).sheet);
        setSheetResult({ changed, added, missing });
      }
    } catch (e) {
      setError(e instanceof OdooError ? e.message : "Couldn't load prices from Odoo. Showing the saved copy.");
    } finally {
      setBusy(false);
    }
  }, [client, now, updateSheet]);

  useEffect(() => {
    if (!loaded || status !== 'signedIn' || !client || tried.current) return;
    tried.current = true;
    if (now() - book.fetchedAt > STALE_MS) refresh();
  }, [loaded, status, client, book.fetchedAt, now, refresh]);

  const toggle = useCallback(
    (id: number) => {
      setFavs((cur) => {
        const next = toggleFavorite(cur, key, id);
        AsyncStorage.setItem(PRICE_BOOK_FAVORITES_KEY, JSON.stringify(next)).catch(() => undefined);
        return next;
      });
    },
    [key],
  );

  return { book, loaded, favorites: favs[key] ?? [], toggle, refresh, busy, error, signedIn: status === 'signedIn' && !!client, sheetResult };
}
