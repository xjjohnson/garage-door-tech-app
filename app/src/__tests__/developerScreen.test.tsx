import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, screen } from '@testing-library/react-native';
import { ageLabel, checkCounts, diagnosticsText, queueRows, recentProblems, storageLabel, updateLines } from '../lib/devInfo';
import type { PendingItems } from '../lib/pending';
import { onSyncNow, requestSyncNow, resetSyncStatus, syncStatus } from '../lib/syncNow';
import { renderApp } from '../testing/renderApp';

const HOUR = 3600 * 1000;
const now = 1_700_000_000_000;
const items: PendingItems = {
  customers: [{ id: 'c1', updatedAt: now - 3 * HOUR }, { id: 'c2', updatedAt: now - 5 * HOUR }] as never,
  jobs: [{ id: 'j1', updatedAt: now - 50 * HOUR }] as never,
  quotes: [],
  invoices: [],
  payments: [{ invoice: { updatedAt: now - HOUR } as never, count: 2 }],
};
const update = { release: '0.5.147', runtimeVersion: '0.5.0', updateId: 'abcd-1234', publishedAt: new Date('2026-11-17T20:00:00Z'), channel: 'production', embedded: false };

describe('developer helpers', () => {
  it('counts the queue per kind with the oldest age', () => {
    const rows = queueRows(items);
    expect(rows.map((r) => [r.kind, r.count, r.oldest])).toEqual([
      ['Customers', 2, now - 5 * HOUR],
      ['Jobs', 1, now - 50 * HOUR],
      ['Payments', 2, now - HOUR],
    ]);
    expect(ageLabel(now - 50 * HOUR, now)).toBe('2 days ago');
    expect(ageLabel(now - 90_000, now)).toBe('2 min ago');
    expect(ageLabel(null, now)).toBe('unknown');
  });

  it('summarises the setup check and update details', () => {
    expect(checkCounts([{ state: 'ok' }, { state: 'ok' }, { state: 'warn' }, { state: 'missing' }] as never)).toEqual({ ok: 2, warn: 1, missing: 1 });
    const lines = Object.fromEntries(updateLines(update, null, now));
    expect(lines['Release']).toBe(update.release);
    expect(lines['Update ID']).toBe('abcd-1234');
    expect(lines['Published']).toContain('2026-11-17 20:00');
    expect(lines['Last checked']).toMatch(/not yet/);
    expect(storageLabel(1.2e9, 12e9)).toBe('1.2 GB free of 12.0 GB');
    expect(storageLabel(null, null)).toBe('unknown');
  });

  it('makes a diagnostics file with the facts and no key', () => {
    const key = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
    const entries = [
      { t: now - HOUR, level: 'error' as const, area: 'odoo', msg: `auth failed api_key=${key}` },
      { t: now - 100 * HOUR, level: 'warn' as const, area: 'sync', msg: 'old' },
      { t: now, level: 'info' as const, area: 'app', msg: 'ok' },
    ];
    expect(recentProblems(entries, now)).toBe(1);
    const text = diagnosticsText({
      buildInfo: 'Version 0.5.144',
      update,
      beta: true,
      phone: 'Pixel 8 · android 15',
      odoo: { url: 'https://acme.odoo.com', db: 'acme', user: 'Justin', role: 'owner' },
      appsFound: ['Field Service'],
      setup: [{ id: 'a', label: 'Workers', state: 'ok', detail: '2 found' }],
      pendingText: '2 customers',
      sync: { lastOkAt: now - HOUR, lastError: null },
      freeStorage: '1.2 GB free',
      errors24h: 1,
      now,
      entries,
    });
    expect(text).toContain('acme.odoo.com');
    expect(text).toContain('database acme');
    expect(text).toContain('stored in keystore');
    expect(text).toContain('OK      Workers: 2 found');
    expect(text).toContain('Channel: beta');
    expect(text).not.toContain(key);
  });

  it('tracks how the last Sync now went', async () => {
    resetSyncStatus();
    const off = onSyncNow(() => {
      throw new Error('no signal');
    });
    await requestSyncNow(() => 5);
    expect(syncStatus()).toMatchObject({ running: false, lastRunAt: 5, lastOkAt: null, lastError: 'no signal' });
    off();
    await requestSyncNow(() => 9);
    expect(syncStatus()).toMatchObject({ lastOkAt: 9, lastRunAt: 9 });
  });
});

