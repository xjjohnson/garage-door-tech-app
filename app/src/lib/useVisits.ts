import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { odooIdOfVisit } from './useStartJob';
import { Appointment } from './schedule';
import { Job } from './jobs';
import { Customer } from './customers';
import { ADDRESSES_STORAGE_KEY, ContactAddress, fetchCustomerAddresses, parseSavedAddresses } from './odooContacts';
import { useCustomersIfAny } from './useCustomers';
import { useJobs } from './useJobs';
import { useOdoo } from './useOdoo';
import { useSchedule } from './useSchedule';

type Delivery = Record<string, ContactAddress[]>;

/** The house (delivery) address under a customer's Odoo contact, else their own address. */
const customerSite = (c: Customer | undefined, delivery: Delivery): string => {
  if (!c) return '';
  const house = c.odooId ? delivery[c.odooId]?.find((a) => a.type === 'delivery' && a.address.trim()) : undefined;
  return house?.address.trim() || c.address.trim();
};

/**
 * The address to show for a visit: what the job screen shows for its job
 * (the address picked there, else the job's own), else the visit's own, else
 * the customer's house (delivery) address, else their main address. A visit
 * pulled from Odoo whose place has no street still gets a pin and
 * directions, and the map agrees with the job screen.
 */
export function visitAddress(a: Appointment, jobs: Job[], customers: Customer[] = [], delivery: Delivery = {}): string {
  const oid = odooIdOfVisit(a);
  const job = jobs.find((j) => (a.jobId && j.id === a.jobId) || (oid !== undefined && j.odooJob?.id === oid));
  const fromJob = job?.ticket?.shipTo?.address?.trim() || job?.address?.trim();
  if (fromJob) return fromJob;
  if (a.address.trim()) return a.address;
  const find = (id?: string) => (id ? customers.find((c) => c.id === id) : undefined);
  return customerSite(find(job?.customerId), delivery) || customerSite(find(a.customerId), delivery);
}

/** The schedule with every visit's address filled in as above, for the screens that map, route or list visits. */
export function useVisits(): Appointment[] {
  const { appointments } = useSchedule();
  const { jobs } = useJobs();
  const customers = useCustomersIfAny()?.customers;
  const { client, status } = useOdoo();
  const [delivery, setDelivery] = useState<Delivery>({});

  // Customers' house addresses: the ones read last time, then Odoo's for any visit still with no address.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(ADDRESSES_STORAGE_KEY)
      .then((raw) => alive && setDelivery((d) => ({ ...parseSavedAddresses(raw), ...d })))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const need = useMemo(() => {
    const ids = new Set<number>();
    for (const a of appointments) {
      if (visitAddress(a, jobs, customers ?? [], delivery)) continue;
      const oid = odooIdOfVisit(a);
      const job = jobs.find((j) => (a.jobId && j.id === a.jobId) || (oid !== undefined && j.odooJob?.id === oid));
      const c = customers?.find((x) => x.id === (job?.customerId ?? a.customerId));
      if (c?.odooId && !delivery[c.odooId]) ids.add(c.odooId);
    }
    return [...ids];
  }, [appointments, jobs, customers, delivery]);

  useEffect(() => {
    if (!client || status !== 'signedIn' || need.length === 0) return;
    let alive = true;
    Promise.all(need.map((id) => fetchCustomerAddresses(client, [id]).then((r) => [id, r.under] as const)))
      .then((rows) => {
        if (!alive) return;
        const next: Delivery = Object.fromEntries(rows);
        setDelivery((d) => ({ ...d, ...next }));
        AsyncStorage.getItem(ADDRESSES_STORAGE_KEY)
          .then((raw) => AsyncStorage.setItem(ADDRESSES_STORAGE_KEY, JSON.stringify({ ...parseSavedAddresses(raw), ...next })))
          .catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [client, status, need]);

  return useMemo(
    () =>
      appointments.map((a) => {
        const address = visitAddress(a, jobs, customers ?? [], delivery);
        return address === a.address ? a : { ...a, address };
      }),
    [appointments, jobs, customers, delivery],
  );
}
