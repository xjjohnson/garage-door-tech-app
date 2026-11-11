import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_FOLLOW_UP, FOLLOW_UPS_STORAGE_KEY, FollowUpSettings, FollowUpStore, parseFollowUpStore } from './followups';

interface FollowUpsApi extends FollowUpStore {
  setSettings: (fn: (s: FollowUpSettings) => FollowUpSettings) => void;
  dismiss: (id: string) => void;
  undismiss: (id: string) => void;
  restore: (s: FollowUpStore) => void;
}

const Ctx = createContext<FollowUpsApi | null>(null);

/** Follow-up settings (warranty lengths, cycles a day) and which follow-ups were handled, saved on the phone. */
export function FollowUpsProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<FollowUpStore>({ settings: DEFAULT_FOLLOW_UP, dismissed: {} });
  const [loaded, setLoaded] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(FOLLOW_UPS_STORAGE_KEY)
      .then((raw) => {
        if (alive && raw && !touched.current) setStore(parseFollowUpStore(raw));
      })
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(FOLLOW_UPS_STORAGE_KEY, JSON.stringify(store)).catch(() => undefined);
  }, [store, loaded]);

  const change = useCallback((fn: (s: FollowUpStore) => FollowUpStore) => {
    touched.current = true;
    setStore(fn);
  }, []);
  const setSettings = useCallback<FollowUpsApi['setSettings']>((fn) => change((s) => ({ ...s, settings: fn(s.settings) })), [change]);
  const dismiss = useCallback((id: string) => change((s) => ({ ...s, dismissed: { ...s.dismissed, [id]: Date.now() } })), [change]);
  const undismiss = useCallback(
    (id: string) =>
      change((s) => {
        const { [id]: _gone, ...rest } = s.dismissed;
        return { ...s, dismissed: rest };
      }),
    [change],
  );
  const restore = useCallback((incoming: FollowUpStore) => change((s) => ({ settings: incoming.settings, dismissed: { ...s.dismissed, ...incoming.dismissed } })), [change]);

  const api = useMemo(() => ({ ...store, setSettings, dismiss, undismiss, restore }), [store, setSettings, dismiss, undismiss, restore]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useFollowUps(): FollowUpsApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useFollowUps needs a FollowUpsProvider above it');
  return api;
}
