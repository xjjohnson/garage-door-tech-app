import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './AppText';
import { Action } from './Buttons';
import { fetchFsmTemplates, FsmTemplate } from '../lib/fsmTemplates';
import { Job } from '../lib/jobs';
import { completeActivity, createManualFollowUp, fetchTodos, TodoRow } from '../lib/odooFollowUps';
import { currentTemplate, fetchJobTags, setJobTags, switchTemplate, Tag } from '../lib/odooJobExtras';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';
import { colors, radius, touch } from '../theme';

/**
 * The slim rows at the bottom of a job: Summary of work, Job Inputs (the
 * job's template), Tasks (Odoo to-dos) and Job Tags. Each opens on tap and
 * shows a count or a word when closed, so nothing is hidden by accident.
 */
export function JobExtras({ job, partnerId }: { job: Job; partnerId?: number }) {
  const { client } = useOdoo();
  const orderId = job.odooJob?.model === 'fsm.order' ? job.odooJob.id : undefined;
  return (
    <View style={styles.stack} testID="job-extras">
      <Summary job={job} />
      {client && orderId ? <Inputs orderId={orderId} /> : null}
      {client && partnerId ? <Tasks partnerId={partnerId} /> : null}
      {client && orderId ? <Tags orderId={orderId} /> : null}
    </View>
  );
}

function Fold({ id, title, badge, children }: { id: string; title: string; badge?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.card}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} testID={`job-extra-${id}`} style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        <Text style={styles.plus}>{open ? '–' : '+'}</Text>
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

/** What was done, in the tech's words. It is the job's notes, which already go to the Odoo order's description. */
function Summary({ job }: { job: Job }) {
  const { updateDetails } = useJobs();
  const [text, setText] = useState(job.notes);
  useEffect(() => setText(job.notes), [job.notes]);
  const dirty = text.trim() !== job.notes.trim();
  return (
    <Fold id="summary" title="Summary of work" badge={job.notes.trim() ? 'written' : undefined}>
      <TextInput value={text} onChangeText={setText} multiline placeholder="What was found and what was done" placeholderTextColor={colors.muted} style={styles.input} testID="job-summary-input" />
      {dirty ? <Action label="Save summary" primary onPress={() => updateDetails(job.id, { customer: job.customer, address: job.address, phone: job.phone, notes: text })} testID="job-summary-save" /> : null}
    </Fold>
  );
}

/** The job's template: pick another and Odoo's instructions, type and categories switch with it. */
function Inputs({ orderId }: { orderId: number }) {
  const { client } = useOdoo();
  const [list, setList] = useState<FsmTemplate[]>([]);
  const [current, setCurrent] = useState<number | undefined>();
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!client) return;
    fetchFsmTemplates(client).then(setList).catch(() => undefined);
    currentTemplate(client, orderId).then(setCurrent).catch(() => undefined);
  }, [client, orderId]);
  if (list.length === 0) return null;
  const name = list.find((t) => t.id === current)?.name;
  const pick = (t: FsmTemplate) => {
    if (!client || t.id === current) return;
    setMsg('Switching...');
    switchTemplate(client, orderId, t)
      .then(() => {
        setCurrent(t.id);
        setMsg(`Switched to ${t.name} in Odoo.`);
      })
      .catch((e) => setMsg(`Couldn't switch: ${e instanceof Error ? e.message : String(e)}`));
  };
  return (
    <Fold id="inputs" title="Job Inputs" badge={name}>
      <Text style={styles.hint}>Template for this job. Switching changes its instructions in Odoo.</Text>
      <View style={styles.chips}>
        {list.map((t) => (
          <Pressable key={t.id} onPress={() => pick(t)} accessibilityRole="button" accessibilityState={{ selected: t.id === current }} testID={`job-template-${t.id}`} style={[styles.chip, t.id === current && styles.chipOn]}>
            <Text style={[styles.chipText, t.id === current && styles.chipTextOn]}>{t.name}</Text>
          </Pressable>
        ))}
      </View>
      {msg ? <Text style={styles.hint}>{msg}</Text> : null}
    </Fold>
  );
}