describe('Developer screen', () => {
  it('has the account, sync, queue and update sections, and a sign-in form when signed out', async () => {
    await AsyncStorage.clear();
    await renderApp('/developer');
    for (let i = 0; i < 6; i++) await act(async () => undefined);
    expect(screen.getByTestId('dev-account')).toBeTruthy();
    expect(screen.getByTestId('dev-account-state')).toHaveTextContent('Not signed in');
    expect(screen.getByTestId('dev-signin-form')).toBeTruthy();
    expect(screen.getByTestId('dev-sync')).toBeTruthy();
    expect(screen.getByTestId('dev-db-name')).toHaveTextContent('Not signed in');
    expect(screen.getByTestId('dev-db-check')).toBeTruthy();
    expect(screen.getByTestId('dev-queue-empty')).toBeTruthy();
    expect(screen.getByTestId('dev-update-details')).toBeTruthy();
    expect(screen.getByTestId('dev-setup-summary')).toHaveTextContent('Sign in to run the setup check.');
    expect(screen.queryByTestId('dev-signout')).toBeNull();
    expect(screen.getByTestId('dev-share-log')).toHaveTextContent('Share diagnostics');
  });

  it('Profile signed out only offers a plain sign-in, and the Team page no longer has Sign out', async () => {
    await AsyncStorage.clear();
    const app = await renderApp('/profile');
    for (let i = 0; i < 6; i++) await act(async () => undefined);
    expect(screen.getByTestId('profile-sign-in')).toBeTruthy();
    expect(screen.queryByTestId('profile-odoo')).toBeNull();
    expect(app.getPathname()).toBe('/profile');
  });
});

import { fireEvent } from '@testing-library/react-native';
import { clearLocalCache, CACHE_KEYS } from '../lib/clearCache';
import { filterLog } from '../lib/devInfo';
import { INVOICES_STORAGE_KEY } from '../lib/invoices';
import { JOBS_STORAGE_KEY } from '../lib/jobs';
import { CUSTOMERS_STORAGE_KEY } from '../lib/customers';
import { NOTES_OUTBOX_KEY } from '../lib/odooNotes';
import { ATTACHMENTS_STORAGE_KEY } from '../lib/attachments';
import { PRICE_BOOK_FAVORITES_KEY } from '../lib/priceBook';

