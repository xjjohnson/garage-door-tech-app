import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_STOCK, mergeStock, parseStock, receive, STARTER_ITEMS, STOCK_STORAGE_KEY, StockItem, StockStore, Supplier, SupplierOrder } from './stock';

export type NewStockItem = Omit<StockItem, 'id' | 'updatedAt'>;

interface StockApi extends StockStore {
  loaded: boolean;
  add: (i: NewStockItem) => void;
  update: (id: string, patch: Partial<NewStockItem>) => void;
  /** Changes on hand by this many (never below 0). */
  adjust: (id: string, by: number) => void;
  remove: (id: string) => void;
  addStarter: () => void;
  received: (o: SupplierOrder) => void;
  setSupplier: (s: Supplier) => void;
  restore: (incoming: StockStore) => void;
}

const Ctx = createContext<StockApi | null>(null);
const newId = () => `i-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;

/** What's on the truck and who it's ordered from, saved on the phone (AsyncStorage). */
export function StockProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<StockStore>(EMPTY_STOCK);
  const [loaded, setLoaded] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STOCK_STORAGE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const saved = parseStock(raw);
        setStore((cur) => (touched.current ? mergeStock(saved, cur) : saved));
      })
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STOCK_STORAGE_KEY, JSON.stringify(store)).catch(() => undefined);
  }, [store, loaded]);

  const change = useCallback((fn: (s: StockStore) => StockStore) => {
    touched.current = true;
    setStore(fn);
  }, []);
  const items = useCallback((fn: (list: StockItem[]) => StockItem[]) => change((s) => ({ ...s, items: fn(s.items) })), [change]);

  const add = useCallback((i: NewStockItem) => items((l) => [...l, { ...i, name: i.name.trim(), supplier: i.supplier.trim(), id: newId(), updatedAt: Date.now() }]), [items]);
  const update = useCallback((id: string, patch: Partial<NewStockItem>) => items((l) => l.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i))), [items]);
  const adjust = useCallback((id: string, by: number) => items((l) => l.map((i) => (i.id === id ? { ...i, onHand: Math.max(0, i.onHand + by), updatedAt: Date.now() } : i))), [items]);
  const remove = useCallback((id: string) => items((l) => l.filter((i) => i.id !== id)), [items]);
  const addStarter = useCallback(
    () =>
      items((l) => {
        const have = new Set(l.map((i) => i.name.toLowerCase()));
        const now = Date.now();
        const extra = STARTER_ITEMS.filter((s) => !have.has(s.name.toLowerCase())).map((s, k) => ({ ...s, id: `${newId()}-${k}`, sku: '', onHand: 0, supplier: '', costCents: 0, updatedAt: now }));
        return [...l, ...extra];
      }),
    [items],
  );
  const received = useCallback((o: SupplierOrder) => items((l) => receive(l, o, Date.now())), [items]);
  const setSupplier = useCallback(
    (sup: Supplier) =>
      change((s) => {
        const k = sup.name.trim().toLowerCase();
        const rest = s.suppliers.filter((x) => x.name.trim().toLowerCase() !== k);
        return { ...s, suppliers: [...rest, { ...sup, name: sup.name.trim() }] };
      }),
    [change],
  );
  const restore = useCallback((incoming: StockStore) => change((s) => mergeStock(s, incoming)), [change]);

  const api = useMemo(
    () => ({ ...store, loaded, add, update, adjust, remove, addStarter, received, setSupplier, restore }),
    [store, loaded, add, update, adjust, remove, addStarter, received, setSupplier, restore],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStock(): StockApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useStock needs a StockProvider above it');
  return api;
}
