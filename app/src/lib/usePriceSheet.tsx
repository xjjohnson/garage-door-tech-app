import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_PRICE_SHEET, parsePriceSheet, PRICE_SHEET_STORAGE_KEY, PriceSheet } from './prices';

interface PriceSheetApi {
  sheet: PriceSheet;
  update: (fn: (prev: PriceSheet) => PriceSheet) => void;
}

const PriceSheetContext = createContext<PriceSheetApi | null>(null);

/** The company's prices for the whole app, saved on the phone (AsyncStorage). */
export function PriceSheetProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<PriceSheet>(DEFAULT_PRICE_SHEET);
  const loaded = useRef(false);
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(PRICE_SHEET_STORAGE_KEY)
      .then((raw) => {
        // Don't overwrite a price typed while loading.
        if (alive && raw && !touched.current) setSheet(parsePriceSheet(raw));
      })
      .catch(() => undefined)
      .finally(() => {
        loaded.current = true;
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded.current && !touched.current) return;
    AsyncStorage.setItem(PRICE_SHEET_STORAGE_KEY, JSON.stringify(sheet)).catch(() => undefined);
  }, [sheet]);

  const update = useCallback((fn: (prev: PriceSheet) => PriceSheet) => {
    touched.current = true;
    setSheet(fn);
  }, []);

  const api = useMemo(() => ({ sheet, update }), [sheet, update]);
  return <PriceSheetContext.Provider value={api}>{children}</PriceSheetContext.Provider>;
}

export function usePriceSheet(): PriceSheetApi {
  const api = useContext(PriceSheetContext);
  if (!api) throw new Error('usePriceSheet needs a PriceSheetProvider above it');
  return api;
}
