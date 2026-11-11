import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Fetch, ODOO_STORAGE_KEY, OdooClient, OdooError, OdooLogin } from './odoo';
import { deviceSecrets, SecretStore } from './secrets';

const SECRET_KEY = 'odoo.secret';

type Status = 'loading' | 'signedOut' | 'signingIn' | 'signedIn';

interface OdooApi {
  status: Status;
  client: OdooClient | null;
  /** The last sign-in details, to fill the form. */
  saved: OdooLogin | null;
  error: string | null;
  signIn: (login: OdooLogin, secret: string) => Promise<boolean>;
  signOut: () => void;
}

const Ctx = createContext<OdooApi | null>(null);

function parseLogin(raw: string | null): OdooLogin | null {
  try {
    const d = raw ? JSON.parse(raw) : null;
    if (d && typeof d.url === 'string' && typeof d.db === 'string' && typeof d.login === 'string') return { url: d.url, db: d.db, login: d.login };
  } catch {
    // Ignore a damaged entry.
  }
  return null;
}

/** The Odoo sign-in for team jobs. Signs in again on its own when the app opens, if a key was saved. */
export function OdooProvider({ children, fetchFn, secrets: givenSecrets }: { children: ReactNode; fetchFn?: Fetch; secrets?: SecretStore }) {
  const secrets = useMemo(() => givenSecrets ?? deviceSecrets(), [givenSecrets]);
  const doFetch = useMemo<Fetch>(() => fetchFn ?? ((url, init) => fetch(url, init)), [fetchFn]);
  const [status, setStatus] = useState<Status>('loading');
  const [client, setClient] = useState<OdooClient | null>(null);
  const [saved, setSaved] = useState<OdooLogin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef(0);

  const signIn = useCallback(
    async (login: OdooLogin, secret: string) => {
      const n = ++attempt.current;
      setStatus('signingIn');
      setError(null);
      try {
        const c = await OdooClient.signIn(doFetch, login, secret);
        if (n !== attempt.current) return false;
        const keep: OdooLogin = { url: c.session.url, db: c.session.db, login: c.session.login };
        setSaved(keep);
        setClient(c);
        setStatus('signedIn');
        AsyncStorage.setItem(ODOO_STORAGE_KEY, JSON.stringify(keep)).catch(() => undefined);
        await secrets.set(SECRET_KEY, secret);
        return true;
      } catch (e) {
        if (n !== attempt.current) return false;
        setClient(null);
        setStatus('signedOut');
        setError(e instanceof OdooError ? e.message : "Couldn't sign in to Odoo.");
        return false;
      }
    },
    [doFetch, secrets],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const login = parseLogin(await AsyncStorage.getItem(ODOO_STORAGE_KEY).catch(() => null));
      if (!alive) return;
      setSaved(login);
      const secret = login ? await secrets.get(SECRET_KEY) : null;
      if (!alive) return;
      if (login && secret) await signIn(login, secret);
      else setStatus('signedOut');
    })();
    return () => {
      alive = false;
    };
  }, [secrets, signIn]);

  const signOut = useCallback(() => {
    attempt.current++;
    setClient(null);
    setStatus('signedOut');
    setError(null);
    secrets.remove(SECRET_KEY);
  }, [secrets]);

  const api = useMemo(() => ({ status, client, saved, error, signIn, signOut }), [status, client, saved, error, signIn, signOut]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useOdoo(): OdooApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useOdoo needs an OdooProvider above it');
  return api;
}
