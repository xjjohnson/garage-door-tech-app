import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { log } from './log';
import type { OdooClient } from './odoo';
import { createProduct, PartialSyncError, receivePurchaseOrder, sendPurchaseOrder, StockProduct, syncTruck, SyncResult } from './odooStock';
import { EMPTY_STOCK, findSupplier, guessCategory, mergeStock, parseStock, PartUse, PurchaseOrder, receive, STARTER_ITEMS, STOCK_STORAGE_KEY, StockItem, StockStore, Supplier, SupplierOrder, switchTruck, TruckLink } from './stock';

export type NewStockItem = Omit<StockItem, 'id' | 'updatedAt'>;

interface StockApi extends StockStore {
  loaded: boolean;
  add: (i: NewStockItem) => string;
  update: (id: string, patch: Partial<NewStockItem>) => void;
  /** Changes on hand by this many (never below 0). */
  adjust: (id: string, by: number) => void;
  remove: (id: string) => void;
  addStarter: () => void;
  received: (o: SupplierOrder) => void;
  setSupplier: (s: Supplier) => void;
  restore: (incoming: StockStore) => void;
  /** Takes parts off the truck for a job. */
  takeParts: (itemId: string, qty: number, jobId?: string) => void;
  /** Puts a used part back on the truck. */
  undoUse: (useId: string) => void;
  /** Two-way sync with the truck's Inventory location in Odoo. */
  sync: (client: OdooClient) => Promise<SyncResult>;
  /** Uses another Odoo location as this tech's truck, then syncs with it. */
  chooseTruck: (client: OdooClient, truck: TruckLink) => Promise<SyncResult>;
  /** Sends a supplier's order to Odoo as a purchase order. */
  sendOrder: (client: OdooClient, o: SupplierOrder) => Promise<PurchaseOrder>;
  /** The parts on an Odoo purchase order came in: receives it in Odoo, then syncs. A job's part then goes on the job. False if Odoo needs it finished there. */
  receiveOrder: (client: OdooClient, purchaseId: string) => Promise<boolean>;
  /** Orders a part that isn't on the truck for a job: a purchase order to pick up or have delivered. */
  orderForJob: (client: OdooClient, o: JobPartOrder) => Promise<PurchaseOrder>;
  /** Adds a part signed in to Odoo: makes the product there when it's new, and its count goes up at the next sync. */
  addToOdoo: (client: OdooClient, i: NewStockItem) => Promise<string>;
}

export interface JobPartOrder {
  product: StockProduct;
  qty: number;
  supplier: string;
  pickup: boolean;
  jobId: string;
  /** The job's customer, for the order's Source in Odoo. */
  jobName: string;
}

const Ctx = createContext<StockApi | null>(null);
const newId = (p = 'i') => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;

