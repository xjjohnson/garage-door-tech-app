import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { log } from './log';
import { fetchPlans, MaintenancePlan, parseSavedPlans, PLANS_STORAGE_KEY } from './maintenancePlans';
import { useOdoo } from './useOdoo';

/**
 * The maintenance plans for a ticket: the list read last time straight away
 * (so it works with no signal), then Odoo's current list once signed in.
 * Only active plans, in the owner's order. Empty when there are none.
 */
export function useMaintenancePlans(): MaintenancePlan[] {
  const { status, client } = useOdoo();
  const [plans, setPlans] = useState<MaintenancePlan[]>([]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(PLANS_STORAGE_KEY)
      .then((raw) => alive && setPlans((p) => (p.length ? p : parseSavedPlans(raw))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (status !== 'signedIn' || !client) return;
    let alive = true;
    fetchPlans(client)
      .then((list) => {
        if (!alive) return;
        const active = list.filter((p) => p.active);
        setPlans(active);
        AsyncStorage.setItem(PLANS_STORAGE_KEY, JSON.stringify(active)).catch(() => undefined);
      })
      .catch((e) => log.warn('odoo', `plans: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      alive = false;
    };
  }, [status, client]);

  return plans;
}
