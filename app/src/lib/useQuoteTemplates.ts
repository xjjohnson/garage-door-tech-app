import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { log } from './log';
import { fetchTemplates, parseTemplates, TemplateSets, TEMPLATES_STORAGE_KEY } from './odooTemplates';
import { useOdoo } from './useOdoo';

/** Refreshed from Odoo at most this often, so opening quotes stays quick. */
const REFRESH_MS = 10 * 60_000;
let lastFetch = 0;
let memory: TemplateSets | null = null;

/** For tests: forget what was fetched. */
export function resetQuoteTemplates() {
  lastFetch = 0;
  memory = null;
}

/** Odoo's good / better / best quotation templates, saved on the phone so they work offline. */
export function useQuoteTemplates(): TemplateSets {
  const { status, client } = useOdoo();
  const [sets, setSets] = useState<TemplateSets>(memory ?? {});

  useEffect(() => {
    if (memory) return;
    let live = true;
    AsyncStorage.getItem(TEMPLATES_STORAGE_KEY)
      .then((raw) => {
        if (!live || memory) return;
        memory = parseTemplates(raw);
        setSets(memory);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const online = status === 'signedIn' && !!client && client.session.apps.sales;
  useEffect(() => {
    if (!online || !client || Date.now() - lastFetch < REFRESH_MS) return;
    lastFetch = Date.now();
    let live = true;
    fetchTemplates(client)
      .then((fresh) => {
        memory = fresh;
        if (live) setSets(fresh);
        return AsyncStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(fresh));
      })
      .catch((e) => {
        lastFetch = 0;
        log.warn('odoo', `quotation templates: ${e instanceof Error ? e.message : String(e)}`);
      });
    return () => {
      live = false;
    };
  }, [online, client]);

  return sets;
}