/** What's on the truck and who it's ordered from, saved on the phone (AsyncStorage), synced with Odoo Inventory when signed in. */
export function StockProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<StockStore>(EMPTY_STOCK);
  const [loaded, setLoaded] = useState(false);
  const touched = useRef(false);
  const latest = useRef(store);
  latest.current = store;

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

  const add = useCallback(
    (i: NewStockItem) => {
      const id = newId();
      items((l) => [...l, { ...i, name: i.name.trim(), supplier: i.supplier.trim(), id, updatedAt: Date.now() }]);
      return id;
    },
    [items],
  );
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
        const old = s.suppliers.find((x) => x.name.trim().toLowerCase() === k);
        const rest = s.suppliers.filter((x) => x.name.trim().toLowerCase() !== k);
        return { ...s, suppliers: [...rest, { ...(old?.odooId ? { odooId: old.odooId } : {}), ...sup, name: sup.name.trim() }] };
      }),
    [change],
  );
  const restore = useCallback((incoming: StockStore) => change((s) => mergeStock(s, incoming)), [change]);

  const takeParts = useCallback(
    (itemId: string, qty: number, jobId?: string) =>
      change((s) => {
        const item = s.items.find((i) => i.id === itemId);
        if (!item || qty <= 0) return s;
        const now = Date.now();
        const off = Math.min(qty, item.onHand);
        const use: PartUse = { id: newId('u'), itemId, name: item.name, qty, at: now, ...(jobId ? { jobId } : {}), ...(off !== qty ? { off } : {}) };
        return { ...s, items: s.items.map((i) => (i.id === itemId ? { ...i, onHand: Math.max(0, i.onHand - qty), updatedAt: now } : i)), used: [...(s.used ?? []), use] };
      }),
    [change],
  );
  const undoUse = useCallback(
    (useId: string) =>
      change((s) => {
        const use = s.used?.find((u) => u.id === useId);
        if (!use) return s;
        const now = Date.now();
        return { ...s, items: s.items.map((i) => (i.id === use.itemId ? { ...i, onHand: i.onHand + (use.off ?? use.qty), updatedAt: now } : i)), used: (s.used ?? []).filter((u) => u.id !== useId) };
      }),
    [change],
  );

  const running = useRef<Promise<SyncResult> | null>(null);
  const sync = useCallback(
    (client: OdooClient) => {
      // One sync at a time: a second ask while one runs waits for it, then runs with what changed since.
      const prev = running.current;
      const run = (prev ? prev.catch(() => undefined) : Promise.resolve()).then(() => syncOnce(client));
      running.current = run;
      run.finally(() => {
        if (running.current === run) running.current = null;
      }).catch(() => undefined);
      return run;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [change],
  );
  const syncOnce = async (client: OdooClient) => {
    {
      const before = latest.current;
      // Counts changed on the phone while the sync ran are kept on top of Odoo's.
      const apply = (next: StockStore) =>
        change((cur) => {
          const was = new Map(before.items.map((i) => [i.id, i.onHand]));
          const items = next.items.map((i) => {
            const now = cur.items.find((x) => x.id === i.id);
            const delta = now && was.has(i.id) ? now.onHand - was.get(i.id)! : 0;
            return delta ? { ...i, onHand: Math.max(0, i.onHand + delta) } : i;
          });
          const extra = cur.items.filter((i) => !was.has(i.id));
          return { ...next, items: [...items, ...extra], used: cur.used, purchases: cur.purchases };
        });
      let result: SyncResult;
      try {
        result = await syncTruck(client, before, Date.now());
      } catch (e) {
        if (e instanceof PartialSyncError) {
          apply(e.store);
          log.warn('stock', `truck sync stopped after ${e.sent} sent: ${e.message}`);
        }
        throw e;
      }
      apply(result.store);
      log.info('stock', `truck sync: ${result.sent} sent, ${result.added} new, ${result.linked} linked, ${result.removed.length} removed, ${result.created.length} made in Odoo, ${result.problems.length} refused`);
      return result;
    }
  };

  const chooseTruck = useCallback(
    async (client: OdooClient, truck: TruckLink) => {
      const next = switchTruck(latest.current, { ...truck, uid: client.session.uid, chosen: true }, Date.now());
      change(() => next);
      latest.current = next;
      log.info('stock', `truck set to ${truck.name}`);
      return sync(client);
    },
    [change, sync],
  );

  const sendOrder = useCallback(
    async (client: OdooClient, o: SupplierOrder) => {
      const s = latest.current;
      const supplier = findSupplier(s.suppliers, o.supplier) ?? { name: o.supplier, phone: '', email: '' };
      const linked = o.lines.filter((l) => l.item.odooId !== undefined);
      const sent = await sendPurchaseOrder(
        client,
        supplier,
        linked.map((l) => ({ productId: l.item.odooId!, name: l.item.name, qty: l.qty, priceCents: l.item.costCents })),
        s.truck,
        s.truck?.name ?? '',
      );
      const po: PurchaseOrder = { id: newId('po'), supplier: o.supplier, odooId: sent.odooId, name: sent.name, lines: linked.map((l) => ({ itemId: l.item.id, qty: l.qty })), at: Date.now(), emailed: sent.emailed };
      change((cur) => {
        const k = o.supplier.trim().toLowerCase();
        const has = cur.suppliers.some((x) => x.name.trim().toLowerCase() === k);
        const suppliers = has ? cur.suppliers.map((x) => (x.name.trim().toLowerCase() === k ? { ...x, odooId: sent.vendorId } : x)) : [...cur.suppliers, { name: o.supplier, phone: '', email: '', odooId: sent.vendorId }];
        return { ...cur, suppliers, purchases: [...(cur.purchases ?? []), po] };
      });
      log.info('stock', `purchase order ${sent.name} made${sent.emailed ? ' and emailed' : ', not emailed'}`);
      return po;
    },
    [change],
  );

  const receiveOrder = useCallback(
    async (client: OdooClient, purchaseId: string) => {
      const po = latest.current.purchases?.find((p) => p.id === purchaseId);
      if (!po) return false;
      const done = await receivePurchaseOrder(client, po.odooId);
      if (!done) return false;
      change((cur) => ({ ...cur, purchases: (cur.purchases ?? []).map((p) => (p.id === purchaseId ? { ...p, receivedAt: Date.now() } : p)) }));
      latest.current = { ...latest.current, purchases: (latest.current.purchases ?? []).map((p) => (p.id === purchaseId ? { ...p, receivedAt: Date.now() } : p)) };
      // Odoo has the parts now: a sync that trips over something else mustn't keep them off the job.
      let failed: unknown;
      try {
        await sync(client);
      } catch (e) {
        failed = e;
        log.warn('stock', `sync after receiving ${po.name} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (failed) {
        // Count the receipt on the phone the way Odoo has it, so what the job takes off is right.
        const add = new Map(po.lines.map((l) => [l.itemId, l.qty]));
        change((cur) => ({ ...cur, items: cur.items.map((i) => (add.has(i.id) ? { ...i, onHand: i.onHand + add.get(i.id)!, ...(i.syncedOnHand !== undefined ? { syncedOnHand: i.syncedOnHand + add.get(i.id)! } : {}) } : i)) }));
      }
      // A part ordered for a job goes on that job once it's on the truck.
      if (po.jobId) for (const l of po.lines) takeParts(l.itemId, l.qty, po.jobId);
      if (failed && !po.jobId) throw failed;
      return true;
    },
    [change, sync, takeParts],
  );

  const orderForJob = useCallback(
    async (client: OdooClient, o: JobPartOrder) => {
      const s = latest.current;
      let item = s.items.find((i) => i.odooId === o.product.id);
      const itemId = item?.id ?? newId();
      if (!item) {
        // Not stocked on the truck: listed at 0 with no reorder, so it never lands on a restock order.
        item = { id: itemId, name: o.product.name, sku: o.product.code, category: guessCategory(o.product.name), onHand: 0, syncedOnHand: 0, min: 0, par: 0, supplier: o.supplier, costCents: o.product.costCents || o.product.vendor?.priceCents || 0, odooId: o.product.id, ...(o.product.barcode ? { barcode: o.product.barcode } : {}), updatedAt: Date.now() };
        const add = item;
        change((cur) => ({ ...cur, items: [...cur.items, add] }));
        latest.current = { ...latest.current, items: [...latest.current.items, add] };
      }
      const supplier = findSupplier(s.suppliers, o.supplier) ?? (o.product.vendor && o.product.vendor.name === o.supplier ? { name: o.supplier, phone: '', email: '', odooId: o.product.vendor.id } : { name: o.supplier, phone: '', email: '' });
      const ref = [s.truck?.name, o.pickup ? 'Pickup' : 'Delivery', o.jobName && `Job: ${o.jobName}`].filter(Boolean).join(' · ');
      const sent = await sendPurchaseOrder(client, supplier, [{ productId: o.product.id, name: o.product.name, qty: o.qty, priceCents: item.costCents }], s.truck, ref);
      const po: PurchaseOrder = { id: newId('po'), supplier: o.supplier, odooId: sent.odooId, name: sent.name, lines: [{ itemId, qty: o.qty }], at: Date.now(), emailed: sent.emailed, jobId: o.jobId, ...(o.pickup ? { pickup: true } : {}) };
      change((cur) => {
        const k = o.supplier.trim().toLowerCase();
        const has = cur.suppliers.some((x) => x.name.trim().toLowerCase() === k);
        const suppliers = has ? cur.suppliers.map((x) => (x.name.trim().toLowerCase() === k ? { ...x, odooId: sent.vendorId } : x)) : [...cur.suppliers, { name: o.supplier, phone: '', email: '', odooId: sent.vendorId }];
        return { ...cur, suppliers, purchases: [...(cur.purchases ?? []), po] };
      });
      log.info('stock', `job part ordered: ${sent.name} (${o.pickup ? 'pickup' : 'delivery'})`);
      return po;
    },
    [change],
  );

  const addToOdoo = useCallback(
    async (client: OdooClient, i: NewStockItem) => {
      const odooId = i.odooId ?? (await createProduct(client, { name: i.name, sku: i.sku, barcode: i.barcode, costCents: i.costCents }));
      // syncedOnHand 0: the count typed in goes to Odoo as new stock on the truck at the next sync.
      return add({ ...i, odooId, syncedOnHand: 0 });
    },
    [add],
  );

  const api = useMemo(
    () => ({ ...store, loaded, add, update, adjust, remove, addStarter, received, setSupplier, restore, takeParts, undoUse, sync, sendOrder, receiveOrder, chooseTruck, orderForJob, addToOdoo }),
    [store, loaded, add, update, adjust, remove, addStarter, received, setSupplier, restore, takeParts, undoUse, sync, sendOrder, receiveOrder, chooseTruck, orderForJob, addToOdoo],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStock(): StockApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useStock needs a StockProvider above it');
  return api;
}
