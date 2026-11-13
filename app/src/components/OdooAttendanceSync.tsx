/**
 * Sends the time clock to Odoo's Attendances app in the background while
 * signed in, when that app is installed: clock in makes the check in, clock
 * out the check out. Without the app the days stay on the phone. Only days
 * started after this phone began sending go up. Renders nothing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { attendanceReady, ATTENDANCE_SINCE_KEY, myEmployee, pushShift, shiftsToSend } from '../lib/odooAttendance';
import { log } from '../lib/log';
import { onSyncNow } from '../lib/syncNow';
import { useAppForeground } from '../lib/useAppForeground';
import { useOdoo } from '../lib/useOdoo';
import { useWorkLog } from '../lib/useWorkLog';

const EVERY_MS = 3 * 60_000;
const AFTER_CHANGE_MS = 3000;
const RETRY_MS = 10 * 60_000;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function OdooAttendanceSync({ now = Date.now }: { now?: () => number }) {
  const { status, client } = useOdoo();
  const work = useWorkLog();
  const latest = useRef(work);
  latest.current = work;
  const [since, setSince] = useState<number | null>(null);
  const running = useRef(false);
  const failed = useRef(new Map<string, number>());
  const ready = useRef<{ key: string; ok: boolean; employee: number | null } | null>(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(ATTENDANCE_SINCE_KEY)
      .then(async (v) => {
        const n = Number(v);
        if (v && Number.isFinite(n)) return n;
        const t = now();
        await AsyncStorage.setItem(ATTENDANCE_SINCE_KEY, String(t)).catch(() => undefined);
        return t;
      })
      .catch(() => now())
      .then((n) => alive && setSince(n));
    return () => {
      alive = false;
    };
  }, [now]);

  const online = status === 'signedIn' && !!client && work.loaded && since !== null;

  const pass = useCallback(async () => {
    if (!client || since === null || running.current) return;
    running.current = true;
    try {
      const key = `${client.session.url}|${client.session.uid}`;
      if (ready.current?.key !== key || (ready.current.ok && ready.current.employee === null)) {
        const ok = await attendanceReady(client);
        ready.current = { key, ok, employee: ok ? await myEmployee(client) : null };
      }
      const r = ready.current;
      if (!r.ok || r.employee === null) return;
      for (const s of shiftsToSend(latest.current.shifts, since)) {
        if (now() - (failed.current.get(s.id) ?? 0) <= RETRY_MS) continue;
        try {
          latest.current.markAttendance(s.id, await pushShift(client, r.employee, s));
        } catch (e) {
          failed.current.set(s.id, now());
          log.warn('odoo', `time clock day ${s.id} not sent: ${message(e)}`);
        }
      }
    } catch (e) {
      log.warn('odoo', `time clock sync: ${message(e)}`);
    } finally {
      running.current = false;
    }
  }, [client, since, now]);

  useEffect(() => {
    if (!online) return;
    pass();
    const t = setInterval(pass, EVERY_MS);
    return () => clearInterval(t);
  }, [online, pass]);

  useEffect(() => {
    if (!online) return;
    const t = setTimeout(pass, AFTER_CHANGE_MS);
    return () => clearTimeout(t);
  }, [online, pass, work.shifts]);

  useAppForeground(() => {
    if (online) pass();
  });

  useEffect(() => {
    if (!online) return;
    return onSyncNow(() => {
      failed.current.clear();
      return pass();
    });
  }, [online, pass]);

  return null;
}
