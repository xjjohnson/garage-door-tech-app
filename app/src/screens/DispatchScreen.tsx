import { requestSyncNow } from '../lib/syncNow';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Action } from '../components/Buttons';
import { ChipRow } from '../components/controls';
import { smsLink } from '../lib/jobSteps';
import { OdooError, OdooTask, OdooUser } from '../lib/odoo';
import { addDays, dayLabel, formatTime, slotsFor, startOfDay } from '../lib/schedule';
import { useInvoices } from '../lib/useInvoices';
import { useOdoo } from '../lib/useOdoo';
import { colors, touch, type } from '../theme';

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

const endOf = (t: OdooTask) => (t.start ?? 0) + (t.minutes ?? 60) * 60000;

/**
 * Jobs › Team: the dispatch board. Field Service orders nobody has yet, then
 * a lane per worker with their jobs on the chosen day. Tap Assign, or a job
 * in a lane, to give it to a worker at a time; Odoo is updated straight away.
 */
export function DispatchScreen({ now = Date.now }: { now?: () => number }) {
  const { client } = useOdoo();
  const { business } = useInvoices();
  const [day, setDay] = useState(() => startOfDay(now()));
  const [open, setOpen] = useState<OdooTask[] | null>(null);
  const [dayJobs, setDayJobs] = useState<OdooTask[]>([]);
  const [techs, setTechs] = useState<OdooUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<OdooTask | null>(null);

  const fail = (e: unknown) => setError(e instanceof OdooError ? e.message : "Couldn't talk to Odoo. Try again.");

  const load = useCallback(async () => {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const [u, d, w] = await Promise.all([client.unassignedTasks(), client.jobsBetween(day, addDays(day, 1)), client.techs()]);
      setOpen(u);
      setDayJobs(d);
      setTechs(w);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [client, day]);

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

  if (!client) return null;
  const me = client.session.me;
  const t = now();

  const save = async (task: OdooTask, techId: number, start: number | undefined, text: boolean) => {
    setError(null);
    try {
      await client.scheduleJob(task.id, techId, start);
      setPicking(null);
      if (text && start !== undefined) {
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
      <View style={styles.dayRow}>
        <Action label="‹" onPress={() => setDay((d) => addDays(d, -1))} testID="dispatch-prev" hint="Day before" />
        <Text style={[styles.day, styles.grow]} testID="dispatch-day">
          {dayLabel(day, t)}
        </Text>
        <Action label="›" onPress={() => setDay((d) => addDays(d, 1))} testID="dispatch-next" hint="Day after" />
      </View>
      <Action label={busy ? 'Loading...' : 'Refresh'} disabled={busy} onPress={() => { requestSyncNow().catch(() => undefined); load(); }} testID="dispatch-refresh" />
      {error ? (
        <Text style={styles.error} testID="dispatch-error">
          {error}
        </Text>
      ) : null}
      {!client.canSchedule ? <Text style={styles.note}>This Odoo has no planned start on its jobs, so jobs can be given to a worker but not a time.</Text> : null}

      <View style={styles.unassigned} testID="dispatch-unassigned">
        <Text style={styles.h2}>Not assigned · {open?.length ?? '…'}</Text>
        {open && open.length === 0 ? <Text style={styles.cardSub}>Every open job has a worker.</Text> : null}
        {(open ?? []).map((task) => (
          <View key={task.id} style={styles.card} testID={`dispatch-open-${task.id}`}>
            <View style={styles.grow}>
              <Text style={styles.cardTitle}>
                {task.customer || task.name}
                {task.customer ? ` · ${task.name}` : ''}
              </Text>
              <Text style={styles.cardSub}>{[task.address, task.start ? `${dayLabel(task.start, t)} ${formatTime(task.start)}` : '', task.stage].filter(Boolean).join(' · ')}</Text>
            </View>
            <Action label="Assign" primary onPress={() => setPicking(task)} testID={`dispatch-assign-${task.id}`} />
          </View>
        ))}
      </View>

      {lanes.map(({ w, jobs, freeAt }) => (
        <View key={w.id} style={styles.lane} testID={`dispatch-lane-${w.id}`}>
          <View style={styles.laneHead}>
            <Text style={[styles.h2, styles.grow]}>{w.id === me ? `${w.name} (me)` : w.name}</Text>
            <Text style={styles.meta}>
              {jobs.length === 0 ? 'Nothing booked' : `${jobs.length} job${jobs.length === 1 ? '' : 's'} · free after ${formatTime(freeAt!)}`}
            </Text>
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
      {techs.length === 0 && !busy ? <Text style={styles.note}>No Field Service workers in Odoo yet. In Odoo, tick "Is a FS Worker" on each tech's contact.</Text> : null}

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
  lanes: { w: OdooUser; freeAt?: number }[];
  now: number;
  onCancel: () => void;
  onSave: (task: OdooTask, techId: number, start: number | undefined, text: boolean) => void;
}) {
  const [tech, setTech] = useState<number>(task.assignees[0] ?? techs[0]?.id ?? 0);
  // 0 keeps the time Odoo has (or none).
  const [start, setStart] = useState<number>(task.start && startOfDay(task.start) === day ? task.start : 0);
  const slots = slotsFor(day);
  const free = (id: number) => lanes.find((l) => l.w.id === id)?.freeAt;
  const when = start || undefined;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="dispatch-sheet">
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetTitle}>
              Assign {task.customer || task.name}
              {task.customer ? ` · ${task.name}` : ''}
            </Text>
            {task.address ? <Text style={styles.cardSub}>{task.address}</Text> : null}
            <Text style={styles.label}>Worker</Text>
            <ChipRow
              options={techs.map((w) => ({ label: `${w.id === me ? 'Me' : w.name}${free(w.id) ? ` · after ${formatTime(free(w.id)!)}` : ''}`, value: w.id }))}
              value={tech}
              onChange={setTech}
              testID="dispatch-sheet-techs"
            />
            {canTime ? (
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
            <Action label="Assign" primary disabled={!tech} onPress={() => onSave(task, tech, when, false)} testID="dispatch-save" />
            {smsLink(task.phone, 'x') && when ? <Action label="Assign and text the customer" disabled={!tech} onPress={() => onSave(task, tech, when, true)} testID="dispatch-save-text" /> : null}
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
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  day: { fontSize: type.value, fontWeight: '900', color: colors.text, textAlign: 'center' },
  h2: { fontSize: 18, fontWeight: '900', color: colors.text },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  meta: { fontSize: 15, fontWeight: '800', color: colors.muted },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  error: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  unassigned: { backgroundColor: colors.safety, borderRadius: 16, padding: 12, gap: 8 },
  card: { backgroundColor: colors.bg, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  cardSub: { fontSize: 14, fontWeight: '700', color: colors.muted },
  lane: { gap: 6 },
  laneHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  block: { minHeight: touch.min, minWidth: 96, maxWidth: '100%', borderRadius: 8, borderWidth: 2, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 4, justifyContent: 'center', backgroundColor: colors.bg },
  blockTime: { fontSize: 13, fontWeight: '900', color: colors.text },
  blockText: { fontSize: 15, fontWeight: '800', color: colors.text },
  pressed: { backgroundColor: colors.info },
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: { maxHeight: '85%', backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 3, borderColor: colors.border },
  sheetBody: { padding: 16, paddingBottom: 28, gap: 10 },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
});
