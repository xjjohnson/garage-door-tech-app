/**
 * "Sync all": when Sync now is tapped, also re-reads what Odoo keeps for the
 * app's pick lists (Field Service templates, quotation templates, the price
 * book) and saves the new copies, so things just added in Odoo show up on the
 * next screen that uses them. Renders nothing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { fetchFsmTemplates, FSM_TEMPLATES_STORAGE_KEY } from '../lib/fsmTemplates';
import { log } from '../lib/log';
import { fetchTemplates, TEMPLATES_STORAGE_KEY } from '../lib/odooTemplates';
import { fetchPriceBook, PRICE_BOOK_STORAGE_KEY } from '../lib/priceBook';
import { onSyncNow } from '../lib/syncNow';
import { resetQuoteTemplates } from '../lib/useQuoteTemplates';
import { useOdoo } from '../lib/useOdoo';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function OdooRefreshSync({ now = Date.now }: { now?: () => number }) {
  const { status, client } = useOdoo();
  useEffect(() => {
    if (status !== 'signedIn' || !client) return;
    return onSyncNow(async () => {
      const save = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined);
      await Promise.allSettled([
        client.session.kind === 'oca' ? fetchFsmTemplates(client).then((list) => save(FSM_TEMPLATES_STORAGE_KEY, list)) : Promise.resolve(),
        client.session.apps.sales
          ? fetchTemplates(client).then(async (fresh) => {
              await save(TEMPLATES_STORAGE_KEY, fresh);
              resetQuoteTemplates();
            })
          : Promise.resolve(),
        fetchPriceBook(client, now()).then((book) => save(PRICE_BOOK_STORAGE_KEY, book)),
      ]).then((res) => {
        for (const r of res) if (r.status === 'rejected') log.warn('odoo', `refresh lists: ${message(r.reason)}`);
      });
    });
  }, [status, client, now]);
  return null;
}
