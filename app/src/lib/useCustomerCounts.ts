import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { CUSTOMER_COUNTS_STORAGE_KEY, CustomerCounts, fetchCustomerCounts, parseSavedCounts } from './odooCustomerCounts';
import { useOdoo } from './useOdoo';

/**
 * Odoo's job and quote counts per contact, for the Customers list. The last
 * read is kept, so the list still has numbers with no signal.
 */
export function useCustomerCounts(): Record<number, CustomerCounts> {
  const { client } = useOdoo();
  const [counts, setCounts] = useState<Record<number, CustomerCounts>>({});
  useEffect(() => {
    AsyncStorage.getItem(CUSTOMER_COUNTS_STORAGE_KEY)
      .then((raw) => setCounts((c) => (Object.keys(c).length ? c : parseSavedCounts(raw))))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!client || client.session.kind === 'none') return;
    let alive = true;
    fetchCustomerCounts(client)
      .then((c) => {
        if (!alive) return;
        setCounts(c);
        AsyncStorage.setItem(CUSTOMER_COUNTS_STORAGE_KEY, JSON.stringify(c)).catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [client]);
  return counts;
}
