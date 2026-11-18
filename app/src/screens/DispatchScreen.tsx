import { requestSyncNow } from '../lib/syncNow';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Action } from '../components/Buttons';
import { ChipRow } from '../components/controls';
import { Icon } from '../components/Icon';
import { smsLink } from '../lib/jobSteps';
import { OdooClient, OdooError, OdooTask, OdooUser } from '../lib/odoo';
import { doubleBooked, lateJobs } from '../lib/dispatchAlerts';
import { addDays, dayLabel, formatTime, slotsFor, startOfDay } from '../lib/schedule';
import { useInvoices } from '../lib/useInvoices';
import { useOdoo } from '../lib/useOdoo';
import { colors, radius, shadow, touch, type } from '../theme';

/** Whether the signed-in Odoo user may hand out jobs (Field Service Dispatcher or Manager, or an Odoo admin). */
export function useCanDispatch(): boolean {
  const { client } = useOdoo();
  const [can, setCan] = useState(false);
  useEffect(() => {
    let alive = true;
    setCan(false);
    client
      ?.canDispatch()
      .then((v) => alive && setCan(v))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [client]);
  return can;
}

const first = (name: string) => name.trim().split(/\s+/)[0] ?? '';

/** The text the customer gets when the dispatcher taps Assign and text: sent by hand from the phone's messages app. */
export function bookedText(t: Pick<OdooTask, 'customer' | 'name'>, tech: string, start: number, now: number, business: string): string {
  const hi = first(t.customer) ? `Hi ${first(t.customer)}` : 'Hi';
  const day = dayLabel(start, now);
  const when = day === 'Today' || day === 'Tomorrow' ? day.toLowerCase() : `on ${day}`;
  return `${hi}, it's ${business || 'Johnsons'}. ${first(tech) || 'Our tech'} is booked to come ${when} at ${formatTime(start)} for ${t.name}. Reply here if that time doesn't work.`;
}

/** Which part of the board a page draws: all of it (Jobs > Team), or one page of the Dispatch area. */
export type Part = 'all' | 'unassigned' | 'board' | 'notime' | 'late' | 'double' | 'week' | 'upcoming' | 'waiting';

/** The pages that are a plain list of jobs, each with a Change button. */
const LISTS: Part[] = ['notime', 'late', 'double', 'week', 'upcoming', 'waiting'];
const EMPTY: Record<string, string> = {
  notime: 'Every job with a tech has a start time.',
  late: 'No one is running late.',
  double: 'No one is double booked.',
  week: 'Nothing is planned this week.',
  upcoming: 'Nothing is planned in the next two weeks.',
  waiting: 'Every open job has a date.',
};

/** The jobs a list page shows. Late and double booked come from the day's board instead. */
function listFor(client: OdooClient, part: Part, now: number): Promise<OdooTask[]> {
  const today = startOfDay(now);
  if (part === 'notime') return client.jobsWithoutTime();
  if (part === 'waiting') return client.jobsWithoutDate();
  if (part === 'week') return client.jobsPlannedBetween(today, addDays(today, 7));
  if (part === 'upcoming') return client.jobsPlannedBetween(addDays(today, 1), addDays(today, 15));
  return Promise.resolve([]);
}

const SHOWN = 5;
const endOf = (t: OdooTask) => (t.start ?? 0) + (t.minutes ?? 60) * 60000;

/**
 * Jobs › Team: the dispatch board. Field Service orders nobody has yet, then
 * a lane per worker with their jobs on the chosen day. Tap Assign, or a job
 * in a lane, to give it to a worker at a time; Odoo is updated straight away.
 */
export function DispatchScreen({ now = Date.now, part = 'all' }: { now?: () => number; /** Which part to draw: the whole board (Jobs > Team), or one page of the Dispatch area. */ part?: Part }) {
  const { client } = useOdoo();
  const { business } = useInvoices();
  const [day, setDay] = useState(() => startOfDay(now()));
  const [open, setOpen] = useState<OdooTask[] | null>(null);
  const [dayJobs, setDayJobs] = useState<OdooTask[]>([]);
  const [fetched, setFetched] = useState<OdooTask[]>([]);
  const [techs, setTechs] = useState<OdooUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<OdooTask | null>(null);
  const [showAll, setShowAll] = useState(false);
  // Only the newest load may fill the board, so a slow earlier read can't put old data back.
  const asked = useRef(0);

  const fail = (e: unknown) => setError(e instanceof OdooError ? e.message : "Couldn't talk to Odoo. Try again.");

  const load = useCallback(async () => {
    if (!client) return;
    const n = ++asked.current;
    setBusy(true);
    setError(null);
    try {
      const [u, d, w, nt] = await Promise.all([client.unassignedTasks(), client.jobsBetween(day, addDays(day, 1)), client.techs(), listFor(client, part, now())]);
      if (n !== asked.current) return;
      setFetched(nt);
      setOpen(u);
      setDayJobs(d);
      setTechs(w);
    } catch (e) {
      if (n === asked.current) fail(e);
    } finally {
      if (n === asked.current) setBusy(false);
    }
  }, [client, day, part]);

  useEffect(() => {
    load();
  }, [load]);

  const lanes = useMemo(
    () =>
      techs.map((w) => {
        const jobs = dayJobs.filter((t) => t.assignees.includes(w.id)).sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
        return { w, jobs, freeAt: jobs.length ? Math.max(...jobs.map(endOf)) : undefined };
      }),
    [techs, dayJobs],
  );

  // Jobs for the chosen day first (by time), then the ones with no date or another day.
  const unassigned = useMemo(() => {
    const from = day;
    const to = addDays(day, 1);
    const rank = (x: OdooTask) => (x.start !== undefined && x.start >= from && x.start < to ? 0 : 1);
    return [...(open ?? [])].sort((a, b) => rank(a) - rank(b) || (a.start ?? Infinity) - (b.start ?? Infinity) || a.id - b.id);
  }, [open, day]);

  if (!client) return null;
  const me = client.session.me;
  const t = now();

  const save = async (task: OdooTask, techId: number, start: number | undefined, text: boolean) => {
    setError(null);
    try {
      if (techId === 0) await client.unassign(task.id);
      else await client.scheduleJob(task.id, techId, start);
      setPicking(null);
      if (text && start !== undefined && techId !== 0) {
        const tech = techs.find((w) => w.id === techId)?.name ?? '';
        const link = smsLink(task.phone, bookedText(task, tech, start, t, business.name));
        if (link) Linking.openURL(link).catch(() => undefined);
      }
      await load();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <View style={styles.stack} testID="dispatch">
      {LISTS.includes(part) ? null : (
      <View style={styles.dayRow}>
        <Pressable onPress={() => setDay((d) => addDays(d, -1))} accessibilityRole="button" accessibilityLabel="Day before" testID="dispatch-prev" style={({ pressed }) => [styles.step, pressed && styles.pressed]}>
          <Icon name="back" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.day, styles.grow]} testID="dispatch-day">
          {dayLabel(day, t)}
        </Text>
        <Pressable onPress={() => setDay((d) => addDays(d, 1))} accessibilityRole="button" accessibilityLabel="Day after" testID="dispatch-next" style={({ pressed }) => [styles.step, pressed && styles.pressed]}>
          <Icon name="chevron" size={20} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={() => {
            requestSyncNow().catch(() => undefined);
            load();
          }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={busy ? 'Loading' : 'Refresh'}
          testID="dispatch-refresh"
          style={({ pressed }) => [styles.step, busy && styles.off, pressed && styles.pressed]}
        >
          <Icon name="sync" size={20} color={colors.selected} />
        </Pressable>
      </View>
      )}
      {error ? (
        <Text style={styles.error} testID="dispatch-error">
          {error}
        </Text>
      ) : null}
      {!client.canSchedule ? <Text style={styles.note}>This Odoo has no planned start on its jobs, so jobs can be given to a worker but not a time.</Text> : null}

      {part === 'all' || part === 'unassigned' ? (
      <View style={styles.unassigned} testID="dispatch-unassigned">
        <View style={styles.unHead}>
          <Icon name="warn" size={22} color={colors.warn} />
          <Text style={styles.unTitle}>Not assigned · {open?.length ?? '…'}</Text>
        </View>
        {open && open.length === 0 ? <Text style={styles.cardSub}>Every open job has a worker.</Text> : null}
        {(showAll ? unassigned : unassigned.slice(0, SHOWN)).map((task) => (
          <View key={task.id} style={styles.card} testID={`dispatch-open-${task.id}`}>
            <View style={styles.grow}>
              <Text style={styles.cardTitle}>
                {task.customer || task.name}
                {task.customer ? ` · ${task.name}` : ''}
              </Text>
              <Text style={styles.cardSub}>{[task.address, task.start ? `${dayLabel(task.start, t)} ${formatTime(task.start)}` : 'No date', task.stage].filter(Boolean).join(' · ')}</Text>
            </View>
            <Action label="Assign" primary onPress={() => setPicking(task)} testID={`dispatch-assign-${task.id}`} />
          </View>
        ))}
        {unassigned.length > SHOWN ? <Action label={showAll ? 'Show fewer' : `Show all ${unassigned.length}`} onPress={() => setShowAll((v) => !v)} testID="dispatch-show-all" /> : null}
      </View>
      ) : null}

      {LISTS.includes(part) ? (
        <View style={styles.unassigned} testID={`dispatch-alerts-${part}`}>
          {(() => {
            const list = part === 'late' ? lateJobs(dayJobs, t) : part === 'double' ? doubleBooked(dayJobs) : fetched;
            if (list.length === 0) return <Text style={styles.cardSub}>{EMPTY[part]}</Text>;
            return list.map((task) => (
              <View key={task.id} style={styles.card} testID={`dispatch-alert-${task.id}`}>
                <View style={styles.grow}>
                  <Text style={styles.cardTitle}>
                    {task.customer || task.name}
                    {task.customer ? ` · ${task.name}` : ''}
                  </Text>
                  <Text style={styles.cardSub}>
                    {[techs.find((w) => task.assignees.includes(w.id))?.name ?? (task.assignees.length ? undefined : 'No tech yet'), task.start ? `${dayLabel(task.start, t)} ${formatTime(task.start)}` : 'No time', task.address].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Action label="Change" primary onPress={() => setPicking(task)} testID={`dispatch-change-${task.id}`} />
              </View>
            ));
          })()}
        </View>
      ) : null}

      {(part === 'all' || part === 'board' ? lanes : []).map(({ w, jobs, freeAt }) => (
        <View key={w.id} style={styles.lane} testID={`dispatch-lane-${w.id}`}>
          <View style={styles.laneHead}>
            <Text style={styles.avatar}>{w.name.trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? '').join('')}</Text>
            <Text style={[styles.h2, styles.grow]}>{w.id === me ? `${w.name} (me)` : w.name}</Text>
            <Text style={styles.meta}>
              {jobs.length === 0 ? 'Nothing booked' : `${jobs.length} job${jobs.length === 1 ? '' : 's'} · free after ${formatTime(freeAt!)}`}
            </Text>
          </View>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.min(100, Math.round((jobs.reduce((n, x) => n + (x.minutes ?? 60), 0) / 480) * 100))}%` }]} />
          </View>
          {jobs.length > 0 ? (
            <View style={styles.wrap}>
              {jobs.map((task) => (
                <Pressable key={task.id} onPress={() => setPicking(task)} accessibilityRole="button" accessibilityHint="Move or change the time" testID={`dispatch-job-${task.id}`} style={({ pressed }) => [styles.block, pressed && styles.pressed]}>
                  <Text style={styles.blockTime}>{task.start ? formatTime(task.start) : 'Any time'}</Text>
                  <Text style={styles.blockText} numberOfLines={1}>
                    {task.customer || task.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ))}
      {(part === 'all' || part === 'board') && techs.length === 0 && !busy ? <Text style={styles.note}>No Field Service workers in Odoo yet. In Odoo, tick "Is a FS Worker" on each tech's contact.</Text> : null}

      {picking ? <AssignSheet task={picking} day={day} techs={techs} me={me} canTime={client.canSchedule} lanes={lanes} now={t} onCancel={() => setPicking(null)} onSave={save} /> : null}
    </View>
  );
}

function AssignSheet({
  task,
  day,
  techs,
  me,
  canTime,
  lanes,
  now,
  onCancel,
  onSave,
}: {
  task: OdooTask;
  day: number;
  techs: OdooUser[];
  me: number;
  canTime: boolean;
  lanes: { w: OdooUser; jobs: OdooTask[]; freeAt?: number }[];
  now: number;
  onCancel: () => void;
  onSave: (task: OdooTask, techId: number, start: number | undefined, text: boolean) => void;
}) {
  const slots = slotsFor(day);
  // 0 keeps the time Odoo has (or none).
  const [start, setStart] = useState<number>(task.start && startOfDay(task.start) === day ? task.start : 0);
  const when = start || undefined;
  const laneOf = (id: number) => lanes.find((l) => l.w.id === id);
  // A worker is busy when another of their jobs overlaps the time being picked.
  const busyAt = (id: number) => {
    if (!when) return false;
    const mins = (task.minutes ?? 60) * 60000;
    return (laneOf(id)?.jobs ?? []).some((j) => j.id !== task.id && (j.start ?? 0) < when + mins && endOf(j) > when);
  };
  // Suggest the free worker with the fewest jobs that day.
  const suggested = [...techs].filter((w) => !busyAt(w.id)).sort((a, b) => (laneOf(a.id)?.jobs.length ?? 0) - (laneOf(b.id)?.jobs.length ?? 0))[0]?.id;
  const [tech, setTech] = useState<number>(task.assignees[0] ?? suggested ?? techs[0]?.id ?? 0);
  const name = tech === 0 ? '' : techs.find((w) => w.id === tech)?.name ?? '';
  const reported = task.notes
    .split('\n')
    .filter((l) => !l.trim().startsWith('App job '))
    .join(' ')
    .trim();
  const line = (id: number) => {
    const l = laneOf(id);
    const n = l?.jobs.length ?? 0;
    const free = busyAt(id) ? 'Busy at that time' : n === 0 ? 'Free all day' : `Free after ${formatTime(l!.freeAt!)}`;
    return `${free} · ${n} job${n === 1 ? '' : 's'}${id === suggested && !task.assignees.includes(id) ? ' · suggested' : ''}`;
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="dispatch-sheet">
          <View style={styles.grab} />
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetTitle}>
              Assign {task.customer || task.name}
              {task.customer ? ` · ${task.name}` : ''}
            </Text>
            <Text style={styles.cardSub}>{[task.address, task.start ? `${dayLabel(task.start, now)} ${formatTime(task.start)}` : 'No date'].filter(Boolean).join(' · ')}</Text>
            {reported ? (
              <Text style={styles.cardSub} numberOfLines={3}>
                {reported}
              </Text>
            ) : null}
            <View style={styles.picks} testID="dispatch-sheet-techs">
              {techs.map((w) => {
                const on = tech === w.id;
                return (
                  <Pressable key={w.id} onPress={() => setTech(w.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={({ pressed }) => [styles.pick, w.id === suggested && styles.pickSug, on && styles.pickOn, pressed && styles.pressed]}>
                    <Text style={styles.avatar}>{w.name.trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? '').join('')}</Text>
                    <View style={styles.grow}>
                      <Text style={styles.pickName}>{`${w.id === me ? 'Me' : w.name}`}</Text>
                      <Text style={styles.cardSub}>{line(w.id)}</Text>
                    </View>
                    {on ? <Icon name="check" size={22} color={colors.selected} /> : null}
                  </Pressable>
                );
              })}
              {/* Only a job that has a worker can have the worker taken off. */}
              {task.assignees.length > 0 ? (
                <Pressable onPress={() => setTech(0)} accessibilityRole="radio" accessibilityState={{ selected: tech === 0 }} style={({ pressed }) => [styles.pick, tech === 0 && styles.pickOn, pressed && styles.pressed]}>
                  <View style={styles.grow}>
                    <Text style={styles.pickName}>No one (unassign)</Text>
                  </View>
                  {tech === 0 ? <Icon name="check" size={22} color={colors.selected} /> : null}
                </Pressable>
              ) : null}
            </View>
            {canTime && tech !== 0 ? (
              <>
                <Text style={styles.label}>Start, {dayLabel(day, now)}</Text>
                <ChipRow
                  options={[{ label: task.start ? 'Keep time' : 'No time', value: 0 }, ...slots.map((s) => ({ label: formatTime(s), value: s }))]}
                  value={start}
                  onChange={setStart}
                  scroll
                  testID="dispatch-sheet-times"
                />
              </>
            ) : null}
            <Action label={tech === 0 ? 'Remove worker' : name ? `Assign to ${first(name)}` : 'Assign'} primary disabled={tech === 0 && task.assignees.length === 0} onPress={() => onSave(task, tech, when, false)} testID="dispatch-save" />
            {tech !== 0 && smsLink(task.phone, 'x') && when ? <Action label="Assign and text the customer" disabled={!tech} onPress={() => onSave(task, tech, when, true)} testID="dispatch-save-text" /> : null}
            <Action label="Cancel" onPress={onCancel} testID="dispatch-cancel" />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  grow: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.5 },
  day: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  h2: { fontSize: 18, fontWeight: '800', color: colors.text },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  meta: { fontSize: 15, fontWeight: '800', color: colors.muted },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  error: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  unassigned: { backgroundColor: colors.warnBg, borderRadius: radius.card, padding: 12, gap: 8 },
  unHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unTitle: { fontSize: 18, fontWeight: '800', color: colors.warn },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  cardSub: { fontSize: 14, fontWeight: '700', color: colors.muted },
  lane: { gap: 8, padding: 12, borderRadius: radius.card, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, ...shadow },
  laneHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, textAlign: 'center', textAlignVertical: 'center', lineHeight: 38, overflow: 'hidden', fontSize: 14, fontWeight: '800', color: colors.selected, backgroundColor: colors.info },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.line, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.selected },
  block: { minHeight: touch.min, minWidth: 96, maxWidth: '100%', borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 4, justifyContent: 'center', backgroundColor: colors.card },
  blockTime: { fontSize: 13, fontWeight: '800', color: colors.text },
  blockText: { fontSize: 15, fontWeight: '800', color: colors.text },
  pressed: { backgroundColor: colors.info },
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', backgroundColor: colors.card, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderTopWidth: 1, borderColor: colors.border },
  grab: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center', marginTop: 8 },
  picks: { gap: 8 },
  pick: { minHeight: touch.min + 4, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card },
  pickSug: { backgroundColor: colors.info },
  pickOn: { borderColor: colors.selected },
  pickName: { fontSize: type.body, fontWeight: '800', color: colors.text },
  sheetBody: { padding: 16, paddingBottom: 28, gap: 10 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
});
