import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ReactNode } from 'react';
import { backupFileName, BACKUP_FORMAT, LAST_BACKUP_KEY, makeBackup, mergeJobs, parseBackup } from '../lib/backup';
import { BackupFiles } from '../lib/backupFiles';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { createJob, Job, JOBS_STORAGE_KEY, parseJobs } from '../lib/jobs';
import { DEFAULT_PRICE_SHEET, parsePriceSheet, PRICE_SHEET_STORAGE_KEY, PriceSheet } from '../lib/prices';
import { CustomersProvider } from '../lib/useCustomers';
import { FollowUpsProvider } from '../lib/useFollowUps';
import { InvoicesProvider } from '../lib/useInvoices';
import { JobsProvider } from '../lib/useJobs';
import { PriceSheetProvider } from '../lib/usePriceSheet';
import { BackupScreen } from '../screens/BackupScreen';
import { renderApp } from '../testing/renderApp';

const MATCH = { mode: 'match' as const, form: { ...DEFAULT_MATCH_FORM, twentyCoil: '4 1/2', length: '24' } };
const job = (id: string, customer: string, at: number): Job =>
  createJob(MATCH, { customer, address: '', phone: '', notes: '' }, { title: '.225 × 2" × 24"' }, at, id);

const SHEET: PriceSheet = { ...DEFAULT_PRICE_SHEET, serviceCall: '89', springLabor: '150' };
const NOW = new Date(2026, 10, 11, 9).getTime();

describe('backups (plain logic)', () => {
  it('writes a file that reads back the same', () => {
    const jobs = [job('a', 'Smith', 1000), job('b', 'Jones', 2000)];
    const raw = makeBackup({ jobs, priceSheet: SHEET }, NOW, '0.3.0');
    expect(JSON.parse(raw)).toMatchObject({ format: BACKUP_FORMAT, version: 1, appVersion: '0.3.0' });
    const parsed = parseBackup(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.jobs).toEqual(jobs);
    expect(parsed.backup.priceSheet).toEqual(SHEET);
    expect(parsed.backup.exportedAt).toBe(NOW);
  });

  it('refuses other files and backups from a newer version', () => {
    expect(parseBackup('not json').ok).toBe(false);
    expect(parseBackup('{"jobs": []}').ok).toBe(false);
    const newer = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99, jobs: [] }));
    expect(newer.ok).toBe(false);
    if (!newer.ok) expect(newer.reason).toMatch(/newer version/);
  });

  it('drops broken jobs and leaves prices alone when the file has none', () => {
    const parsed = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, jobs: [job('a', 'Smith', 1), { id: 3 }, 'x'] }));
    expect(parsed.ok && parsed.backup.jobs.map((j) => j.id)).toEqual(['a']);
    expect(parsed.ok && parsed.backup.priceSheet).toBeUndefined();
  });

  it('merges without deleting, keeping the copy changed last', () => {
    const phone = [job('a', 'Smith', 1000), { ...job('b', 'Jones (phone)', 1000), updatedAt: 5000 }, job('c', 'Only on phone', 1000)];
    const file = [{ ...job('a', 'Smith (newer)', 1000), updatedAt: 3000 }, { ...job('b', 'Jones (old)', 1000), updatedAt: 2000 }, job('d', 'Only in file', 1000)];
    const out = mergeJobs(phone, file);
    expect(out.added).toBe(1);
    expect(out.updated).toBe(1);
    expect(Object.fromEntries(out.jobs.map((j) => [j.id, j.customer]))).toEqual({
      a: 'Smith (newer)',
      b: 'Jones (phone)',
      c: 'Only on phone',
      d: 'Only in file',
    });
  });

  it('names the file by date', () => {
    expect(backupFileName(NOW)).toBe('garage-door-backup-2026-11-11.json');
  });
});

function fakeFiles(toPick: string | null = null) {
  const saved: { name: string; text: string }[] = [];
  const files: BackupFiles = {
    save: jest.fn(async (name: string, text: string) => {
      saved.push({ name, text });
      return 'Download';
    }),
    pick: jest.fn(async () => toPick),
  };
  return { files, saved };
}

