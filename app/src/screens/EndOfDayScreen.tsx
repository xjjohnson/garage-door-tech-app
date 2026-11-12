import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Action } from '../components/Buttons';
import { SectionTitle } from '../components/controls';
import { appMoney, ClosedDay, DAY_CLOSE_STORAGE_KEY, daySummary, dayText, parseClosedDays } from '../lib/endOfDay';
import { log } from '../lib/log';
import { formatMoney } from '../lib/prices';
import { formatTime } from '../lib/schedule';
import { unsyncedItems } from '../lib/stock';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';
import { usePending } from '../lib/usePending';
import { useSchedule } from '../lib/useSchedule';
import { useStock } from '../lib/useStock';
import { useWorkLog } from '../lib/useWorkLog';
import { formatHours } from '../lib/worklog';
import { colors, touch, type } from '../theme';

/**
 * Wrap up the day: jobs done, money by how it was paid (cash and checks to
 * deposit), what's still owed, hours and miles, and what to finish first.
 * Closing the day syncs the truck with Odoo, clocks out and keeps a summary.
 */
export function EndOfDayScreen({ now = Date.now }: { now?: () => number }) {
  const { jobs } = useJobs();
  const { invoices, business } = useInvoices();
  const { appointments } = useSchedule();
  const work = useWorkLog();
  const stock = useStock();
  const { client } = useOdoo();
  const pending = usePending();
  const [closed, setClosed] = useState<ClosedDay[]>([]);
  const [odometer, setOdometer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = now();
  const s = daySummary({ jobs, invoices, shifts: work.shifts, appointments, stock }, t);
  const closedToday = closed.find((c) => c.day === s.day);
  const notSent = pending.total + unsyncedItems(stock).length;

  useEffect(() => {
    AsyncStorage.getItem(DAY_CLOSE_STORAGE_KEY)
      .then((raw) => setClosed(parseClosedDays(raw)))
      .catch(() => undefined);
  }, []);

  const close = async () => {
    setBusy(true);
    setError(null);
    if (client) {
      try {
        await stock.sync(client);
      } catch (e) {
        setError(`Truck didn't sync: ${e instanceof Error ? e.message : String(e)}. The day still closed; sync from Truck stock later.`);
      }
    }
    const odo = Number.parseInt(odometer, 10);
    if (s.onClock) work.clockOut(Number.isFinite(odo) && odo > 0 ? odo : undefined);
    const entry: ClosedDay = { day: s.day, at: now(), text: dayText(s, business.name) };
    const next = [...closed.filter((c) => c.day !== s.day), entry].slice(-90);
    setClosed(next);
    AsyncStorage.setItem(DAY_CLOSE_STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
    log.info('day', `closed: ${s.jobsDone}/${s.jobs} jobs, ${formatMoney(s.taken)} taken`);
    setBusy(false);
  };

  const date = new Date(s.day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <View style={styles.stack} testID="end-of-day">
      <Text style={styles.sub} testID="eod-jobs">
        {date} · {s.jobs === 0 ? 'no jobs today' : `${s.jobsDone} of ${s.jobs} job${s.jobs === 1 ? '' : 's'} done`}
      </Text>
      <View style={styles.tiles}>
        <Tile big={formatMoney(s.billed)} label="Billed" testID="eod-billed" />
        <Tile big={formatHours(s.ms)} label="On the clock" testID="eod-hours" />
        <Tile big={`${s.miles} mi`} label="Driven" testID="eod-miles" />
      </View>

      <SectionTitle>Money taken</SectionTitle>
      <View>
        <Line label="Cash · to deposit" value={formatMoney(s.byMethod.cash)} testID="eod-cash" />
        <Line label={`Checks${s.checks ? ` · ${s.checks} to deposit` : ''}`} value={formatMoney(s.byMethod.check)} testID="eod-checks" />
        <Line label="Zelle / Venmo / Cash App" value={formatMoney(appMoney(s))} testID="eod-apps" />
        <Line label="Still owed" value={formatMoney(s.owed)} warn={s.owed > 0} testID="eod-owed" last />
      </View>

      <SectionTitle>Before you close</SectionTitle>
      <View style={styles.checks}>
        {s.inspections > 0 ? <Check done={s.inspectionsDone >= s.inspections} label={`Inspections finished · ${s.inspectionsDone} of ${s.inspections}`} testID="eod-inspections" /> : null}
        <Check done={notSent === 0} label={notSent === 0 ? 'Everything is in Odoo' : `${notSent} change${notSent === 1 ? '' : 's'} not sent to Odoo yet`} onPress={notSent ? () => router.push('/developer') : undefined} testID="eod-pending" />
        <Check
          done={s.toOrder === 0}
          label={s.toOrder === 0 ? `Truck stocked${s.partsUsed ? ` · ${s.partsUsed} part${s.partsUsed === 1 ? '' : 's'} used today` : ''}` : `Restock list ready · ${s.toOrder} item${s.toOrder === 1 ? '' : 's'}`}
          onPress={() => router.push('/stock')}
          testID="eod-restock"
        />
        {s.onClock ? <Check done={false} label="Still on the clock: closing clocks you out" testID="eod-clock" /> : null}
      </View>
      {s.onClock && !closedToday ? (
        <View style={styles.field}>
          <Text style={styles.label}>Odometer now (optional)</Text>
          <TextInput value={odometer} onChangeText={(v) => setOdometer(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="For the miles" placeholderTextColor={colors.muted} accessibilityLabel="Odometer now" testID="eod-odometer" style={styles.input} />
        </View>
      ) : null}

      {error ? (
        <Text style={styles.error} testID="eod-error">
          {error}
        </Text>
      ) : null}
      {closedToday ? (
        <View style={styles.closed} testID="eod-closed">
          <Text style={styles.closedText}>Day closed at {formatTime(closedToday.at)}</Text>
          <Action label="Share the summary" onPress={() => Share.share({ message: closedToday.text }).catch(() => undefined)} testID="eod-share" />
          <Action label="Close it again with the latest numbers" onPress={() => !busy && close()} testID="eod-reclose" />
        </View>
      ) : (
        <Action label={busy ? 'Closing…' : client ? 'Sync and close the day' : 'Close the day'} primary onPress={() => !busy && close()} testID="eod-close" />
      )}
    </View>
  );
}

function Tile({ big, label, testID }: { big: string; label: string; testID: string }) {
  return (
    <View style={styles.tile} testID={testID}>
      <Text style={styles.tileBig}>{big}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function Line({ label, value, warn, last, testID }: { label: string; value: string; warn?: boolean; last?: boolean; testID: string }) {
  return (
    <View style={[styles.line, last && styles.lastLine]} testID={testID}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, warn && styles.warn]}>{value}</Text>
    </View>
  );
}

function Check({ done, label, onPress, testID }: { done: boolean; label: string; onPress?: () => void; testID: string }) {
  const body = (
    <>
      <View style={[styles.box, done && styles.boxDone]}>{done ? <Text style={styles.tick}>✓</Text> : null}</View>
      <Text style={styles.checkText}>{label}</Text>
    </>
  );
  if (!onPress)
    return (
      <View style={styles.check} testID={testID} accessibilityLabel={`${done ? 'Done' : 'To do'}: ${label}`}>
        {body}
      </View>
    );
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${done ? 'Done' : 'To do'}: ${label}`} testID={testID} style={({ pressed }) => [styles.check, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  sub: { fontSize: 17, fontWeight: '700', color: colors.muted },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 10, gap: 2 },
  tileBig: { fontSize: 21, fontWeight: '900', color: colors.text },
  tileLabel: { fontSize: 14, fontWeight: '800', color: colors.muted },
  line: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottomWidth: 2, borderBottomColor: colors.info },
  lastLine: { borderBottomWidth: 0 },
  lineLabel: { flex: 1, fontSize: type.body, fontWeight: '800', color: colors.text },
  lineValue: { fontSize: type.body, fontWeight: '900', color: colors.text },
  warn: { backgroundColor: colors.safety, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  checks: { gap: 4 },
  check: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: { width: 28, height: 28, borderRadius: 6, borderWidth: 3, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  boxDone: { backgroundColor: colors.brand, borderColor: colors.brand },
  tick: { color: colors.onSelected, fontSize: 17, fontWeight: '900' },
  checkText: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  pressed: { backgroundColor: colors.safety },
  field: { gap: 4 },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  input: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text },
  error: { fontSize: 16, fontWeight: '800', color: colors.stop },
  closed: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.card },
  closedText: { fontSize: type.body, fontWeight: '900', color: colors.ok },
});
