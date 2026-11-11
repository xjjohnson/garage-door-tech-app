import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChipOption, Segmented } from '../components/controls';
import { JobDetailsSheet } from '../components/JobDetailsSheet';
import { formatJobDate, Job, jobName, JobStatus, MODE_LABEL, phoneLink, searchJobs, sortJobs } from '../lib/jobs';
import { formatMoney, TIER_LABEL } from '../lib/prices';
import { checkCounts } from '../lib/inspection';
import { balance, invoiceStatus, STATUS_LABEL } from '../lib/invoices';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { StatsCard } from './StatsScreen';
import { NextVisits } from './ScheduleScreen';
import { ClockButton } from './WorkLogScreen';
import { StockButton } from './StockScreen';
import { followUps } from '../lib/followups';
import { useFollowUps } from '../lib/useFollowUps';
import { colors, touch, type } from '../theme';

type Filter = JobStatus | 'all';

const FILTERS: ChipOption<Filter>[] = [
  { label: 'Open', value: 'open' },
  { label: 'Done', value: 'done' },
  { label: 'All', value: 'all' },
];

const CONFIRM_MS = 4000;

/**
 * Saved jobs, open ones first. Tapping a job shows its details and what can
 * be done with it: open it in the calculator, call the customer, edit, mark
 * done, or delete (on a second tap).
 */
export function JobsScreen({ onOpen }: { onOpen: (job: Job) => void }) {
  const { jobs, loaded, updateDetails, setStatus, remove } = useJobs();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('open');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Job | null>(null);

  const shown = useMemo(() => {
    const byStatus = filter === 'all' ? jobs : jobs.filter((j) => j.status === filter);
    return sortJobs(searchJobs(byStatus, query));
  }, [jobs, filter, query]);
  const openCount = jobs.filter((j) => j.status === 'open').length;

  return (
    <View style={styles.stack}>
      <StatsCard />
      <NextVisits />
      <View style={styles.row}>
        <ClockButton />
        <StockButton />
      </View>
      <FollowUpsButton />
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Customer, address or spring"
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
      <View style={styles.row}>
        <Pressable onPress={() => router.push('/customers')} accessibilityRole="button" testID="open-customers" style={({ pressed }) => [styles.button, styles.grow, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Customers</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/invoices')} accessibilityRole="button" testID="open-invoices" style={({ pressed }) => [styles.button, styles.grow, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Invoices</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Pressable onPress={() => router.push('/price-sheet')} accessibilityRole="button" testID="open-price-sheet" style={({ pressed }) => [styles.button, styles.grow, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Price sheet</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/business')} accessibilityRole="button" testID="open-business" style={({ pressed }) => [styles.button, styles.grow, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Your business</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => router.push('/backup')} accessibilityRole="button" testID="open-backup" style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Text style={styles.buttonText}>Back up or restore</Text>
      </Pressable>
      <Segmented options={FILTERS} value={filter} onChange={setFilter} testID="jobs-filter" />

      {loaded && jobs.length === 0 ? (
        <View style={styles.empty} testID="jobs-empty">
          <Text style={styles.emptyTitle}>No saved jobs yet</Text>
          <Text style={styles.emptyBody}>On Springs, enter the measurements, then tap Save as a job under the results. Jobs stay on this phone.</Text>
        </View>
      ) : null}
      {jobs.length > 0 ? (
        <Text style={styles.count} testID="jobs-count">
          {shown.length === 0 ? 'No jobs match.' : `${shown.length} shown`} · {openCount} open
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

/** Follow-ups due, with a count, above the list. */
function FollowUpsButton() {
  const { invoices, business } = useInvoices();
  const { settings, dismissed } = useFollowUps();
  const due = useMemo(() => followUps(invoices, settings, business, Date.now(), dismissed).filter((f) => f.due <= Date.now() + 7 * 24 * 3600 * 1000).length, [invoices, settings, business, dismissed]);
  return (
    <Pressable onPress={() => router.push('/follow-ups')} accessibilityRole="button" testID="open-followups" style={({ pressed }) => [styles.button, due > 0 && styles.due, pressed && styles.pressed]}>
      <Text style={styles.buttonText}>{due > 0 ? `Follow-ups: ${due} due` : 'Follow-ups'}</Text>
    </Pressable>
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
          <Text style={[styles.badge, job.status === 'done' && styles.badgeDone]}>{job.status === 'done' ? 'DONE' : 'OPEN'}</Text>
        </View>
        {job.customer && job.address ? <Text style={styles.address}>{job.address}</Text> : null}
        <Text style={styles.answer}>{job.summaryTitle}</Text>
        {job.summaryDetail ? <Text style={styles.meta}>{job.summaryDetail}</Text> : null}
        {job.accepted ? (
          <Text style={styles.accepted} testID={`job-accepted-${job.id}`}>
            Picked {TIER_LABEL[job.accepted.tier]}, {formatMoney(job.accepted.total)}
          </Text>
        ) : null}
        {invoice ? (
          <Text style={styles.accepted} testID={`job-invoice-${job.id}`}>
            Invoice {invoice.number}: {STATUS_LABEL[invoiceStatus(invoice)]}
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
          <Action label="Quote" primary onPress={onQuote} testID={`job-quote-${job.id}`} />
          <Action label={job.inspection ? `Safety check (${checkCounts(job.inspection).fix} need work)` : 'Safety check'} onPress={() => router.push({ pathname: '/inspection/[id]', params: { id: job.id } })} testID={`job-inspection-${job.id}`} />
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
  stack: { gap: 12 },
  searchRow: { flexDirection: 'row', gap: 8 },
  search: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: type.value,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  clear: { minHeight: 64, minWidth: touch.min + 16, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  count: { fontSize: 16, fontWeight: '700', color: colors.muted },
  empty: { padding: 12, borderRadius: 10, backgroundColor: colors.card, gap: 6 },
  emptyTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: 16, color: colors.text, lineHeight: 22 },
  item: { borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg, overflow: 'hidden' },
  itemDone: { backgroundColor: colors.card },
  head: { minHeight: touch.min, padding: 12, gap: 2 },
  headTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: type.value, fontWeight: '900', color: colors.text },
  badge: { fontSize: 14, fontWeight: '900', color: colors.text, backgroundColor: colors.safety, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', letterSpacing: 1 },
  badgeDone: { color: colors.onSelected, backgroundColor: colors.selected },
  address: { fontSize: type.body, fontWeight: '700', color: colors.text },
  answer: { fontSize: type.body, fontWeight: '900', color: colors.text, marginTop: 4 },
  accepted: { fontSize: type.body, fontWeight: '900', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  actions: { gap: 8, padding: 12, paddingTop: 10, borderTopWidth: 2, borderTopColor: colors.border },
  detail: { fontSize: type.body, color: colors.text, lineHeight: 24 },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected },
  due: { backgroundColor: colors.safety },
  armed: { backgroundColor: colors.stop, borderColor: colors.stop },
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  primaryText: { color: colors.onSelected },
});
