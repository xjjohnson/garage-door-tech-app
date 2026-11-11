/**
 * Backups: everything the tech has typed in (jobs, customers, invoices, the price sheet
 * and business details)
 * in one file they can keep somewhere other than the phone, and read back
 * after a reinstall or on a new phone. Kept free of React so it can be tested
 * directly.
 *
 * The file is plain JSON with a format name and version, so a later version
 * of the app (or a sync with another system) can still read old backups.
 * Each job keeps its own id and updatedAt, which is what lets a restore merge
 * instead of wiping the phone.
 */
import { Customer, parseCustomers } from './customers';
import { Business, Invoice, parseBusiness, parseInvoices } from './invoices';
import { Job, parseJobs } from './jobs';
import { parsePriceSheet, PriceSheet } from './prices';

export const BACKUP_FORMAT = 'garage-door-tech-backup';
export const BACKUP_VERSION = 1;
/** When the last backup was saved, in milliseconds since 1970. */
export const LAST_BACKUP_KEY = 'backup.last.v1';

export interface Backup {
  exportedAt: number;
  jobs: Job[];
  /** Empty in backups made before customers existed; they're rebuilt from the jobs. */
  customers: Customer[];
  invoices: Invoice[];
  /** The tech's business and payment details, if the backup has them. */
  business?: Business;
  /** Missing when the file had none; restoring then leaves the phone's prices alone. */
  priceSheet?: PriceSheet;
}

export function makeBackup(data: { jobs: Job[]; customers?: Customer[]; invoices?: Invoice[]; business?: Business; priceSheet: PriceSheet }, now: number, appVersion?: string): string {
  const file = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    ...(appVersion ? { appVersion } : {}),
    jobs: data.jobs,
    customers: data.customers ?? [],
    invoices: data.invoices ?? [],
    ...(data.business ? { business: data.business } : {}),
    priceSheet: data.priceSheet,
  };
  return JSON.stringify(file, null, 1);
}

export type ParsedBackup = { ok: true; backup: Backup } | { ok: false; reason: string };

/** Reads a backup file. Bad jobs inside are dropped the same way the saved list drops them. */
export function parseBackup(raw: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "That file isn't a backup from this app." };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: "That file isn't a backup from this app." };
  const d = data as Record<string, unknown>;
  if (d.format !== BACKUP_FORMAT) return { ok: false, reason: "That file isn't a backup from this app." };
  if (typeof d.version !== 'number' || d.version > BACKUP_VERSION) {
    return { ok: false, reason: 'That backup was made by a newer version of the app. Update the app, then try again.' };
  }
  const at = typeof d.exportedAt === 'string' ? Date.parse(d.exportedAt) : NaN;
  const priceSheet = d.priceSheet && typeof d.priceSheet === 'object' ? parsePriceSheet(JSON.stringify(d.priceSheet)) : undefined;
  return {
    ok: true,
    backup: {
      exportedAt: Number.isNaN(at) ? 0 : at,
      jobs: Array.isArray(d.jobs) ? parseJobs(JSON.stringify(d.jobs)) : [],
      customers: Array.isArray(d.customers) ? parseCustomers(d.customers) : [],
      invoices: Array.isArray(d.invoices) ? parseInvoices(d.invoices) : [],
      ...(d.business && typeof d.business === 'object' ? { business: parseBusiness(d.business) } : {}),
      ...(priceSheet ? { priceSheet } : {}),
    },
  };
}

export interface MergeResult {
  jobs: Job[];
  /** Jobs in the backup that weren't on the phone. */
  added: number;
  /** Jobs on the phone that the backup had a newer copy of. */
  updated: number;
}

/**
 * Puts a backup's jobs together with the phone's. Nothing on the phone is
 * deleted; when both have the same job, the one changed last wins.
 */
export function mergeJobs(current: Job[], incoming: Job[]): MergeResult {
  const byId = new Map(current.map((j) => [j.id, j]));
  let added = 0;
  let updated = 0;
  for (const j of incoming) {
    const mine = byId.get(j.id);
    if (!mine) {
      byId.set(j.id, j);
      added++;
    } else if (j.updatedAt > mine.updatedAt) {
      byId.set(j.id, j);
      updated++;
    }
  }
  return { jobs: [...byId.values()], added, updated };
}

/** "garage-door-backup-2026-11-11.json", in the phone's own date. */
export function backupFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `garage-door-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}
