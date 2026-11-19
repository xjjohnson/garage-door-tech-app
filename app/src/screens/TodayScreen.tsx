import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Action } from '../components/Buttons';
import { StepChips } from '../components/StepChips';
import { CrewToday } from '../components/CrewToday';
import { ChipTone, VisitCard } from '../components/VisitCard';
import { lastCrash } from '../lib/crash';
import { jobName } from '../lib/jobs';
import { startOfDay } from '../lib/schedule';
import { jobSteps, nextStep, STEP_LABEL } from '../lib/jobSteps';
import { log } from '../lib/log';
import { canSendJobs, cleanNotes, olderJobs } from '../lib/odooJobs';
import { describePending } from '../lib/pending';
import { Appointment, formatTime, onDay, windowLabel } from '../lib/schedule';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { useLog } from '../lib/useLog';
import { useOdoo } from '../lib/useOdoo';
import { useJobsSince } from '../lib/useJobsSince';
import { usePending } from '../lib/usePending';
import { useVisits } from '../lib/useVisits';
import { useGeocode } from '../lib/useGeocode';
import { useWorkLog } from '../lib/useWorkLog';
import { formatMoney } from '../lib/prices';
import { shiftMs } from '../lib/worklog';
import { useStartJob } from '../lib/useStartJob';
import { useWeather } from '../lib/useWeather';
import { hoursFor, summarize, Summary, weatherKey, weatherText } from '../lib/weather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SHORT_VERSION } from '../lib/appVersion';
import { followUps } from '../lib/followups';
import { balance, invoiceLabel, invoiceStatus, sortInvoices } from '../lib/invoices';
import { useFollowUps } from '../lib/useFollowUps';
import { useStats } from '../lib/useStats';
import { IconRow, RowGroup } from '../components/ToolRows';
import { rowGap } from '../components/VisitCard';
import { colors, layouts, radius, shadow, bw, fs, rad, sz, sp } from '../theme';

const CRASH_SEEN_KEY = 'crash/seen';

/**
 * Today (the approved 0.9 screen): one card per visit of the day, in time
 * order, each with its status (Done, On the way, Working, Scheduled), the
 * customer, the address, what the work is and the weather there. The next
 * visit has an accent outline. Notices (not in Odoo yet, older jobs, an app
 * error) show only when there is something to say. Sync now is in the header.
 */
