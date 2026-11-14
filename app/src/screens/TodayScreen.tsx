import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Action } from '../components/Buttons';
import { lastCrash } from '../lib/crash';
import { followUps } from '../lib/followups';
import { balance, invoiceStatus } from '../lib/invoices';
import { jobName } from '../lib/jobs';
import { jobSteps, nextStep, STEP_LABEL } from '../lib/jobSteps';
import { log } from '../lib/log';
import { canSendJobs, olderJobs } from '../lib/odooJobs';
import { describePending } from '../lib/pending';
import { formatMoney } from '../lib/prices';
import { Appointment, formatTime, mapsLink, onDay } from '../lib/schedule';
import { useFollowUps } from '../lib/useFollowUps';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { useLog } from '../lib/useLog';
import { useOdoo } from '../lib/useOdoo';
import { useJobsSince } from '../lib/useJobsSince';
import { usePending } from '../lib/usePending';
import { useSchedule } from '../lib/useSchedule';
import { useStartJob } from '../lib/useStartJob';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, touch, type } from '../theme';

const CRASH_SEEN_KEY = 'crash/seen';

/**
 * Today: the next visit with what to do about it, the rest of the day, jobs
 * under way, and what needs the tech (money owed, follow-ups). The line at
 * the top says whether everything is in Odoo.
 */
