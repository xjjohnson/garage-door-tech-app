import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cleanCustomer, Customer, CustomerFields, CUSTOMERS_STORAGE_KEY, linkJobs, mergeCustomers, parseCustomers } from './customers';
import { useJobs } from './useJobs';

interface CustomersApi {
  customers: Customer[];
  loaded: boolean;
  /** Saves a customer's details and copies the new name and phone onto their jobs. */
  update: (id: string, fields: CustomerFields) => void;
  /** Adds a backup's customers; when both have one, the copy changed last wins. */
  restore: (incoming: Customer[]) => void;
  /** Replaces the list (for the Odoo sync), copying changed names and phones onto jobs. */
  apply: (fn: (prev: Customer[]) => Customer[]) => void;
}

const CustomersContext = createContext<CustomersApi | null>(null);

/**
 * The customer list for the whole app, saved on the phone (AsyncStorage).
 * Needs a JobsProvider above it: once both have loaded, any job without a
 * customer (an older job, a new one, or one from a backup) is linked to a
 * matching customer, or a new customer is made from its details.
 */
export function CustomersProvider({ children }: { children: ReactNode }) {
  const { jobs, loaded: jobsLoaded, linkCustomers, renameCustomer } = useJobs();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(CUSTOMERS_STORAGE_KEY)
      .then((raw) => {
        if (!alive) return;
        const saved = parseCustomers(raw);
        setCustomers((now) => (touched.current ? mergeCustomers(saved, now) : saved));
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(customers)).catch(() => undefined);
  }, [customers, loaded]);

  // Link every job to a customer. Runs again whenever jobs change; once all
  // are linked it finds nothing to do.
  useEffect(() => {
    if (!loaded || !jobsLoaded) return;
    const { customers: next, links } = linkJobs(jobs, customers, Date.now());
    if (next !== customers && (next.length !== customers.length || next.some((c, i) => c !== customers[i]))) {
      touched.current = true;
      setCustomers(next);
    }
    if (Object.keys(links).length > 0) linkCustomers(links);
  }, [jobs, customers, loaded, jobsLoaded, linkCustomers]);

  const update = useCallback<CustomersApi['update']>(
    (id, fields) => {
      const f = cleanCustomer(fields);
      touched.current = true;
      setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...f, updatedAt: Date.now() } : c)));
      renameCustomer(id, { customer: f.name, phone: f.phone });
    },
    [renameCustomer],
  );

  const restore = useCallback<CustomersApi['restore']>((incoming) => {
    touched.current = true;
    setCustomers((prev) => mergeCustomers(prev, incoming));
  }, []);

  const latest = useRef(customers);
  latest.current = customers;
  const apply = useCallback<CustomersApi['apply']>(
    (fn) => {
      const prev = latest.current;
      const next = fn(prev);
      touched.current = true;
      latest.current = next;
      setCustomers(next);
      const old = new Map(prev.map((c) => [c.id, c]));
      for (const c of next) {
        const o = old.get(c.id);
        if (o && (o.name !== c.name || o.phone !== c.phone)) renameCustomer(c.id, { customer: c.name, phone: c.phone });
      }
    },
    [renameCustomer],
  );

  const api = useMemo(() => ({ customers, loaded, update, restore, apply }), [customers, loaded, update, restore, apply]);
  return <CustomersContext.Provider value={api}>{children}</CustomersContext.Provider>;
}

export function useCustomers(): CustomersApi {
  const api = useContext(CustomersContext);
  if (!api) throw new Error('useCustomers needs a CustomersProvider above it');
  return api;
}

/** For pieces that also render outside the app's providers, such as the job sheet in tests. */
export function useCustomersIfAny(): CustomersApi | null {
  return useContext(CustomersContext);
}
