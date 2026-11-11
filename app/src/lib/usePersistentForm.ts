import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { restoreForm } from './forms';

/**
 * Form state that survives closing the app: the last inputs are remembered
 * per tab, on the phone only (no network). If storage fails, the form still
 * works; it just starts blank next time.
 */
export function usePersistentForm<T extends object>(key: string, defaults: T) {
  const [form, setForm] = useState<T>(defaults);
  const loaded = useRef(false);
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(key)
      .then((raw) => {
        // Don't overwrite anything the tech already changed while loading.
        if (alive && raw && !touched.current) setForm(restoreForm(defaults, JSON.parse(raw)));
      })
      .catch(() => undefined)
      .finally(() => {
        loaded.current = true;
      });
    return () => {
      alive = false;
    };
    // defaults is a module constant; loading once per key is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!loaded.current && !touched.current) return;
    AsyncStorage.setItem(key, JSON.stringify(form)).catch(() => undefined);
  }, [key, form]);

  const update = useCallback((patch: Partial<T>) => {
    touched.current = true;
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => {
    touched.current = true;
    setForm(defaults);
  }, [defaults]);

  /** Swaps in a whole saved form, e.g. a job opened from the Jobs list. */
  const replace = useCallback(
    (next: T) => {
      touched.current = true;
      setForm(restoreForm(defaults, next));
    },
    [defaults],
  );

  return { form, update, reset, replace };
}