export function TodayScreen({ now = Date.now }: { now?: () => number }) {
  const { appointments } = useSchedule();
  const { jobs } = useJobs();
  const { invoices, business } = useInvoices();
  const { settings, dismissed } = useFollowUps();
  const startJob = useStartJob();
  const t = now();

  const today = useMemo(() => onDay(appointments, t).filter((a) => a.status === 'booked'), [appointments, t]);
  const left = today.filter((a) => a.start + a.minutes * 60000 > t);
  const next = left[0];
  const later = left.slice(1);
  const underway = jobs.filter((j) => j.status === 'open' && (j.steps?.onMyWayAt || j.steps?.arrivedAt) && !(next?.jobId === j.id));
  const owed = invoices.filter((i) => ['unpaid', 'partial'].includes(invoiceStatus(i)));
  const owedTotal = owed.reduce((n, i) => n + balance(i), 0);
  const due = followUps(invoices, settings, business, t, dismissed).filter((f) => f.due <= t).length;

  return (
    <View style={styles.stack} testID="today">
      <SyncLine />
      <OlderJobsLine />
      <CrashNotice />
      <View style={styles.row}>
        <Text style={[styles.count, styles.grow]} testID="today-count">
          {today.length === 0 ? 'Nothing booked today' : `${today.length} visit${today.length === 1 ? '' : 's'} today`}
        </Text>
        <Action label="+ New job" primary onPress={() => router.push('/new-job')} testID="today-new-job" />
      </View>

      {next ? <NextCard a={next} onStart={() => startJob(next)} jobHasStarted={!!jobs.find((j) => j.id === next.jobId)?.steps?.arrivedAt} /> : null}

      {underway.length > 0 ? (
        <View style={styles.list}>
          <Text style={styles.h2}>Under way</Text>
          {underway.map((j) => {
            const st = nextStep(jobSteps(j, invoices));
            return (
              <Pressable key={j.id} onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })} accessibilityRole="button" testID={`today-job-${j.id}`} style={({ pressed }) => [styles.line, pressed && styles.pressed]}>
                <View style={styles.grow}>
                  <Text style={styles.lineTitle}>{jobName(j)}{j.what ? ` · ${j.what}` : ''}</Text>
                  <Text style={styles.lineSub}>{st ? `Next: ${STEP_LABEL[st.id]}` : 'Finished'}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {later.length > 0 ? (
        <View style={styles.list}>
          <Text style={styles.h2}>Later today</Text>
          {later.map((a) => (
            <Pressable key={a.id} onPress={() => startJob(a)} accessibilityRole="button" testID={`today-visit-${a.id}`} style={({ pressed }) => [styles.line, pressed && styles.pressed]}>
              <Text style={styles.time}>{formatTime(a.start)}</Text>
              <View style={styles.grow}>
                <Text style={styles.lineTitle}>{a.name}{a.what ? ` · ${a.what}` : ''}</Text>
                {a.address ? <Text style={styles.lineSub}>{a.address}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {today.length === 0 ? (
        <Action label="Open the schedule" onPress={() => router.push('/schedule')} testID="today-schedule" />
      ) : null}

      <View style={styles.tiles}>
        <Tile big={formatMoney(owedTotal)} label={owed.length ? `Owed · ${owed.length} invoice${owed.length === 1 ? '' : 's'}` : 'Nothing owed'} warn={owed.length > 0} onPress={() => router.navigate('/sales')} testID="today-owed" />
        <Tile big={String(due)} label={due === 1 ? 'Follow-up due' : 'Follow-ups due'} onPress={() => router.push('/follow-ups')} testID="today-followups" />
      </View>
      <Action label="Wrap up the day" onPress={() => router.push('/end-of-day')} testID="today-wrap-up" />
    </View>
  );
}

function NextCard({ a, onStart, jobHasStarted }: { a: Appointment; onStart: () => void; jobHasStarted: boolean }) {
  const maps = mapsLink(a.address);
  return (
    <View style={styles.next} testID="today-next">
      <Text style={styles.nextBand}>NEXT · {formatTime(a.start).toUpperCase()}</Text>
      <View style={styles.nextBody}>
        <Text style={styles.nextTitle}>
          {a.name}
          {a.what ? ` · ${a.what}` : ''}
        </Text>
        {a.address ? <Text style={styles.nextSub}>{a.address}</Text> : null}
      </View>
      <View style={[styles.row, styles.nextButtons]}>
        {maps ? <Action label="Navigate" grow onPress={() => Linking.openURL(maps).catch(() => undefined)} testID="today-navigate" /> : null}
        <Action label={jobHasStarted || a.jobId ? 'Open job' : 'Start job'} primary grow onPress={onStart} testID="today-start" />
      </View>
    </View>
  );
}

function Tile({ big, label, onPress, warn, testID }: { big: string; label: string; onPress: () => void; warn?: boolean; testID: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.tile, warn && styles.tileWarn, pressed && styles.pressed]}>
      <Text style={styles.tileBig}>{big}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </Pressable>
  );
}

/** What's in Odoo (customers, quotes, invoices; jobs aren't sent yet), what's still waiting to send, or how to connect. */
export function SyncLine() {
  const { status, client } = useOdoo();
  const pending = usePending();
  if (status === 'loading' || status === 'signingIn') return <Text style={styles.sync}>Connecting to Odoo...</Text>;
  if (status !== 'signedIn' || !client) {
    return (
      <Pressable onPress={() => router.push('/team')} accessibilityRole="button" testID="today-sync" style={({ pressed }) => [styles.syncPill, pressed && styles.pressed]}>
        <Text style={styles.sync}>Not connected to Odoo · sign in</Text>
      </Pressable>
    );
  }
  if (pending.total === 0) {
    return (
      <Text style={[styles.sync, styles.syncOk]} testID="today-sync">
        ✓ Odoo up to date: jobs, visits, customers, quotes and invoices
      </Text>
    );
  }
  return (
    <Pressable onPress={() => router.push('/odoo-waiting')} accessibilityRole="button" accessibilityHint="Shows what's waiting, with Sync now" testID="today-sync" style={({ pressed }) => [styles.syncPill, styles.syncWarn, pressed && styles.pressed]}>
      <Text style={styles.sync}>Not in Odoo yet: {describePending(pending)} · See and sync ›</Text>
    </Pressable>
  );
}

/** Open jobs from before jobs went to Odoo: none are sent until the tech picks them. */
function OlderJobsLine() {
  const { status, client } = useOdoo();
  const { jobs } = useJobs();
  const since = useJobsSince();
  const n = olderJobs(jobs, since).length;
  if (status !== 'signedIn' || !client || !canSendJobs(client) || n === 0) return null;
  return (
    <Pressable onPress={() => router.push('/odoo-older-jobs')} accessibilityRole="button" testID="today-older-jobs" style={({ pressed }) => [styles.syncPill, pressed && styles.pressed]}>
      <Text style={styles.sync}>
        {n} older job{n === 1 ? '' : 's'} not in Odoo · pick which to send
      </Text>
    </Pressable>
  );
}

/** After the app closed on an error: says so once, with a way to send the log. */
function CrashNotice() {
  const entries = useLog();
  const [seen, setSeen] = useState<number | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(CRASH_SEEN_KEY)
      .then((v) => setSeen(Number(v) || 0))
      .catch(() => setSeen(0));
  }, []);
  if (seen === null) return null;
  const crash = lastCrash(entries, seen);
  if (!crash) return null;
  const dismiss = () => {
    setSeen(crash.t);
    AsyncStorage.setItem(CRASH_SEEN_KEY, String(crash.t)).catch(() => undefined);
  };
  return (
    <View style={styles.crash} testID="today-crash">
      <Text style={styles.crashText}>The app hit an error at {formatTime(crash.t)}. It's in the log.</Text>
      <View style={styles.row}>
        <Action
          label="See the log"
          grow
          onPress={() => {
            dismiss();
            router.push('/developer');
          }}
          testID="today-crash-log"
        />
        <Action
          label="OK"
          grow
          onPress={() => {
            log.info('app', 'crash notice dismissed');
            dismiss();
          }}
          testID="today-crash-ok"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  grow: { flex: 1 },
  count: { fontSize: 17, fontWeight: '800', color: colors.muted },
  h2: { fontSize: 19, fontWeight: '900', color: colors.text, marginBottom: 2 },
  list: { gap: 0 },
  line: { minHeight: touch.min + 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 2, borderBottomColor: colors.info },
  time: { width: 76, fontSize: 17, fontWeight: '900', color: colors.text },
  lineTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  lineSub: { fontSize: 15, fontWeight: '600', color: colors.muted },
  chevron: { fontSize: type.big, fontWeight: '900', color: colors.text },
  pressed: { backgroundColor: colors.safety },
  next: { borderWidth: 3, borderColor: colors.border, borderRadius: 16, overflow: 'hidden' },
  nextBand: { backgroundColor: colors.brand, color: colors.onSelected, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, fontWeight: '900', letterSpacing: 0.6 },
  nextBody: { padding: 14, gap: 4 },
  nextTitle: { fontSize: 23, fontWeight: '900', color: colors.text },
  nextSub: { fontSize: 17, fontWeight: '600', color: colors.muted },
  nextButtons: { paddingHorizontal: 14, paddingBottom: 14 },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, borderRadius: 14, backgroundColor: colors.card, padding: 12, gap: 2, minHeight: touch.min },
  tileWarn: { backgroundColor: colors.safety },
  tileBig: { fontSize: 26, fontWeight: '900', color: colors.text },
  tileLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  sync: { fontSize: 15, fontWeight: '800', color: colors.muted },
  syncOk: { color: colors.ok },
  syncPill: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.card },
  syncWarn: { backgroundColor: colors.safety },
  crash: { borderWidth: 3, borderColor: colors.stop, borderRadius: 12, padding: 12, gap: 10 },
  crashText: { fontSize: 17, fontWeight: '800', color: colors.text },
});
