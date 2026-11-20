import { workDoneLabel } from '../lib/jobSteps';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { ChipOption, ChipRow } from '../components/controls';
import { JobDetailsSheet } from '../components/JobDetailsSheet';
import { acceptedLabel, formatJobDate, Job, jobName, JobStatus, MODE_LABEL, phoneLink, searchJobs, sortJobs } from '../lib/jobs';
import { formatMoney } from '../lib/prices';
import { checkCounts } from '../lib/inspection';
import { balance, invoiceLabel, invoiceStatus, STATUS_LABEL } from '../lib/invoices';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { OdooJobsList } from '../components/OdooJobsList';
import { useOdoo } from '../lib/useOdoo';
import { colors, touch, type, bw, fs, rad, sz, sp } from '../theme';

type Filter = JobStatus | 'all' | 'unpaid' | 'paid' | 'upcoming';

const FILTERS: ChipOption<Filter>[] = [
  { label: 'All', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Unpaid', value: 'unpaid' },
  { label: 'Paid', value: 'paid' },
  { label: 'Done', value: 'done' },
];

const CONFIRM_MS = 4000;

/**
 * The jobs. Signed in to Odoo, that's Odoo's own Field Service jobs, with
 * any job still waiting to go to Odoo on top. Not signed in, it's the jobs
 * saved on this phone, open ones first. Tapping a phone job shows its details
 * and what can be done with it: open it, call the customer, edit, mark done,
 * or delete (on a second tap).
 */
export function JobsScreen({ onOpen }: { onOpen: (job: Job) => void }) {
  const { jobs, loaded, updateDetails, setStatus, remove } = useJobs();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Job | null>(null);

  const { invoices } = useInvoices();
  // Jobs with an invoice that still has a balance, for the Unpaid chip.
  const owedJobIds = useMemo(() => new Set(invoices.filter((i) => i.jobId && ['unpaid', 'partial'].includes(invoiceStatus(i))).map((i) => i.jobId as string)), [invoices]);
  // Jobs whose invoices are all paid, for the Paid chip.
  const paidJobIds = useMemo(() => {
    const live = invoices.filter((i) => i.jobId && invoiceStatus(i) !== 'void');
    return new Set(live.filter((i) => i.jobId && live.filter((x) => x.jobId === i.jobId).every((x) => invoiceStatus(x) === 'paid')).map((i) => i.jobId as string));
  }, [invoices]);
  const { status: odooStatus, client } = useOdoo();
  const fromOdoo = odooStatus === 'signedIn' && !!client && client.session.kind !== 'none';
  const shown = useMemo(() => {
    const own = fromOdoo ? jobs.filter((j) => !j.odooJob) : jobs;
    const byStatus = filter === 'all' ? own : filter === 'upcoming' ? [] : filter === 'unpaid' ? own.filter((j) => owedJobIds.has(j.id)) : filter === 'paid' ? own.filter((j) => paidJobIds.has(j.id)) : own.filter((j) => j.status === filter);
    return sortJobs(searchJobs(byStatus, query));
  }, [jobs, filter, query, fromOdoo, owedJobIds, paidJobIds]);
  const openCount = jobs.filter((j) => j.status === 'open').length;

  return (
    <View style={styles.stack}>
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={fromOdoo ? 'Customer, address or job number' : 'Customer, address or spring'}
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search jobs"
          testID="jobs-search"
          style={styles.search}
        />
        {query !== '' ? (
          <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" style={({ pressed }) => [styles.clear, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      <ChipRow options={fromOdoo ? FILTERS : FILTERS.filter((f) => f.value !== 'upcoming')} value={filter} onChange={setFilter} compact fit testID="jobs-filter" />

      {!fromOdoo && loaded && jobs.length === 0 ? (
        <View style={styles.empty} testID="jobs-empty">
          <Text style={styles.emptyTitle}>No jobs yet</Text>
          <Text style={styles.emptyBody}>Tap + New job on Today. Sign in to Odoo on Team to see all of Odoo&apos;s jobs here.</Text>
        </View>
      ) : null}
      {!fromOdoo && jobs.length > 0 ? (
        <Text style={styles.count} testID="jobs-count">
          {shown.length === 0 ? 'No jobs match.' : `${shown.length} shown`} · {openCount} open
        </Text>
      ) : null}
      {fromOdoo && shown.length > 0 ? (
        <Text style={styles.count} testID="jobs-waiting">
          Waiting to go to Odoo: {shown.length}
        </Text>
      ) : null}

      {shown.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          expanded={expanded === job.id}
          onToggle={() => setExpanded((e) => (e === job.id ? null : job.id))}
          onOpen={() => onOpen(job)}
          onQuote={() => router.push({ pathname: '/quote/[id]', params: { id: job.id } })}
          onEdit={() => setEditing(job)}
          onStatus={(s) => setStatus(job.id, s)}
          onDelete={() => {
            remove(job.id);
            setExpanded(null);
          }}
        />
      ))}

      {fromOdoo ? <OdooJobsList filter={filter === 'unpaid' || filter === 'paid' ? 'all' : filter} search={query} owedJobIds={filter === 'unpaid' ? owedJobIds : filter === 'paid' ? paidJobIds : undefined} /> : null}

      <JobDetailsSheet
        visible={editing !== null}
        title="Edit job"
        initial={editing ?? undefined}
        saveLabel="Save changes"
        onCancel={() => setEditing(null)}
        onSave={(details) => {
          if (editing) updateDetails(editing.id, details);
          setEditing(null);
        }}
      />
    </View>
  );
}

function JobCard({
  job,
  expanded,
  onToggle,
  onOpen,
  onQuote,
  onEdit,
  onStatus,
  onDelete,
}: {
  job: Job;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onQuote: () => void;
  onEdit: () => void;
  onStatus: (s: JobStatus) => void;
  onDelete: () => void;
}) {
  const tel = phoneLink(job.phone);
  const name = jobName(job);
  const invoice = useInvoices().invoices.find((i) => i.jobId === job.id && invoiceStatus(i) !== 'void');
  const paid = workDoneLabel(job, useInvoices().invoices) === 'Paid';
  return (
    <View style={[styles.item, job.status === 'done' && styles.itemDone]} testID={`job-${job.id}`}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${name}, ${job.summaryTitle}. ${expanded ? 'Hide' : 'Show'} details.`}
        testID={`job-toggle-${job.id}`}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
      >
        <View style={styles.headTop}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.badge, (job.status === 'done' || paid) && styles.badgeDone]}>{paid ? 'PAID' : job.status === 'done' ? 'DONE' : 'OPEN'}</Text>
        </View>
        {job.customer && job.address ? <Text style={styles.address}>{job.address}</Text> : null}
        <Text style={styles.answer}>{job.summaryTitle}</Text>
        {job.summaryDetail ? <Text style={styles.meta}>{job.summaryDetail}</Text> : null}
        {job.accepted ? (
          <Text style={styles.accepted} testID={`job-accepted-${job.id}`}>
            Picked {acceptedLabel(job.accepted)}, {formatMoney(job.accepted.total)}
          </Text>
        ) : null}
        {invoice ? (
          <Text style={styles.accepted} testID={`job-invoice-${job.id}`}>
            {invoiceLabel(invoice)}: {STATUS_LABEL[invoiceStatus(invoice)]}
            {invoiceStatus(invoice) !== 'paid' ? `, ${formatMoney(balance(invoice))} owed` : ''}
          </Text>
        ) : null}
        <Text style={styles.meta}>
          {formatJobDate(job.savedAt)} · {MODE_LABEL[job.mode]}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={styles.actions}>
          {job.phone ? <Text style={styles.detail}>Phone: {job.phone}</Text> : null}
          {job.notes ? <Text style={styles.detail}>{job.notes}</Text> : null}
          <Action label="Open job" primary onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })} testID={`job-hub-${job.id}`} />
          <Action label="Quote" onPress={onQuote} testID={`job-quote-${job.id}`} />
          <Action label={job.inspection ? `Inspection (${checkCounts(job.inspection).fix} flagged)` : 'Inspection'} onPress={() => router.push({ pathname: '/inspection/[id]', params: { id: job.id } })} testID={`job-inspection-${job.id}`} />
          <Action label="Open in calculator" onPress={onOpen} testID={`job-open-${job.id}`} />
          {job.customerId ? (
            <Action label="Customer history" onPress={() => router.push({ pathname: '/customer/[id]', params: { id: job.customerId! } })} testID={`job-customer-${job.id}`} />
          ) : null}
          {tel ? <Action label={`Call ${job.phone}`} onPress={() => Linking.openURL(tel).catch(() => undefined)} testID={`job-call-${job.id}`} /> : null}
          <View style={styles.row}>
            <Action label="Edit details" grow onPress={onEdit} testID={`job-edit-${job.id}`} />
            <Action
              grow
              label={job.status === 'done' ? 'Reopen' : 'Mark done'}
              onPress={() => onStatus(job.status === 'done' ? 'open' : 'done')}
              testID={`job-status-${job.id}`}
            />
          </View>
          <DeleteButton onPress={onDelete} testID={`job-delete-${job.id}`} />
        </View>
      ) : null}
    </View>
  );
}

function Action({ label, onPress, primary, grow, testID }: { label: string; onPress: () => void; primary?: boolean; grow?: boolean; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.button, grow && styles.grow, primary && styles.primary, pressed && styles.pressed]}>
      {({ pressed }) => <Text style={[styles.buttonText, primary && !pressed && styles.primaryText]}>{label}</Text>}
    </Pressable>
  );
}

/** Deletes only on a second tap within a few seconds, like Clear all inputs. */
function DeleteButton({ onPress, testID }: { onPress: () => void; testID?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Pressable
      onPress={() => (armed ? onPress() : setArmed(true))}
      accessibilityRole="button"
      accessibilityHint={armed ? 'Deletes this job.' : 'Tap twice to delete this job.'}
      testID={testID}
      style={({ pressed }) => [styles.button, armed && styles.armed, pressed && styles.pressed]}
    >
      {({ pressed }) => <Text style={[styles.buttonText, armed && !pressed && styles.primaryText]}>{armed ? 'Tap again to delete' : 'Delete job'}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: sp(12) },
  searchRow: { flexDirection: 'row', gap: sp(8) },
  search: {
    flex: 1,
    minWidth: 0,
    minHeight: sz(64),
    borderRadius: rad(10),
    borderWidth: bw(1.5),
    borderColor: colors.border,
    paddingHorizontal: sp(14),
    fontSize: type.value,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  clear: { minHeight: sz(64), minWidth: touch.min + 16, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(10) },
  count: { fontSize: fs(16), fontWeight: '700', color: colors.muted },
  empty: { padding: sp(12), borderRadius: rad(14), backgroundColor: colors.card, gap: sp(6) },
  emptyTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: fs(16), color: colors.text, lineHeight: fs(22) },
  item: { borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' },
  itemDone: { backgroundColor: colors.card },
  head: { minHeight: touch.min, padding: sp(12), gap: sp(2) },
  headTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp(8) },
  name: { flex: 1, fontSize: type.value, fontWeight: '800', color: colors.text },
  badge: { fontSize: fs(14), fontWeight: '800', color: colors.text, backgroundColor: colors.warnBg, paddingHorizontal: sp(8), paddingVertical: sp(2), borderRadius: rad(6), overflow: 'hidden', letterSpacing: 1 },
  badgeDone: { color: colors.onSelected, backgroundColor: colors.selected },
  address: { fontSize: type.body, fontWeight: '700', color: colors.text },
  answer: { fontSize: type.body, fontWeight: '800', color: colors.text, marginTop: sp(4) },
  accepted: { fontSize: type.body, fontWeight: '800', color: colors.text },
  meta: { fontSize: fs(16), fontWeight: '600', color: colors.muted },
  actions: { gap: sp(8), padding: sp(12), paddingTop: sp(10), borderTopWidth: 1, borderTopColor: colors.border },
  detail: { fontSize: type.body, color: colors.text, lineHeight: fs(24) },
  row: { flexDirection: 'row', gap: sp(8) },
  grow: { flex: 1 },
  button: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(10), backgroundColor: colors.card },
  primary: { backgroundColor: colors.selected },
  due: { backgroundColor: colors.warnBg },
  armed: { backgroundColor: colors.stop, borderColor: colors.stop },
  pressed: { backgroundColor: colors.info },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  primaryText: { color: colors.onSelected },
});
