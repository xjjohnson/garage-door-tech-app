import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { fetchFsmTemplates, FSM_TEMPLATES_STORAGE_KEY, FsmTemplate, parseSavedTemplates } from './fsmTemplates';
import { log } from './log';
import { useOdoo } from './useOdoo';

/**
 * Odoo's Field Service templates for New job: the ones read last time
 * straight away (so they work with no signal), then Odoo's current list
 * once signed in. Empty when Odoo has none.
 */
export function useFsmTemplates(): FsmTemplate[] {
  const { status, client } = useOdoo();
  const [templates, setTemplates] = useState<FsmTemplate[]>([]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(FSM_TEMPLATES_STORAGE_KEY)
      .then((raw) => alive && setTemplates((t) => (t.length ? t : parseSavedTemplates(raw))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (status !== 'signedIn' || !client || client.session.kind !== 'oca') return;
    let alive = true;
    fetchFsmTemplates(client)
      .then((list) => {
        if (!alive) return;
        setTemplates(list);
        AsyncStorage.setItem(FSM_TEMPLATES_STORAGE_KEY, JSON.stringify(list)).catch(() => undefined);
      })
      .catch((e) => log.warn('odoo', `templates: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      alive = false;
    };
  }, [status, client]);

  return templates;
}