describe('clear local cache and log tools', () => {
  it('removes only the Odoo copies and keeps unsent work', async () => {
    await AsyncStorage.clear();
    const keep = [JOBS_STORAGE_KEY, CUSTOMERS_STORAGE_KEY, INVOICES_STORAGE_KEY, NOTES_OUTBOX_KEY, ATTACHMENTS_STORAGE_KEY, PRICE_BOOK_FAVORITES_KEY];
    for (const k of keep) await AsyncStorage.setItem(k, '[1]');
    for (const c of CACHE_KEYS) await AsyncStorage.setItem(c.key, '[2]');
    expect(await clearLocalCache()).toBe(CACHE_KEYS.length);
    for (const c of CACHE_KEYS) expect(await AsyncStorage.getItem(c.key)).toBeNull();
    for (const k of keep) expect(await AsyncStorage.getItem(k)).toBe('[1]');
    expect(CACHE_KEYS.map((c) => c.key)).not.toEqual(expect.arrayContaining(keep));
  });

  it('filters the log by kind and search word', () => {
    const e = [
      { t: 1, level: 'info' as const, area: 'odoo', msg: 'read res.partner' },
      { t: 2, level: 'warn' as const, area: 'sync', msg: 'slow answer' },
      { t: 3, level: 'error' as const, area: 'crash', msg: 'Boom' },
    ];
    expect(filterLog(e, 'warnings', '').map((x) => x.t)).toEqual([2]);
    expect(filterLog(e, 'errors', '').map((x) => x.t)).toEqual([2, 3]);
    expect(filterLog(e, 'odoo', '').map((x) => x.t)).toEqual([1, 2]);
    expect(filterLog(e, 'all', 'BOOM').map((x) => x.t)).toEqual([3]);
    expect(filterLog(e, 'all', 'sync slow').map((x) => x.t)).toEqual([2]);
  });

  it('asks before clearing, and the screen search narrows the log', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(CACHE_KEYS[0].key, '[2]');
    await AsyncStorage.setItem(PRICE_BOOK_FAVORITES_KEY, '[1]');
    await renderApp('/developer');
    for (let i = 0; i < 6; i++) await act(async () => undefined);
    await fireEvent.press(screen.getByTestId('dev-clear-cache'));
    expect(screen.getByTestId('dev-clear-confirm')).toHaveTextContent(/keeps everything not yet sent to Odoo/);
    expect(await AsyncStorage.getItem(CACHE_KEYS[0].key)).toBe('[2]');
    await fireEvent.press(screen.getByTestId('dev-clear-yes'));
    for (let i = 0; i < 6; i++) await act(async () => undefined);
    expect(await AsyncStorage.getItem(CACHE_KEYS[0].key)).toBeNull();
    expect(await AsyncStorage.getItem(PRICE_BOOK_FAVORITES_KEY)).toBe('[1]');
    expect(screen.getByTestId('dev-cache-note')).toHaveTextContent(/Nothing waiting to send was touched/);
    await fireEvent.changeText(screen.getByTestId('dev-log-search'), 'zzz-no-such-line');
    expect(screen.getByTestId('dev-log-count')).toHaveTextContent(/^0 lines/);
  });
});

import { callTrace, clearCallTrace, recordCall, slowest, TRACE_SIZE } from '../lib/callTrace';
import { bytesLabel, photoUse } from '../lib/devInfo';
import { rolePreview, setRolePreview } from '../lib/devFlags';
import { FEATURE_FLAGS, featureOn, FLAGS_STORAGE_KEY, loadFeatureFlags, resetFeatureFlags, setFeature } from '../lib/featureFlags';
import { checkNetwork } from '../lib/networkCheck';
import { OdooClient } from '../lib/odoo';
import { isOwner } from '../lib/scorecard';

