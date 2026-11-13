import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_WORK_LOG, mergeWorkLog, openShift, parseWorkLog, Shift, WORK_LOG_STORAGE_KEY, WorkLog } from './worklog';

interface WorkLogApi extends WorkLog {
  loaded: boolean;
  clockIn: (odometer?: number) => void;
  clockOut: (odometer?: number) => void;
  updateShift: (id: string, patch: Partial<Omit<Shift, 'id' | 'updatedAt'>>) => void;
  removeShift: (id: string) => void;
  setCentsPerMile: (c: number) => void;
  restore: (incoming: WorkLog) => void;
  /** Remembers what was sent to Odoo Attendance for a day (does not count as an edit). */
  markAttendance: (id: string, ref: NonNullable<Shift['odooAtt']>) => void;
}

const Ctx = createContext<WorkLogApi | null>(null);

/** Days on the clock and miles driven, saved on the phone (AsyncStorage). */
export function WorkLogProvider({ children, now = Date.now }: { children: ReactNode; now?: () => number }) {
  const [log, setLog] = useState<WorkLog>(EMPTY_WORK_LOG);
  const [loaded, setLoaded] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(WORK_LOG_STORAGE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const saved = parseWorkLog(raw);
        setLog((cur) => (touched.current ? mergeWorkLog(saved, cur) : saved));
      })
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(WORK_LOG_STORAGE_KEY, JSON.stringify(log)).catch(() => undefined);
  }, [log, loaded]);

  const change = useCallback((fn: (l: WorkLog) => WorkLog) => {
    touched.current = true;
    setLog(fn);
  }, []);

  const clockIn = useCallback(
    (odometer?: number) =>
      change((l) => {
        if (openShift(l.shifts)) return l;
        const t = now();
        const s: Shift = { id: `s-${t.toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`, start: t, note: '', updatedAt: t, ...(odometer !== undefined ? { odoStart: odometer } : {}) };
        return { ...l, shifts: [...l.shifts, s] };
      }),
    [change, now],
  );
  const clockOut = useCallback(
    (odometer?: number) =>
      change((l) => {
        const open = openShift(l.shifts);
        if (!open) return l;
        const t = now();
        return { ...l, shifts: l.shifts.map((s) => (s.id === open.id ? { ...s, end: t, updatedAt: t, ...(odometer !== undefined ? { odoEnd: odometer } : {}) } : s)) };
      }),
    [change, now],
  );
  const updateShift = useCallback<WorkLogApi['updateShift']>((id, patch) => change((l) => ({ ...l, shifts: l.shifts.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: now() } : s)) })), [change, now]);
  const removeShift = useCallback((id: string) => change((l) => ({ ...l, shifts: l.shifts.filter((s) => s.id !== id) })), [change]);
  const setCentsPerMile = useCallback((c: number) => change((l) => ({ ...l, centsPerMile: c })), [change]);
  const restore = useCallback((incoming: WorkLog) => change((l) => mergeWorkLog(l, incoming)), [change]);

  const markAttendance = useCallback((id: string, ref: NonNullable<Shift['odooAtt']>) => change((l) => ({ ...l, shifts: l.shifts.map((s) => (s.id === id ? { ...s, odooAtt: ref } : s)) })), [change]);

  const api = useMemo(() => ({ ...log, loaded, clockIn, clockOut, updateShift, removeShift, setCentsPerMile, restore, markAttendance }), [log, loaded, clockIn, clockOut, updateShift, removeShift, setCentsPerMile, restore, markAttendance]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useWorkLog(): WorkLogApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useWorkLog needs a WorkLogProvider above it');
  return api;
}
