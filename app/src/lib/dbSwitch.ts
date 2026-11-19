/**
 * Switching which Odoo database the phone is attached to (Developer screen).
 *
 * The phone keeps jobs, customers, invoices and everything waiting to send in
 * its own storage. That data belongs to ONE Odoo database, so it must never
 * be sent to another. Switching therefore:
 *   1. saves everything the phone holds for the database being left to a
 *      snapshot file, and checks it can be read back before anything is cleared;
 *   2. empties the phone's data and loads the snapshot of the database being
 *      entered (empty the first time, so it downloads fresh from Odoo);
 *   3. records which database the phone's data belongs to.
 * A journal makes the swap finish itself if the app is closed half way. The
 * phone never copies old data into Odoo here; each database keeps its own.
 * Kept free of React; storage, files and the key store are passed in.
 */
import { BETA_KEY } from './updateChannel';
import { FLAGS_STORAGE_KEY } from './featureFlags';
import { ODOO_STORAGE_KEY, cleanUrl } from './odoo';
import type { SecretStore } from './secrets';

export const SECRET_KEY = 'odoo.secret';
/** Which database the phone's data belongs to. Written last in a swap. */
export const OWNER_KEY = 'dbswitch/owner';
export const KNOWN_KEY = 'dbswitch/known';
export const LIVE_KEY = 'dbswitch/live';
export const JOURNAL_KEY = 'dbswitch/journal';

/** Kept as they are across a switch: the sign-in, update channel, feature flags and this feature's own records. */
export function isShared(key: string): boolean {
  return key === ODOO_STORAGE_KEY || key === BETA_KEY || key === FLAGS_STORAGE_KEY || key.startsWith('dbswitch/');
}

export interface DbTarget {
  url: string;
  db: string;
  login: string;
}

/** Same address and database name always give the same id. */
export function dbId(t: Pick<DbTarget, 'url' | 'db'>): string {
  return `${cleanUrl(t.url).toLowerCase()}|${t.db.trim().toLowerCase()}`;
}

/** "johnsons.example.com / test" for words on screen. */
export function dbLabel(t: Pick<DbTarget, 'url' | 'db'>): string {
  return `${cleanUrl(t.url).replace(/^https?:\/\//, '')} / ${t.db.trim()}`;
}

export interface KeyValueStore {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<unknown>;
  removeItem(k: string): Promise<unknown>;
  getAllKeys(): Promise<readonly string[]>;
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  multiSet(pairs: [string, string][]): Promise<unknown>;
  multiRemove(keys: readonly string[]): Promise<unknown>;
}

/** Where a database's snapshot lives (a file on the phone, so it doesn't crowd the app's storage). */
export interface SnapshotStore {
  read(id: string): Promise<string | null>;
  write(id: string, text: string): Promise<void>;
}

export interface Deps {
  storage: KeyValueStore;
  snapshots: SnapshotStore;
  secrets: SecretStore;
}

export interface KnownDb extends DbTarget {
  id: string;
  lastUsed: number;
}

export async function knownDatabases(storage: KeyValueStore): Promise<KnownDb[]> {
  try {
    const raw = await storage.getItem(KNOWN_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => x && typeof x.id === 'string' && typeof x.url === 'string' && typeof x.db === 'string') : [];
  } catch {
    return [];
  }
}

async function remember(storage: KeyValueStore, t: DbTarget, now: number) {
  const id = dbId(t);
  const list = (await knownDatabases(storage)).filter((x) => x.id !== id);
  list.push({ id, url: cleanUrl(t.url), db: t.db.trim(), login: t.login, lastUsed: now });
  await storage.setItem(KNOWN_KEY, JSON.stringify(list));
}

export async function liveId(storage: KeyValueStore): Promise<string | null> {
  return (await storage.getItem(LIVE_KEY).catch(() => null)) || null;
}

export async function setLive(storage: KeyValueStore, t: Pick<DbTarget, 'url' | 'db'>) {
  await storage.setItem(LIVE_KEY, dbId(t));
}

/** True when this is not the database marked live. False when no live database has been marked. */
export function isNotLive(live: string | null, current: Pick<DbTarget, 'url' | 'db'> | null): boolean {
  return !!live && !!current && live !== dbId(current);
}

const secretFor = (id: string) => `${SECRET_KEY}@${id}`;

/** A key saved for a database the phone has been attached to before. */
export async function hasSavedSecret(secrets: SecretStore, t: Pick<DbTarget, 'url' | 'db'>): Promise<boolean> {
  return !!(await secrets.get(secretFor(dbId(t))));
}

async function snapshotOf(storage: KeyValueStore): Promise<Record<string, string>> {
  const keys = (await storage.getAllKeys()).filter((k) => !isShared(k));
  const out: Record<string, string> = {};
  for (const [k, v] of await storage.multiGet(keys)) if (v !== null) out[k] = v;
  return out;
}

