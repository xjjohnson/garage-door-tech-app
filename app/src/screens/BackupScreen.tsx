import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SectionTitle } from '../components/controls';
import { Backup, backupFileName, LAST_BACKUP_KEY, makeBackup, mergeJobs, parseBackup } from '../lib/backup';
import { BackupFiles, deviceBackupFiles } from '../lib/backupFiles';
import { formatJobDate } from '../lib/jobs';
import { useCustomers } from '../lib/useCustomers';
import { useFollowUps } from '../lib/useFollowUps';
import { useSchedule } from '../lib/useSchedule';
import { useWorkLog } from '../lib/useWorkLog';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { usePriceSheet } from '../lib/usePriceSheet';
import { colors, touch, type } from '../theme';

interface Props {
  /** The phone's folder and file pickers; tests pass a fake. */
  files?: BackupFiles | null;
  now?: () => number;
}

type Note = { kind: 'ok' | 'error'; text: string } | null;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Saves every job, customer and the price sheet to one file in a folder the tech picks
 * (Downloads, Google Drive...), and reads one back. Restoring merges: nothing
 * on the phone is deleted, and a job on both keeps whichever copy changed
 * last. The price sheet is replaced by the backup's.
 */
export function BackupScreen({ files: given, now = Date.now }: Props) {
  const files = useMemo(() => (given === undefined ? deviceBackupFiles() : given), [given]);
  const { jobs, restore } = useJobs();
  const { customers, restore: restoreCustomers } = useCustomers();
  const { invoices, business, restore: restoreInvoices } = useInvoices();
  const { settings: followUpSettings, dismissed, restore: restoreFollowUps } = useFollowUps();
  const { appointments, restore: restoreSchedule } = useSchedule();
  const { shifts, centsPerMile, restore: restoreWorkLog } = useWorkLog();
  const { sheet, update } = usePriceSheet();
  const [lastBackup, setLastBackup] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [pending, setPending] = useState<Backup | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(LAST_BACKUP_KEY)
      .then((v) => {
        const n = v ? Number(v) : NaN;
        if (Number.isFinite(n)) setLastBackup(n);
      })
      .catch(() => undefined);
  }, []);

  const save = async () => {
    if (!files || busy) return;
    setBusy(true);
    setNote(null);
    setPending(null);
    try {
      const at = now();
      const name = backupFileName(at);
      const folder = await files.save(name, makeBackup({ jobs, customers, invoices, business, followUps: { settings: followUpSettings, dismissed }, appointments, workLog: { shifts, centsPerMile }, priceSheet: sheet }, at, Constants.expoConfig?.version));
      if (folder !== null) {
        setLastBackup(at);
        AsyncStorage.setItem(LAST_BACKUP_KEY, String(at)).catch(() => undefined);
        setNote({ kind: 'ok', text: `Saved ${name} to ${folder}: ${plural(jobs.length, 'job')}, ${plural(customers.length, 'customer')}, ${plural(invoices.length, 'invoice')} and your prices.` });
      }
    } catch {
      setNote({ kind: 'error', text: "Couldn't save the backup there. Try another folder, such as Downloads." });
    } finally {
      setBusy(false);
    }
  };

  const pick = async () => {
    if (!files || busy) return;
    setBusy(true);
    setNote(null);
    setPending(null);
    try {
      const raw = await files.pick();
      if (raw !== null) {
        const parsed = parseBackup(raw);
        if (parsed.ok) setPending(parsed.backup);
        else setNote({ kind: 'error', text: parsed.reason });
      }
    } catch {
      setNote({ kind: 'error', text: "Couldn't read that file." });
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!pending) return;
    restoreCustomers(pending.customers);
    restoreInvoices(pending.invoices, pending.business);
    if (pending.followUps) restoreFollowUps(pending.followUps);
    if (pending.appointments.length > 0) restoreSchedule(pending.appointments);
    if (pending.workLog) restoreWorkLog(pending.workLog);
    const { added, updated } = restore(pending.jobs);
    if (pending.priceSheet) {
      const restored = pending.priceSheet;
      update(() => restored);
    }
    setPending(null);
    const parts = [`${plural(added, 'job')} added`, `${plural(updated, 'job')} updated`];
    if (pending.invoices.length > 0) parts.push(plural(pending.invoices.length, 'invoice'));
    if (pending.appointments.length > 0) parts.push(plural(pending.appointments.length, 'visit'));
    if (pending.priceSheet) parts.push('price sheet restored');
    setNote({ kind: 'ok', text: `Restored: ${parts.join(', ')}.` });
  };

  const preview = pending ? mergeJobs(jobs, pending.jobs) : null;

  return (
    <View style={styles.stack} testID="backup">
      <Text style={styles.note}>
        Jobs, customers, invoices and prices live only on this phone. A backup puts them in one file somewhere else, so a new phone or a reinstall doesn't lose them.
      </Text>

      {files === null ? (
        <Text style={styles.note} testID="backup-unavailable">
          Backups need the phone app.
        </Text>
      ) : null}

      <SectionTitle first>Back up</SectionTitle>
      <Text style={styles.detail} testID="backup-last">
        {lastBackup ? `Last backup: ${formatJobDate(lastBackup)}` : 'No backup yet.'}
      </Text>
      <Text style={styles.note}>Pick a folder: Downloads, or Google Drive to keep it off the phone.</Text>
      <Button label={`Save backup (${plural(jobs.length, 'job')})`} onPress={save} disabled={!files || busy} primary testID="backup-save" />

      <SectionTitle>Restore</SectionTitle>
      <Text style={styles.note}>Nothing on this phone is deleted. A job on both keeps whichever copy was changed last.</Text>
      <Button label="Restore from a backup" onPress={pick} disabled={!files || busy} testID="backup-pick" />

      {pending && preview ? (
        <View style={styles.card} testID="backup-preview">
          <Text style={styles.cardTitle}>Backup from {pending.exportedAt ? formatJobDate(pending.exportedAt) : 'an unknown day'}</Text>
          <Text style={styles.detail}>
            {plural(pending.jobs.length, 'job')}: {preview.added} new to this phone, {preview.updated} newer than this phone's copy.
          </Text>
          {pending.priceSheet ? <Text style={styles.detail}>The price sheet on this phone will be replaced by the backup's.</Text> : null}
          <Button label="Restore" onPress={confirm} primary testID="backup-confirm" />
          <Button label="Cancel" onPress={() => setPending(null)} testID="backup-cancel" />
        </View>
      ) : null}

      {note ? (
        <Text style={[styles.result, note.kind === 'error' && styles.error]} testID="backup-note" accessibilityLiveRegion="polite">
          {note.text}
        </Text>
      ) : null}
    </View>
  );
}

function Button({ label, onPress, disabled, primary, testID }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; testID: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={({ pressed }) => [styles.button, primary && styles.primary, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={[styles.buttonText, primary && styles.primaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  detail: { fontSize: type.body, color: colors.text, lineHeight: 24 },
  card: { padding: 12, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card, gap: 10 },
  cardTitle: { fontSize: type.value, fontWeight: '900', color: colors.text },
  result: { fontSize: type.body, fontWeight: '800', color: colors.text, padding: 12, borderRadius: 10, backgroundColor: colors.info },
  error: { color: colors.onStop, backgroundColor: colors.stop },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected },
  disabled: { opacity: 0.4 },
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  primaryText: { color: colors.onSelected },
});