export function TodayScreen({ now = Date.now }: { now?: () => number }) {
  const appointments = useVisits();
  const { jobs } = useJobs();
  const { invoices } = useInvoices();
  const startJob = useStartJob();
  const t = now();

  const today = useMemo(() => onDay(appointments, t).filter((a) => a.status !== 'cancelled'), [appointments, t]);
  const next = today.find((a) => a.status === 'booked' && a.start + a.minutes * 60000 > t);
  // Jobs started on the phone with no visit today still belong on the list.
  const loose = jobs.filter((j) => j.status === 'open' && (j.steps?.onMyWayAt || j.steps?.arrivedAt) && !today.some((a) => a.jobId === j.id));
  const booked = today.filter((a) => a.status === 'booked');

  // Weather for each stop, when there's signal and the address is on the map. Nothing shows otherwise.
  const { points } = useGeocode(useMemo(() => today.map((a) => a.address), [today]));
  const hours = useWeather(useMemo(() => Object.values(points).filter((p): p is NonNullable<typeof p> => !!p), [points]));
  const weatherOf = (a: Appointment): Summary | null => {
    const p = points[a.address.trim()];
    return p ? summarize(hoursFor(hours[weatherKey(p)] ?? [], a.start, a.minutes)) : null;
  };
  // The day so far: visits finished, money taken, time on the clock.
  const { shifts } = useWorkLog();
  const day = startOfDay(t);
  const isToday = (ms: number) => ms >= day && ms < day + 86_400_000;
  const doneCount = today.filter((a) => a.status === 'done' || (a.jobId && jobs.find((j) => j.id === a.jobId)?.status === 'done')).length;
  const collected = invoices.filter((i) => !i.voidedAt).reduce((n, i) => n + i.payments.filter((p) => isToday(p.at)).reduce((m, p) => m + p.amount, 0), 0);
  const clockMs = shifts.filter((s) => isToday(s.start)).reduce((n, s) => n + shiftMs(s, t), 0);
  const worst = booked.map(weatherOf).filter((w): w is Summary => !!w && w.warn)[0];

  // On my way, Arrived, Work done, Paid, from what is saved on the visit's job and its invoice.
  const stepsDone = (a: Appointment): boolean[] => {
    const job = a.jobId ? jobs.find((j) => j.id === a.jobId) : undefined;
    if (!job) return [false, false, a.status === 'done', false];
    const steps = jobSteps(job, invoices);
    return [!!steps.find((x) => x.id === 'onMyWay')?.done, !!steps.find((x) => x.id === 'arrived')?.done, !!steps.find((x) => x.id === 'work')?.done, !!steps.find((x) => x.id === 'paid')?.done];
  };

  const statusOf = (a: Appointment): { label: string; tone: ChipTone } => {
    const job = a.jobId ? jobs.find((j) => j.id === a.jobId) : undefined;
    if (a.status === 'done' || job?.status === 'done') return { label: 'Done', tone: 'plain' };
    if (job?.steps?.arrivedAt) return { label: 'Working', tone: 'on' };
    if (job?.steps?.onMyWayAt) return { label: 'On the way', tone: 'on' };
    return { label: 'Scheduled', tone: 'plain' };
  };

  const home = layouts.home;
  const rows = layouts.visitRows;
  const lean = home === 'simple';
  const field = home === 'field';
  const owedNow = invoices.filter((i) => !i.voidedAt && ['unpaid', 'partial'].includes(invoiceStatus(i)));
  return (
    <View style={[styles.stack, { gap: rowGap(rows) }]} testID="today">
      <SyncLine />
      <OlderJobsLine />
      <CrashNotice />
      {home === 'field' && next ? <NextCard visit={next} /> : null}
      {home === 'owner' ? <OwnerKpis now={now} done={doneCount} total={today.length} /> : null}
      {home === 'owner' ? <CrewToday now={now} /> : null}
      {home === 'inbox' ? <Inbox now={now} /> : null}
      {today.length > 0 && !lean && !field && home !== 'owner' ? (
        <View style={styles.kpis} testID="today-kpis">
          <Kpi value={`${doneCount} / ${today.length}`} label="Visits done" testID="today-kpi-done" />
          <Kpi value={formatMoney(collected)} label="Collected" testID="today-kpi-collected" />
          <Kpi value={`${Math.floor(clockMs / 3_600_000)}.${Math.floor(((clockMs % 3_600_000) / 3_600_000) * 10)} h`} label="On the clock" testID="today-kpi-clock" />
        </View>
      ) : null}
      {lean ? null : <Text style={field ? styles.sectionHead : styles.count} testID="today-count">
        {today.length === 0 ? 'Nothing booked today' : field ? `TODAY · ${today.length} STOP${today.length === 1 ? '' : 'S'}` : `${today.length} visit${today.length === 1 ? '' : 's'} today${today.length > booked.length ? ` · ${today.length - booked.length} done` : ''}`}
      </Text>}

      {worst && !lean ? (
        <Text style={styles.weatherDay} testID="today-weather-day">
          Heads up: {worst.label.toLowerCase()} on today's route
        </Text>
      ) : null}

      {today.map((a) => {
        const st = statusOf(a);
        const w = weatherOf(a);
        const isNext = a === next;
        return (
          <VisitCard
            key={a.id}
            variant={rows}
            top={windowLabel(a).toUpperCase()}
            chip={st.label}
            tone={st.tone}
            name={a.name}
            address={a.address}
            what={a.what ? cleanNotes(a.what).split('\n')[0] : ''}
            weather={w ? weatherText(w) : undefined}
            weatherTestID={`weather-${a.id}`}
            warn={!!w?.warn}
            next={isNext}
            muted={st.label === 'Done'}
            onPress={() => startJob(a)}
            testID={isNext ? 'today-next' : `today-visit-${a.id}`}
          >
            {isNext || st.tone === 'on' ? <StepChips done={stepsDone(a)} testID={`today-steps-${a.id}`} /> : null}
          </VisitCard>
        );
      })}

      {loose.map((j) => {
        const st = nextStep(jobSteps(j, invoices));
        return (
          <VisitCard
            key={j.id}
            variant={rows}
            top="Started"
            chip={j.steps?.arrivedAt ? 'Working' : 'On the way'}
            tone="on"
            name={jobName(j)}
            address={j.customer ? j.address : ''}
            what={[j.what ? cleanNotes(j.what).split('\n')[0] : '', st ? `Next: ${STEP_LABEL[st.id]}` : 'Finished'].filter(Boolean).join(' · ')}
            onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })}
            testID={`today-job-${j.id}`}
          />
        );
      })}

      {today.length === 0 && loose.length === 0 ? <Action label="Open the schedule" onPress={() => router.push('/schedule')} testID="today-schedule" /> : null}
      {lean ? <Action label="+ New job" primary onPress={() => router.push('/new-job')} testID="today-new-job" /> : null}
      {field && owedNow.length > 0 ? (
        <View style={styles.stack} testID="today-needs-you">
          <Text style={styles.sectionHead}>NEEDS YOU · {owedNow.length} UNPAID</Text>
          {owedNow.slice(0, 3).map((i) => (
            <VisitCard key={i.id} variant="edge" top={invoiceLabel(i)} chip="Unpaid" tone="warn" name={i.billTo || i.address || 'Customer'} address="" what={`${formatMoney(balance(i))} owed`} onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: i.id } })} testID={`today-owed-${i.id}`} />
          ))}
        </View>
      ) : null}
      {field ? null : <Action label="Wrap up the day" onPress={() => router.push('/end-of-day')} testID="today-wrap-up" />}
      {field ? <Action label="Wrap up the day" onPress={() => router.push('/end-of-day')} testID="today-wrap-up" /> : null}
      <Text style={styles.version} testID="home-version">
        Johnsons {SHORT_VERSION}
      </Text>
    </View>
  );
}

