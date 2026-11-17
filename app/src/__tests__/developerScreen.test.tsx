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
