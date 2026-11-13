import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OdooInvoiceState } from './odooSales';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Business,
  BUSINESS_STORAGE_KEY,
  createInvoice,
  EMPTY_BUSINESS,
  Invoice,
  INVOICES_STORAGE_KEY,
  mergeInvoices,
  newId,
  parseBusiness,
  parseInvoices,
  Payment,
  withOdoo,
} from './invoices';
import { QuoteOption } from './quote';

interface InvoicesApi {
  invoices: Invoice[];
  loaded: boolean;
  business: Business;
  setBusiness: (fn: (prev: Business) => Business) => void;
  /** Makes an invoice for a job from the option the customer picked. */
  /** New invoices go to Odoo on their own once there's signal (OdooInvoicesSync). */
  create: (job: { id: string; customerId?: string; customer: string; address: string }, option: QuoteOption, source?: 'ticket', ref?: string) => Invoice;
  addPayment: (invoiceId: string, p: Omit<Payment, 'id' | 'at'>) => void;
  removePayment: (invoiceId: string, paymentId: string) => void;
  setVoid: (invoiceId: string, voided: boolean) => void;
  /** Keeps what Odoo said about this invoice after sending or checking it. */
  setOdoo: (invoiceId: string, odoo: OdooInvoiceState) => void;
  /** Adds a backup's invoices (the copy changed last wins) and, if it has one, its business details. */
  restore: (incoming: Invoice[], business?: Business) => void;
}

const InvoicesContext = createContext<InvoicesApi | null>(null);

/** Invoices and the tech's business details for the whole app, saved on the phone (AsyncStorage). */
export function InvoicesProvider({ children }: { children: ReactNode }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [business, setBiz] = useState<Business>(EMPTY_BUSINESS);
  const [loaded, setLoaded] = useState(false);
  const touched = useRef({ invoices: false, business: false });
  const latest = useRef(invoices);
  latest.current = invoices;

  useEffect(() => {
    let alive = true;
    Promise.all([AsyncStorage.getItem(INVOICES_STORAGE_KEY).catch(() => null), AsyncStorage.getItem(BUSINESS_STORAGE_KEY).catch(() => null)])
      .then(([rawInv, rawBiz]) => {
        if (!alive) return;
        const saved = parseInvoices(rawInv);
        setInvoices((now) => (touched.current.invoices ? mergeInvoices(saved, now) : saved));
        if (rawBiz && !touched.current.business) setBiz(parseBusiness(rawBiz));
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(invoices)).catch(() => undefined);
  }, [invoices, loaded]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(BUSINESS_STORAGE_KEY, JSON.stringify(business)).catch(() => undefined);
  }, [business, loaded]);

  const change = useCallback((fn: (prev: Invoice[]) => Invoice[]) => {
    touched.current.invoices = true;
    setInvoices((prev) => {
      const next = fn(prev);
      latest.current = next;
      return next;
    });
  }, []);

  const edit = useCallback(
    (id: string, fn: (i: Invoice) => Invoice) => change((prev) => prev.map((i) => (i.id === id ? { ...fn(i), updatedAt: Date.now() } : i))),
    [change],
  );

  const create = useCallback<InvoicesApi['create']>(
    (job, option, source, ref) => {
      const now = Date.now();
      const inv = createInvoice(job, option, latest.current, now, undefined, source, { ref, autoSend: true });
      change((prev) => [inv, ...prev]);
      return inv;
    },
    [change],
  );

  const addPayment = useCallback<InvoicesApi['addPayment']>(
    (id, p) => {
      const now = Date.now();
      edit(id, (i) => ({ ...i, payments: [...i.payments, { ...p, reference: p.reference.trim(), id: newId('p', now), at: now }] }));
    },
    [edit],
  );

  const removePayment = useCallback<InvoicesApi['removePayment']>((id, pid) => edit(id, (i) => ({ ...i, payments: i.payments.filter((p) => p.id !== pid) })), [edit]);

  const setVoid = useCallback<InvoicesApi['setVoid']>(
    (id, voided) =>
      edit(id, (i) => {
        const { voidedAt: _old, ...rest } = i;
        return voided ? { ...rest, voidedAt: Date.now() } : rest;
      }),
    [edit],
  );

  const setOdoo = useCallback<InvoicesApi['setOdoo']>((id, odoo) => change((prev) => prev.map((i) => (i.id === id ? withOdoo(i, odoo) : i))), [change]);

  const setBusiness = useCallback<InvoicesApi['setBusiness']>((fn) => {
    touched.current.business = true;
    setBiz(fn);
  }, []);

  const restore = useCallback<InvoicesApi['restore']>(
    (incoming, b) => {
      change((prev) => mergeInvoices(prev, incoming));
      if (b && Object.values(b).some((v) => v !== '')) setBusiness(() => b);
    },
    [change, setBusiness],
  );

  const api = useMemo(
    () => ({ invoices, loaded, business, setBusiness, create, addPayment, removePayment, setVoid, setOdoo, restore }),
    [invoices, loaded, business, setBusiness, create, addPayment, removePayment, setVoid, setOdoo, restore],
  );
  return <InvoicesContext.Provider value={api}>{children}</InvoicesContext.Provider>;
}

export function useInvoices(): InvoicesApi {
  const api = useContext(InvoicesContext);
  if (!api) throw new Error('useInvoices needs an InvoicesProvider above it');
  return api;
}