/** Field Home: the next visit big, with the one action a tech wants as they head out. */
function NextCard({ visit }: { visit: Appointment }) {
  return (
    <View style={styles.nextCard} testID="today-next-card">
      <Text style={styles.nextTop}>NEXT · {windowLabel(visit).toUpperCase()}</Text>
      <Text style={styles.nextName}>{visit.name}</Text>
      {visit.address ? <Text style={styles.nextSub}>{visit.address}</Text> : null}
      {visit.what ? <Text style={styles.nextSub}>{cleanNotes(visit.what).split('\n')[0]}</Text> : null}
    </View>
  );
}

function OwnerKpis({ now, done, total }: { now: () => number; done: number; total: number }) {
  const { stats } = useStats(now);
  const days = stats.days ?? [];
  const top = Math.max(1, ...days.map((d) => d.collected));
  return (
    <View style={styles.stack} testID="today-owner-kpis">
      <View style={styles.kpis}>
        <Kpi value={formatMoney(stats.owed)} label="Owed to you" testID="today-owner-owed" />
        <Kpi value={formatMoney(stats.week.collected)} label="Collected this week" testID="today-owner-week" />
      </View>
      {days.length > 0 ? (
        <View style={styles.chart} testID="today-owner-chart" accessibilityLabel="Money collected in the last seven days">
          <Text style={styles.sectionHead}>COLLECTED, LAST 7 DAYS</Text>
          <View style={styles.bars}>
            {days.map((d) => (
              <View key={d.start} style={styles.barCol}>
                <View style={[styles.bar, { height: Math.max(3, Math.round((d.collected / top) * 70)) }]} />
                <Text style={styles.barDay}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(d.start).getDay()]}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.kpis}>
        <Kpi value={String(stats.openJobs)} label="Open jobs" testID="today-owner-open" />
        <Kpi value={String(stats.owedInvoices)} label="Unpaid" testID="today-owner-unpaid" />
        <Kpi value={`${done} / ${total}`} label="Visits done" testID="today-owner-done" />
      </View>
    </View>
  );
}

/** Office Home: what is waiting on you, with one tap to each. */
function Inbox({ now }: { now: () => number }) {
  const { invoices, business } = useInvoices();
  const { settings, dismissed } = useFollowUps();
  const t = now();
  const owed = sortInvoices(invoices.filter((i) => ['unpaid', 'partial'].includes(invoiceStatus(i)))).slice(0, 5);
  const due = followUps(invoices, settings, business, t, dismissed).filter((f) => f.due <= t + 7 * 24 * 3600 * 1000).length;
  if (owed.length === 0 && due === 0) return null;
  return (
    <View style={styles.stack} testID="today-inbox">
      <Text style={styles.count}>Waiting on you</Text>
      <RowGroup>
        {due > 0 ? <IconRow icon="wrap" label={`${due} follow-up${due === 1 ? '' : 's'} due`} detail="Invoice and quote reminders" onPress={() => router.push('/follow-ups')} testID="today-inbox-followups" last={owed.length === 0} /> : null}
        {owed.map((i, k) => (
          <IconRow key={i.id} icon="warn" warn label={`${invoiceLabel(i)} · ${i.billTo || i.address || 'Customer'}`} detail={`${formatMoney(balance(i))} owed`} onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: i.id } })} testID={`today-inbox-${i.id}`} last={k === owed.length - 1} />
        ))}
      </RowGroup>
    </View>
  );
}

