/**
 * While signed in to Odoo, clocked in, and the app is open, sends this
 * phone's position to the tech's own contact in Odoo every couple of minutes,
 * so a dispatcher can see where the trucks are. Only while the app is open
 * (no background tracking), only with the tech's permission, and the tech can
 * turn it off in Settings. Nothing is sent outside Odoo. Renders nothing.
 */
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef } from 'react';
import { loadShareLocation } from '../lib/locationPref';
import { log } from '../lib/log';
import { sharePosition } from '../lib/odooLocation';
import { useAppForeground } from '../lib/useAppForeground';
import { useOdoo } from '../lib/useOdoo';
import { useWorkLog } from '../lib/useWorkLog';
import { openShift } from '../lib/worklog';

const EVERY_MS = 2 * 60_000;

export function OdooLocationSync() {
  const { status, client } = useOdoo();
  const { shifts } = useWorkLog();
  const clockedIn = !!openShift(shifts);
  const on = status === 'signedIn' && !!client && clockedIn;
  const running = useRef(false);

  const pass = useCallback(async () => {
    if (!client || running.current) return;
    running.current = true;
    try {
      if (!(await loadShareLocation())) return;
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await sharePosition(client, p.coords.latitude, p.coords.longitude);
    } catch (e) {
      log.warn('location', `sharing position: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      running.current = false;
    }
  }, [client]);

  useEffect(() => {
    if (!on) return;
    pass();
    const t = setInterval(pass, EVERY_MS);
    return () => clearInterval(t);
  }, [on, pass]);

  useAppForeground(() => {
    if (on) pass();
  });

  return null;
}