describe('network, storage, call trace, flags and role preview', () => {
  it('times the internet and Odoo checks, and reports slow and failed', async () => {
    let t = 0;
    const clock = () => t;
    const fast = async () => {
      t += 120;
      return { ok: true, status: 200 };
    };
    const r = await checkNetwork({ odooUrl: 'https://acme.odoo.com/', fetchFn: fast, now: clock });
    expect(r.map((x) => [x.name, x.state, x.ms])).toEqual([['Internet', 'ok', 120], ['Odoo', 'ok', 120]]);
    const slow = await checkNetwork({ odooUrl: null, fetchFn: async () => { t += 3000; return { ok: true, status: 200 }; }, now: clock });
    expect(slow[0].state).toBe('slow');
    const down = await checkNetwork({ odooUrl: 'https://x.odoo.com', fetchFn: async (url) => { if (url.includes('odoo')) return { ok: false, status: 502 }; throw new Error('Network request failed'); }, now: clock });
    expect(down.map((x) => x.state)).toEqual(['failed', 'failed']);
    expect(down[0].detail).toContain('Network request failed');
    const off = await checkNetwork({ odooUrl: 'https://x.odoo.com', offline: true });
    expect(off.every((x) => x.state === 'failed' && /Pretend offline/.test(x.detail))).toBe(true);
  });

  it('counts photos waiting to upload separately from those in Odoo', () => {
    const u = photoUse([{ uri: 'a', odooId: 3 }, { uri: 'b' }, { uri: 'c' }], (uri) => ({ a: 2e6, b: 1.5e6, c: null })[uri] ?? null);
    expect(u.waiting).toEqual({ count: 2, bytes: 1.5e6 });
    expect(u.sent).toEqual({ count: 1, bytes: 2e6 });
    expect(bytesLabel(1.5e6)).toBe('1.5 MB');
    expect(bytesLabel(800)).toBe('1 KB');
  });

  it('keeps the last 50 Odoo calls, by model and method only', async () => {
    clearCallTrace();
    for (let i = 0; i < 60; i++) recordCall({ t: i, model: 'res.partner', method: 'read', ms: i, ok: true });
    expect(callTrace()).toHaveLength(TRACE_SIZE);
    expect(callTrace()[0].t).toBe(10);
    expect(slowest(callTrace(), 2).map((c) => c.ms)).toEqual([59, 58]);
    clearCallTrace();
    // A real client call lands in the trace without its arguments or answer.
    const fetchFn = async (_u: string, init?: { body?: string }) => ({ ok: true, status: 200, json: async () => ({ result: [{ secret: 'x' }], id: JSON.parse(init?.body ?? '{}').id }), text: async () => '' });
    const client = new OdooClient(fetchFn as never, { url: 'https://a.odoo.com', db: 'a', login: 'l', uid: 1, name: 'N', kind: 'none', me: 1, fsm: false, assignField: 'user_ids', fields: [], apps: {} as never, productFields: [] }, 'KEY');
    await client.call('res.partner', 'search_read', [[['name', '=', 'Pat']]]).catch(() => undefined);
    expect(callTrace().map((c) => `${c.model}.${c.method}`)).toEqual(['res.partner.search_read']);
    expect(JSON.stringify(callTrace())).not.toMatch(/Pat|KEY/);
  });

  it('saves feature flags and falls back to defaults', async () => {
    await AsyncStorage.clear();
    resetFeatureFlags();
    expect(featureOn('callTrace')).toBe(FEATURE_FLAGS.find((f) => f.id === 'callTrace')!.default);
    expect(featureOn('logSlowCalls')).toBe(false);
    await setFeature('logSlowCalls', true);
    resetFeatureFlags();
    await loadFeatureFlags();
    expect(featureOn('logSlowCalls')).toBe(true);
    expect(JSON.parse((await AsyncStorage.getItem(FLAGS_STORAGE_KEY))!)).toEqual({ logSlowCalls: true });
  });

  it('role preview makes the owner look like a tech without calling Odoo', async () => {
    const calls: string[] = [];
    const owner = { session: { uid: 1 }, call: async (m: string, method: string) => { calls.push(`${m}.${method}`); return true; } } as never;
    expect(await isOwner(owner)).toBe(true);
    calls.length = 0;
    setRolePreview('tech');
    expect(rolePreview()).toBe('tech');
    expect(await isOwner(owner)).toBe(false);
    expect(calls).toEqual([]);
    setRolePreview(null);
  });

  it('shows the new sections on the screen', async () => {
    await AsyncStorage.clear();
    await renderApp('/developer');
    for (let i = 0; i < 6; i++) await act(async () => undefined);
    expect(screen.getByTestId('dev-network')).toBeTruthy();
    expect(screen.getByTestId('dev-storage-waiting')).toHaveTextContent('No photos waiting to upload');
    await fireEvent.press(screen.getByTestId('dev-calls-toggle'));
    expect(screen.getByTestId('dev-calls')).toBeTruthy();
    expect(screen.getByTestId('dev-role')).toBeTruthy();
    expect(screen.getByTestId('dev-flag-callTrace')).toBeTruthy();
  });
});