function Kpi({ value, label, testID }: { value: string; label: string; testID: string }) {
  return (
    <View style={styles.kpi} testID={testID}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
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
  if (pending.total === 0) return null;
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
  nextCard: { gap: sp(4), padding: sp(14), borderRadius: radius.card, borderWidth: bw(1.5), borderColor: colors.selected, backgroundColor: colors.card },
  nextTop: { fontSize: fs(13), fontWeight: '800', letterSpacing: 0.6, color: colors.muted },
  nextName: { fontSize: fs(24), fontWeight: '800', color: colors.text },
  nextSub: { fontSize: fs(16), fontWeight: '600', color: colors.muted },
  stack: { gap: sp(12) },
  row: { flexDirection: 'row', gap: sp(10), alignItems: 'center' },
  kpis: { flexDirection: 'row', gap: sp(8) },
  kpi: { flex: 1, backgroundColor: colors.card, borderRadius: radius.card - 2, borderWidth: bw(1), borderColor: colors.line, paddingVertical: sp(11), alignItems: 'center', ...shadow },
  kpiValue: { fontSize: fs(19), fontWeight: '800', color: colors.text },
  kpiLabel: { fontSize: fs(12.5), fontWeight: '600', color: colors.muted },
  version: { fontSize: fs(12), color: colors.muted, textAlign: 'center', paddingVertical: sp(8) },
  chart: { padding: sp(12), gap: sp(8), borderRadius: radius.card, borderWidth: bw(1), borderColor: colors.line, backgroundColor: colors.card },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: sp(6), height: 90 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: sp(2) },
  bar: { width: '100%', borderRadius: rad(3), backgroundColor: colors.selected },
  barDay: { fontSize: fs(11), fontWeight: '700', color: colors.muted },
  sectionHead: { fontSize: fs(13), fontWeight: '800', letterSpacing: 0.6, color: colors.muted },
  count: { fontSize: fs(16), fontWeight: '700', color: colors.muted },
  weatherDay: { fontSize: fs(16), fontWeight: '800', color: colors.stop },
  pressed: { backgroundColor: colors.info },
  sync: { fontSize: fs(15), fontWeight: '800', color: colors.muted },
  syncPill: { minHeight: sz(44), justifyContent: 'center', paddingHorizontal: sp(12), borderRadius: rad(14), backgroundColor: colors.card },
  syncWarn: { backgroundColor: colors.warnBg },
  crash: { borderWidth: bw(1.5), borderColor: colors.stop, borderRadius: rad(12), padding: sp(12), gap: sp(10) },
  crashText: { fontSize: fs(17), fontWeight: '800', color: colors.text },
});
