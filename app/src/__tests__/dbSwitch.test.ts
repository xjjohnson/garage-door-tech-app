import { claimIfUnowned, dataMatches, dbId, isNotLive, JOURNAL_KEY, knownDatabases, LIVE_KEY, OWNER_KEY, resumeSwitch, SECRET_KEY, switchDatabase, switchWarning, type Deps } from '../lib/dbSwitch';
import { ODOO_STORAGE_KEY } from '../lib/odoo';

function makeDeps(failWriteBack = false) {
  const data = new Map<string, string>();
  const files = new Map<string, string>();
  const keys = new Map<string, string>();
  const deps: Deps = {
    storage: {
      getItem: async (k) => data.get(k) ?? null,
      setItem: async (k, v) => void data.set(k, v),
      removeItem: async (k) => void data.delete(k),
      getAllKeys: async () => [...data.keys()],
      multiGet: async (ks) => ks.map((k) => [k, data.get(k) ?? null] as const),
      multiSet: async (ps) => void ps.forEach(([k, v]) => data.set(k, v)),
      multiRemove: async (ks) => void ks.forEach((k) => data.delete(k)),
    },
    snapshots: { read: async (id) => (failWriteBack ? null : files.get(id) ?? null), write: async (id, t) => void files.set(id, t) },
    secrets: { get: async (k) => keys.get(k) ?? null, set: async (k, v) => void keys.set(k, v), remove: async (k) => void keys.delete(k) },
  };
  return { deps, data, files, keys };
}

const live = { url: 'https://acme.odoo.com', db: 'acme', login: 'j@acme.com' };
const test = { url: 'https://acme.odoo.com/', db: 'acme-test', login: 'j@acme.com' };

describe('database switch', () => {
  it('keeps each database\'s phone data apart and brings it back', async () => {
    const { deps, data, keys } = makeDeps();
    data.set('jobs/v1', 'LIVE JOBS');
    data.set('invoices/v1', 'LIVE INVOICES');
    data.set(ODOO_STORAGE_KEY, JSON.stringify(live));
    keys.set(SECRET_KEY, 'livekey');

    await switchDatabase(deps, live, test, 'testkey');
    expect(data.get('jobs/v1')).toBeUndefined(); // live data is not on screen for the test database
    expect(data.get(OWNER_KEY)).toBe(dbId(test));
    expect(JSON.parse(data.get(ODOO_STORAGE_KEY)!).db).toBe('acme-test');
    expect(keys.get(SECRET_KEY)).toBe('testkey');
    expect(data.get(LIVE_KEY)).toBe(dbId(live)); // the one left is marked live
    expect(data.has(JOURNAL_KEY)).toBe(false);

    data.set('jobs/v1', 'TEST JOBS');
    await switchDatabase(deps, test, live, 'livekey');
    expect(data.get('jobs/v1')).toBe('LIVE JOBS');
    expect(data.get('invoices/v1')).toBe('LIVE INVOICES');
    await switchDatabase(deps, live, test, 'testkey');
    expect(data.get('jobs/v1')).toBe('TEST JOBS');
    expect((await knownDatabases(deps.storage)).map((k) => k.db).sort()).toEqual(['acme', 'acme-test']);
  });

  it('changes nothing when the snapshot cannot be read back', async () => {
    const { deps, data } = makeDeps(true);
    data.set('jobs/v1', 'LIVE JOBS');
    await expect(switchDatabase(deps, live, test, 'k')).rejects.toThrow(/nothing was changed/);
    expect(data.get('jobs/v1')).toBe('LIVE JOBS');
    expect(data.has(OWNER_KEY)).toBe(false);
  });

  it('finishes a swap that was cut off, and never mixes data', async () => {
    const { deps, data, files } = makeDeps();
    data.set('jobs/v1', 'LIVE JOBS');
    files.set(dbId(live), JSON.stringify({ 'jobs/v1': 'LIVE JOBS' }));
    data.set(JOURNAL_KEY, JSON.stringify({ from: dbId(live), to: test }));
    expect(await resumeSwitch(deps)).toBe(true);
    expect(data.get('jobs/v1')).toBeUndefined();
    expect(data.get(OWNER_KEY)).toBe(dbId(test));
    expect(await resumeSwitch(deps)).toBe(false);
  });

  it('only lets data go to the database it belongs to', async () => {
    const { deps } = makeDeps();
    expect(await dataMatches(deps.storage, live)).toBe(true); // older phone, no tag yet
    await claimIfUnowned(deps.storage, live);
    expect(await dataMatches(deps.storage, live)).toBe(true);
    expect(await dataMatches(deps.storage, test)).toBe(false);
  });

  it('knows when it is not on the live database and warns about unsent work', () => {
    expect(isNotLive(null, test)).toBe(false);
    expect(isNotLive(dbId(live), live)).toBe(false);
    expect(isNotLive(dbId(live), test)).toBe(true);
    expect(switchWarning('2 invoices', live, test)).toMatch(/Not sent to Odoo yet: 2 invoices.*does NOT send/);
    expect(switchWarning('', live, test)).toMatch(/None of it is sent to/);
  });
});
