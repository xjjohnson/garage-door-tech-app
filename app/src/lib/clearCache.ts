/**
 * Clear local cache: forgets the copies of lists and prices the phone pulled
 * from Odoo, so the next sync downloads them fresh. It only ever removes the
 * keys listed here, every one a read-only copy of Odoo data. Jobs, customers,
 * invoices, drafts, signatures, photos waiting to upload and the notes outbox
 * are never touched.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ADDRESSES_STORAGE_KEY } from './odooContacts';
import { FSM_TEMPLATES_STORAGE_KEY } from './fsmTemplates';
import { GEOCODE_STORAGE_KEY } from './geocode';
import { CUSTOMER_COUNTS_STORAGE_KEY } from './odooCustomerCounts';
import { LISTS_STORAGE_KEY } from './odooLists';
import { NOTES_CACHE_KEY } from './odooNotes';
import { TEMPLATES_STORAGE_KEY } from './odooTemplates';
import { PRICE_BOOK_STORAGE_KEY } from './priceBook';

/** What each key holds, in words a person can read. */
export const CACHE_KEYS: { key: string; label: string }[] = [
  { key: PRICE_BOOK_STORAGE_KEY, label: 'price book' },
  { key: TEMPLATES_STORAGE_KEY, label: 'quotation templates' },
  { key: FSM_TEMPLATES_STORAGE_KEY, label: 'job templates' },
  { key: LISTS_STORAGE_KEY, label: 'quotation and invoice lists' },
  { key: CUSTOMER_COUNTS_STORAGE_KEY, label: 'customer job counts' },
  { key: ADDRESSES_STORAGE_KEY, label: 'customer addresses' },
  { key: NOTES_CACHE_KEY, label: 'job notes copies' },
  { key: GEOCODE_STORAGE_KEY, label: 'map lookups' },
];

/** The sentence shown before clearing: exactly what goes and what stays. */
export const CLEAR_CACHE_WARNING =
  'This forgets the copies of Odoo lists and prices on this phone (price book, templates, quote and invoice lists, addresses, map lookups) and downloads them again. It keeps everything not yet sent to Odoo: jobs, customers, invoices, drafts, signatures and photos waiting to upload.';

/** Removes the cached copies; returns how many kinds were actually there. */
export async function clearLocalCache(storage: Pick<typeof AsyncStorage, 'getItem' | 'removeItem'> = AsyncStorage): Promise<number> {
  let removed = 0;
  for (const { key } of CACHE_KEYS) {
    const had = await storage.getItem(key).catch(() => null);
    if (had !== null) removed++;
    await storage.removeItem(key).catch(() => undefined);
  }
  return removed;
}