interface Journal {
  from: string;
  to: DbTarget;
}

/** Steps 2 and 3; safe to run again if the app was closed part way (the snapshots are already saved). */
async function finishSwap(deps: Deps, j: Journal, now: number) {
  const { storage, snapshots } = deps;
  const keys = (await storage.getAllKeys()).filter((k) => !isShared(k));
  if (keys.length) await storage.multiRemove(keys);
  const raw = await snapshots.read(dbId(j.to));
  const saved: Record<string, string> = raw ? JSON.parse(raw) : {};
  const pairs = Object.entries(saved).filter(([k]) => !isShared(k));
  if (pairs.length) await storage.multiSet(pairs);
  await storage.setItem(OWNER_KEY, dbId(j.to));
  await storage.setItem(ODOO_STORAGE_KEY, JSON.stringify({ url: cleanUrl(j.to.url), db: j.to.db.trim(), login: j.to.login }));
  await remember(storage, j.to, now);
  await storage.removeItem(JOURNAL_KEY);
}

/**
 * Moves the phone to another database. Call only after the sign-in to the new
 * database has worked, so a wrong password or name changes nothing. Restart
 * the app afterwards so every screen reloads its data.
 */
export async function switchDatabase(deps: Deps, from: DbTarget | null, to: DbTarget, secret: string, now = Date.now()): Promise<void> {
  const { storage, snapshots, secrets } = deps;
  const fromId = from ? dbId(from) : (await storage.getItem(OWNER_KEY)) ?? null;
  if (fromId === dbId(to)) throw new Error('Already attached to that database.');
  // The database being left becomes "live" if nothing was marked yet, so the test one stands out.
  if (from && !(await liveId(storage))) await setLive(storage, from);
  if (from) await remember(storage, from, now);
  // 1. Save what the phone holds for the database being left, and prove it reads back.
  if (fromId) {
    const text = JSON.stringify(await snapshotOf(storage));
    await snapshots.write(fromId, text);
    if ((await snapshots.read(fromId)) !== text) throw new Error("Couldn't save this database's data safely, so nothing was changed.");
    const old = await secrets.get(SECRET_KEY);
    if (old) await secrets.set(secretFor(fromId), old);
  }
  await secrets.set(SECRET_KEY, secret);
  await secrets.set(secretFor(dbId(to)), secret);
  const journal: Journal = { from: fromId ?? '', to };
  await storage.setItem(JOURNAL_KEY, JSON.stringify(journal));
  // 2 and 3.
  await finishSwap(deps, journal, now);
}

/** Looks for a swap the app was closed in the middle of, and finishes it. Returns true if it did. */
export async function resumeSwitch(deps: Deps, now = Date.now()): Promise<boolean> {
  const raw = await deps.storage.getItem(JOURNAL_KEY).catch(() => null);
  if (!raw) return false;
  try {
    const j = JSON.parse(raw) as Journal;
    if (!j?.to?.url || !j?.to?.db) throw new Error('bad journal');
    await finishSwap(deps, j, now);
    return true;
  } catch {
    // A damaged journal: drop it. The sign-in still points at the old database and the owner tag stops anything being sent (see dataMatches).
    await deps.storage.removeItem(JOURNAL_KEY).catch(() => undefined);
    return false;
  }
}

/**
 * True when the phone's data may be sent to this database: it was made for it,
 * or for no database yet (phones from before the switcher).
 */
export async function dataMatches(storage: KeyValueStore, current: Pick<DbTarget, 'url' | 'db'>): Promise<boolean> {
  const owner = await storage.getItem(OWNER_KEY).catch(() => null);
  return !owner || owner === dbId(current);
}

/** Tags phones from before the switcher with the database they are signed in to, so the check above has something to compare with. */
export async function claimIfUnowned(storage: KeyValueStore, current: Pick<DbTarget, 'url' | 'db'>) {
  const owner = await storage.getItem(OWNER_KEY).catch(() => null);
  if (!owner) await storage.setItem(OWNER_KEY, dbId(current)).catch(() => undefined);
}

/** The words shown before switching. */
export function switchWarning(pendingText: string, from: Pick<DbTarget, 'url' | 'db'> | null, to: Pick<DbTarget, 'url' | 'db'>): string {
  const keep = `Everything on this phone for ${from ? dbLabel(from) : 'the current database'} is saved separately and comes back if you switch back. None of it is sent to ${dbLabel(to)}.`;
  return pendingText ? `Not sent to Odoo yet: ${pendingText}. It stays with ${from ? dbLabel(from) : 'the current database'} and does NOT send until you switch back. ${keep}` : keep;
}