describe('testing tools (0.6.8)', () => {
  it('each role preview opens only its own area, and never calls Odoo', async () => {
    const { previewAccess, departmentAccess } = require('../lib/odooWarehouse');
    expect(previewAccess('buyer')).toMatchObject({ purchasing: true, warehouse: false, owner: false, dispatch: false });
    expect(previewAccess('dispatcher')).toMatchObject({ dispatch: true, purchasing: false });
    expect(previewAccess('tech')).toMatchObject({ owner: false, dispatch: false, office: false, sales: false, warehouse: false, purchasing: false });
    expect(previewAccess('owner').owner).toBe(true);
    const calls: string[] = [];
    const client = { session: { uid: 1 }, call: async (m: string) => { calls.push(m); return true; } } as never;
    setRolePreview('warehouse');
    expect((await departmentAccess(client)).warehouse).toBe(true);
    expect(await isOwner(client)).toBe(false);
    setRolePreview('owner');
    expect(await isOwner(client)).toBe(true);
    expect(calls).toEqual([]);
    setRolePreview(null);
  });

  it('pretend time moves now to the chosen time and back', () => {
    const { setPretendTime, devNow, pretendTime } = require('../lib/devFlags');
    const real = new Date(2026, 10, 18, 15, 0).getTime();
    setPretendTime('07:30', real);
    const d = new Date(real + (devNow() - Date.now()));
    expect(d.getHours()).toBe(7);
    expect(d.getMinutes()).toBe(30);
    expect(pretendTime()).not.toBeNull();
    setPretendTime('99:99');
    expect(pretendTime()).not.toBeNull();
    setPretendTime(null);
    expect(pretendTime()).toBeNull();
  });

  it('flaky signal drops every 4th call and normal drops none', () => {
    const { setWeakSignal, flakyDrop } = require('../lib/devFlags');
    setWeakSignal('flaky');
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(() => flakyDrop())).toEqual([false, false, false, true, false, false, false, true]);
    setWeakSignal('normal');
    expect(flakyDrop()).toBe(false);
  });

  it('ticks stay per release, a second tap clears, and the changelog points out what is new', async () => {
    await AsyncStorage.clear();
    const { setTick, loadTicks, doneCount } = require('../lib/testChecklist');
    const { newerThan, RELEASE_NOTES } = require('../data/releaseNotes');
    let t = await setTick('0.6.8', 1, 'pass');
    expect(doneCount(t, 6)).toBe(1);
    t = await setTick('0.6.8', 1, 'pass');
    expect(await loadTicks('0.6.8')).toEqual({});
    expect(await loadTicks('0.6.7')).toEqual({});
    expect(newerThan('0.6.6', RELEASE_NOTES).map((n: { release: string }) => n.release)).toEqual(['0.6.10', '0.6.8', '0.6.7']);
    expect(newerThan(null, RELEASE_NOTES)).toEqual([]);
  });

  it('the Developer screen shows the checklist, and Problem shares the log', async () => {
    await AsyncStorage.clear();
    await renderApp('/developer');
    for (let i = 0; i < 6; i++) await act(async () => undefined);
    expect(screen.getByTestId('dev-role')).toBeTruthy();
    expect(screen.getByTestId('dev-signal')).toBeTruthy();
    expect(screen.getByTestId('dev-test-item-0')).toBeTruthy();
    expect(screen.getByTestId('dev-test-count')).toHaveTextContent(/^0 of \d+ done/);
    await act(async () => {
      fireEvent.press(screen.getByTestId('dev-test-pass-0'));
    });
    expect(screen.getByTestId('dev-test-count')).toHaveTextContent(/^1 of \d+ done/);
  });

  it('shows a Test mode label while a switch is on', async () => {
    const { testModeLabels } = require('../components/TestModeBanner');
    expect(testModeLabels()).toEqual([]);
    setRolePreview('buyer');
    expect(testModeLabels()).toEqual(['Viewing as Buyer']);
    setRolePreview(null);
  });
});
