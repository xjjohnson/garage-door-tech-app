import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Appointment, mergeSchedule, parseSchedule, SCHEDULE_STORAGE_KEY, VisitStatus } from './schedule';

export type NewAppointment = Omit<Appointment, 'id' | 'createdAt' | 'updatedAt' | 'status'>;

interface ScheduleApi {
  appointments: Appointment[];
  loaded: boolean;
  add: (a: NewAppointment) => Appointment;
  update: (id: string, patch: Partial<NewAppointment>) => void;
  setStatus: (id: string, status: VisitStatus) => void;
  remove: (id: string) => void;
  restore: (incoming: Appointment[]) => void;
}

const Ctx = createContext<ScheduleApi | null>(null);

/** Appointments for the whole app, saved on the phone (AsyncStorage). */
export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(SCHEDULE_STORAGE_KEY)
      .then((raw) => {
        if (!alive) return;
        const saved = parseSchedule(raw);
        setAppointments((now) => (touched.current ? mergeSchedule(saved, now) : saved));
      })
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(appointments)).catch(() => undefined);
  }, [appointments, loaded]);

  const change = useCallback((fn: (p: Appointment[]) => Appointment[]) => {
    touched.current = true;
    setAppointments(fn);
  }, []);

  const add = useCallback<ScheduleApi['add']>(
    (a) => {
      const now = Date.now();
      const appt: Appointment = { ...a, name: a.name.trim(), address: a.address.trim(), phone: a.phone.trim(), what: a.what.trim(), id: `a-${now.toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`, status: 'booked', createdAt: now, updatedAt: now };
      change((p) => [...p, appt]);
      return appt;
    },
    [change],
  );
  const update = useCallback<ScheduleApi['update']>((id, patch) => change((p) => p.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a))), [change]);
  const setStatus = useCallback<ScheduleApi['setStatus']>((id, status) => change((p) => p.map((a) => (a.id === id ? { ...a, status, updatedAt: Date.now() } : a))), [change]);
  const remove = useCallback((id: string) => change((p) => p.filter((a) => a.id !== id)), [change]);
  const restore = useCallback((incoming: Appointment[]) => change((p) => mergeSchedule(p, incoming)), [change]);

  const api = useMemo(() => ({ appointments, loaded, add, update, setStatus, remove, restore }), [appointments, loaded, add, update, setStatus, remove, restore]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useSchedule(): ScheduleApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useSchedule needs a ScheduleProvider above it');
  return api;
}
