import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { log } from './log';
import { addAddress, AddressFields, ADDRESSES_STORAGE_KEY, ContactAddress, fetchAddresses, parseSavedAddresses, saveAddress } from './odooContacts';
import { useOdoo } from './useOdoo';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * A customer's addresses in Odoo (see odooContacts.ts): the ones read last
 * time straight away, then Odoo's. Adding or changing one needs signal.
 * `partnerId` is the customer's Odoo contact; nothing without one.
 */
export function useContactAddresses(partnerId: number | undefined) {
  const { status, client } = useOdoo();
  const [addresses, setAddresses] = useState<ContactAddress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const online = status === 'signedIn' && !!client;

  const keep = useCallback(
    (list: ContactAddress[]) => {
      if (!partnerId) return;
      setAddresses(list);
      AsyncStorage.getItem(ADDRESSES_STORAGE_KEY)
        .then((raw) => AsyncStorage.setItem(ADDRESSES_STORAGE_KEY, JSON.stringify({ ...parseSavedAddresses(raw), [partnerId]: list })))
        .catch(() => undefined);
    },
    [partnerId],
  );

  const refresh = useCallback(async () => {
    if (!partnerId || !client || !online) return;
    try {
      keep(await fetchAddresses(client, partnerId));
      setError(null);
    } catch (e) {
      setError(message(e));
      log.warn('odoo', `addresses: ${message(e)}`);
    }
  }, [partnerId, client, online, keep]);

  useEffect(() => {
    let alive = true;
    setAddresses([]);
    if (!partnerId) return;
    AsyncStorage.getItem(ADDRESSES_STORAGE_KEY)
      .then((raw) => alive && setAddresses((a) => (a.length ? a : (parseSavedAddresses(raw)[partnerId] ?? []))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [partnerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Adds (no id) or changes an address in Odoo, then reads the list again. True when it worked. */
  const save = useCallback(
    async (f: AddressFields, id?: number): Promise<boolean> => {
      if (!partnerId || !client || !online) {
        setError('Needs signal and Odoo sign-in (Jobs › Team).');
        return false;
      }
      setBusy(true);
      try {
        if (id) await saveAddress(client, id, f);
        else await addAddress(client, partnerId, f);
        await refresh();
        setError(null);
        return true;
      } catch (e) {
        setError(message(e));
        log.warn('odoo', `address not saved: ${message(e)}`);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [partnerId, client, online, refresh],
  );

  return { addresses, error, busy, online, save, refresh };
}