const wrap = ({ children }: { children: ReactNode }) => (
  <JobsProvider>
    <CustomersProvider>
      <PriceSheetProvider>
        <InvoicesProvider>
          <FollowUpsProvider>{children}</FollowUpsProvider>
        </InvoicesProvider>
      </PriceSheetProvider>
    </CustomersProvider>
  </JobsProvider>
);

/** Lets the providers read storage and the pickers' promises settle. */
async function settle() {
  for (let i = 0; i < 5; i++) await act(async () => undefined);
}

describe('Backup screen', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('saves every job and the price sheet to the folder picked', async () => {
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([job('a', 'Smith', 1000)]));
    await AsyncStorage.setItem(PRICE_SHEET_STORAGE_KEY, JSON.stringify(SHEET));
    const { files, saved } = fakeFiles();
    await render(<BackupScreen files={files} now={() => NOW} />, { wrapper: wrap });
    await settle();
    expect(screen.getByTestId('backup-last')).toHaveTextContent('No backup yet.');
    await fireEvent.press(screen.getByTestId('backup-save'));
    await settle();
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('garage-door-backup-2026-11-11.json');
    const parsed = parseBackup(saved[0].text);
    expect(parsed.ok && parsed.backup.jobs.map((j) => j.customer)).toEqual(['Smith']);
    expect(parsed.ok && parsed.backup.priceSheet?.serviceCall).toBe('89');
    expect(screen.getByTestId('backup-note')).toHaveTextContent(/Saved garage-door-backup-2026-11-11\.json to Download: 1 job, 1 customer, 0 invoices and your prices/);
    expect(screen.getByTestId('backup-last')).toHaveTextContent(/Last backup: /);
    expect(await AsyncStorage.getItem(LAST_BACKUP_KEY)).toBe(String(NOW));
  });

  it('restores after showing what will change, merging jobs and replacing prices', async () => {
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([job('a', 'On phone', 1000)]));
    const file = makeBackup({ jobs: [job('b', 'From backup', 2000)], priceSheet: SHEET }, NOW);
    const { files } = fakeFiles(file);
    await render(<BackupScreen files={files} now={() => NOW} />, { wrapper: wrap });
    await settle();
    await fireEvent.press(screen.getByTestId('backup-pick'));
    await settle();
    expect(screen.getByTestId('backup-preview')).toHaveTextContent(/1 job: 1 new to this phone, 0 newer/);
    // Nothing changes until Restore is tapped.
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY)).map((j) => j.id)).toEqual(['a']);
    await fireEvent.press(screen.getByTestId('backup-confirm'));
    await settle();
    expect(screen.getByTestId('backup-note')).toHaveTextContent('Restored: 1 job added, 0 jobs updated, price sheet restored.');
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY)).map((j) => j.id).sort()).toEqual(['a', 'b']);
    expect(parsePriceSheet(await AsyncStorage.getItem(PRICE_SHEET_STORAGE_KEY)).serviceCall).toBe('89');
  });

  it('says so when the file is not a backup', async () => {
    const { files } = fakeFiles('{"hello": 1}');
    await render(<BackupScreen files={files} />, { wrapper: wrap });
    await fireEvent.press(screen.getByTestId('backup-pick'));
    await settle();
    expect(screen.getByTestId('backup-note')).toHaveTextContent("That file isn't a backup from this app.");
    expect(screen.queryByTestId('backup-preview')).toBeNull();
  });

  it('does nothing when the picker is backed out of', async () => {
    const { files } = fakeFiles(null);
    await render(<BackupScreen files={files} />, { wrapper: wrap });
    await fireEvent.press(screen.getByTestId('backup-pick'));
    await settle();
    expect(screen.queryByTestId('backup-note')).toBeNull();
  });

  it('opens from the top of Jobs', async () => {
    const app = await renderApp('/jobs');
    await fireEvent.press(screen.getByTestId('open-backup'));
    expect(app.getPathname()).toBe('/backup');
    await fireEvent.press(screen.getByTestId('backup-page-close'));
    expect(app.getPathname()).toBe('/jobs');
  });
});
