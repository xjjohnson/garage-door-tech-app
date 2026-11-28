/**
 * Facts for the Developer screen and the diagnostics file, kept free of React
 * so they can be tested. Nothing here ever includes a key or password.
 */
import type { PendingItems } from './pending';
import { currentFlavor } from '../flavor';
import { formatLog, LogEntry, redact } from './log';
import type { CheckResult } from './setupCheck';

export interface QueueRow {
  kind: string;
  count: number;
  /** When the oldest of them was made or last changed. */
  oldest: number | null;
}

/** Counts per kind of what's waiting for Odoo, with the oldest one's time, so a stuck item stands out. */
export function queueRows(it: PendingItems): QueueRow[] {
  const oldest = (xs: number[]) => (xs.length ? Math.min(...xs.map((x) => x || Infinity)) : null);
  const fin = (n: number | null) => (n === null || !Number.isFinite(n) ? null : n);
  const rows: QueueRow[] = [
    { kind: 'Customers', count: it.customers.length, oldest: fin(oldest(it.customers.map((c) => c.updatedAt))) },
    { kind: 'Jobs', count: it.jobs.length, oldest: fin(oldest(it.jobs.map((j) => j.updatedAt))) },
    { kind: 'Quotes', count: it.quotes.length, oldest: fin(oldest(it.quotes.map((j) => j.updatedAt))) },
    { kind: 'Invoices', count: it.invoices.length, oldest: fin(oldest(it.invoices.map((i) => i.createdAt))) },
    { kind: 'Payments', count: it.payments.reduce((n, p) => n + p.count, 0), oldest: fin(oldest(it.payments.map((p) => p.invoice.updatedAt))) },
  ];
  return rows.filter((r) => r.count > 0);
}

/** "3 hours ago", "2 days ago". */
export function ageLabel(t: number | null, now: number): string {
  if (t === null) return 'unknown';
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} days ago`;
}

/** An item older than this stands out as stuck. */
export const STUCK_MS = 24 * 3600 * 1000;

/** Green and red counts from the Odoo setup check. */
export function checkCounts(rs: CheckResult[]) {
  return { ok: rs.filter((r) => r.state === 'ok').length, warn: rs.filter((r) => r.state === 'warn').length, missing: rs.filter((r) => r.state === 'missing').length };
}

export interface UpdateDetails {
  release: string;
  runtimeVersion: string | null;
  updateId: string | null;
  publishedAt: Date | null;
  channel: string | null;
  embedded: boolean;
}

const fmtDate = (d: Date | null) => (d && !Number.isNaN(d.getTime()) ? d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'unknown');

/** Lines for the version and update details card. */
export function updateLines(u: UpdateDetails, lastChecked: number | null, now: number): [string, string][] {
  return [
    ['Release', u.release],
    ['APK (native)', u.runtimeVersion ?? 'development'],
    ['Update ID', u.embedded || !u.updateId ? 'as installed (no update yet)' : u.updateId],
    ['Published', u.embedded ? 'n/a' : fmtDate(u.publishedAt)],
    ['Channel', u.channel ?? 'none'],
    ['Last checked', lastChecked ? ageLabel(lastChecked, now) : 'not yet since the app opened'],
  ];
}

export interface DiagnosticsInput {
  buildInfo: string;
  update: UpdateDetails;
  beta: boolean | null;
  phone: string;
  odoo: { url: string; db: string; user: string; role: string } | null;
  appsFound: string[];
  setup: CheckResult[] | null;
  pendingText: string;
  sync: { lastOkAt: number | null; lastError: string | null };
  freeStorage: string;
  errors24h: number;
  now: number;
  entries: LogEntry[];
}

/** One text file for sending to whoever's fixing something: build, phone, Odoo, setup check, queue, sync, storage and the log. */
export function diagnosticsText(d: DiagnosticsInput): string {
  const setup = d.setup ? d.setup.map((r) => `  ${r.state === 'ok' ? 'OK     ' : r.state === 'warn' ? 'LOOK   ' : 'MISSING'} ${r.label}: ${r.detail}`) : ['  not run'];
  return redact(formatLog(d.entries, [
    `${currentFlavor().appName} diagnostics`,
    d.buildInfo,
    `Release ${d.update.release} · APK ${d.update.runtimeVersion ?? 'development'} · update ${d.update.embedded ? 'as installed' : `${d.update.updateId ?? '?'} (${fmtDate(d.update.publishedAt)})`}`,
    `Channel: ${d.beta ? 'beta' : d.update.channel ?? 'none'}`,
    `Phone: ${d.phone}`,
    `Free storage: ${d.freeStorage}`,
    d.odoo ? `Odoo: ${d.odoo.url} · database ${d.odoo.db} · ${d.odoo.user} · ${d.odoo.role} (API key: stored in keystore, not shown)` : 'Odoo: not signed in',
    `Apps found: ${d.appsFound.length ? d.appsFound.join(', ') : 'none'}`,
    'Setup check:',
    ...setup,
    `Waiting to send: ${d.pendingText}`,
    `Last good sync: ${d.sync.lastOkAt ? ageLabel(d.sync.lastOkAt, d.now) : 'none since the app opened'}`,
    `Last sync problem: ${d.sync.lastError ?? 'none'}`,
    `Problems in the last 24 hours: ${d.errors24h}`,
  ]));
}

/** Problems (warnings and errors) logged in the last 24 hours. */
export function recentProblems(entries: LogEntry[], now: number): number {
  return entries.filter((e) => e.level !== 'info' && e.t >= now - 24 * 3600 * 1000).length;
}

/** "1.2 GB free of 12 GB", or "unknown". */
export function storageLabel(free: number | null, total: number | null): string {
  const gb = (n: number) => (n / 1e9 >= 1 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`);
  if (free === null || !Number.isFinite(free)) return 'unknown';
  return total ? `${gb(free)} free of ${gb(total)}` : `${gb(free)} free`;
}

export type LogFilter = 'all' | 'errors' | 'warnings' | 'odoo';

/** The log lines to show: by kind, then by a search word (any part of the area or message, any case). */
export function filterLog(entries: LogEntry[], filter: LogFilter, query: string): LogEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => {
    if (filter === 'errors' && e.level === 'info') return false;
    if (filter === 'warnings' && e.level !== 'warn') return false;
    if (filter === 'odoo' && e.area !== 'odoo' && e.area !== 'sync') return false;
    return !q || `${e.area} ${e.msg}`.toLowerCase().includes(q);
  });
}

export interface PhotoUse {
  waiting: { count: number; bytes: number };
  sent: { count: number; bytes: number };
}

/** Photo storage on the phone: those still waiting to upload to Odoo, and those already in Odoo (kept on the phone too). */
export function photoUse(photos: { uri: string; odooId?: number }[], sizeOf: (uri: string) => number | null): PhotoUse {
  const use: PhotoUse = { waiting: { count: 0, bytes: 0 }, sent: { count: 0, bytes: 0 } };
  for (const p of photos) {
    const bucket = p.odooId ? use.sent : use.waiting;
    bucket.count++;
    bucket.bytes += sizeOf(p.uri) ?? 0;
  }
  return use;
}

export const bytesLabel = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