/** Odoo to-dos on the customer: the same follow-ups the Follow-ups feature makes. Add one, or mark one done. */
function Tasks({ partnerId }: { partnerId: number }) {
  const { client } = useOdoo();
  const [rows, setRows] = useState<TodoRow[]>([]);
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState('');
  const load = useCallback(() => {
    if (client) fetchTodos(client, partnerId, 20).then(setRows).catch(() => undefined);
  }, [client, partnerId]);
  useEffect(load, [load]);
  const add = () => {
    if (!client || !title.trim()) return;
    createManualFollowUp(client, partnerId, { title, note: '', due: Date.now() + 7 * 86400000 })
      .then(() => {
        setTitle('');
        setMsg('Added to Odoo, due in a week.');
        load();
      })
      .catch((e) => setMsg(`Couldn't add: ${e instanceof Error ? e.message : String(e)}`));
  };
  return (
    <Fold id="tasks" title="Tasks" badge={rows.length ? String(rows.length) : undefined}>
      {rows.length === 0 ? <Text style={styles.hint}>No open to-dos for this customer.</Text> : null}
      {rows.map((r) => (
        <View key={r.id} style={styles.task} testID={`job-task-${r.id}`}>
          <View style={styles.grow}>
            <Text style={styles.taskTitle}>{r.title}</Text>
            {r.due ? <Text style={styles.hint}>Due {r.due}</Text> : null}
          </View>
          <Pressable onPress={() => client && completeActivity(client, r.id).then(load).catch(() => undefined)} accessibilityRole="button" accessibilityLabel={`Mark ${r.title} done`} testID={`job-task-done-${r.id}`} style={styles.done}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      ))}
      <TextInput value={title} onChangeText={setTitle} placeholder="New task, for example call back about the opener" placeholderTextColor={colors.muted} style={styles.line} testID="job-task-input" />
      {title.trim() ? <Action label="Add task" onPress={add} testID="job-task-add" /> : null}
      {msg ? <Text style={styles.hint}>{msg}</Text> : null}
    </Fold>
  );
}

/** Odoo's Field Service tags on this job: tap to put one on or take it off. */
function Tags({ orderId }: { orderId: number }) {
  const { client } = useOdoo();
  const [tags, setTags] = useState<{ all: Tag[]; on: number[] } | null>(null);
  useEffect(() => {
    if (client) fetchJobTags(client, orderId).then(setTags).catch(() => undefined);
  }, [client, orderId]);
  if (!tags || tags.all.length === 0) return null;
  const toggle = (id: number) => {
    if (!client) return;
    const on = tags.on.includes(id) ? tags.on.filter((x) => x !== id) : [...tags.on, id];
    setTags({ ...tags, on });
    setJobTags(client, orderId, on).catch(() => fetchJobTags(client, orderId).then(setTags).catch(() => undefined));
  };
  return (
    <Fold id="tags" title="Job Tags" badge={tags.on.length ? String(tags.on.length) : undefined}>
      <View style={styles.chips}>
        {tags.all.map((t) => (
          <Pressable key={t.id} onPress={() => toggle(t.id)} accessibilityRole="button" accessibilityState={{ selected: tags.on.includes(t.id) }} testID={`job-tag-${t.id}`} style={[styles.chip, tags.on.includes(t.id) && styles.chipOn]}>
            <Text style={[styles.chipText, tags.on.includes(t.id) && styles.chipTextOn]}>{t.name}</Text>
          </Pressable>
        ))}
      </View>
    </Fold>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line },
  head: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  title: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  badge: { fontSize: 13, fontWeight: '800', color: colors.selected, backgroundColor: colors.info, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden', maxWidth: 160 },
  plus: { fontSize: 24, fontWeight: '700', color: colors.muted, width: 22, textAlign: 'center' },
  body: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  hint: { fontSize: 15, fontWeight: '600', color: colors.muted },
  input: { minHeight: 110, borderRadius: radius.field, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 17, fontWeight: '600', color: colors.text, textAlignVertical: 'top', backgroundColor: colors.bg },
  line: { minHeight: touch.min, borderRadius: radius.field, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, fontSize: 17, fontWeight: '600', color: colors.text, backgroundColor: colors.bg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.selected, borderColor: colors.selected },
  chipText: { fontSize: 16, fontWeight: '700', color: colors.text },
  chipTextOn: { color: colors.onSelected },
  task: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  taskTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  done: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.info, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontSize: 15, fontWeight: '800', color: colors.selected },
});
