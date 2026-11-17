import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Action, NavRow, QuickAction } from '../components/Buttons';
import { Dock } from '../components/Page';
import { JobExtras } from '../components/JobExtras';
import { Pressable } from 'react-native';
import { SectionTitle } from '../components/controls';
import { CustomerBadgeLine, EquipmentChips, HouseCard } from '../components/HouseHistory';
import { JobParts } from '../components/JobParts';
import { OdooNotes } from '../components/OdooNotes';
import { jobAddress, useJobCustomer } from './JobAddressScreen';
import { checkCounts } from '../lib/inspection';
import { balance, invoiceLabel, invoiceStatus, STATUS_LABEL } from '../lib/invoices';
import { Job, jobName, phoneLink } from '../lib/jobs';
import { jobInvoice, jobSteps, nextStep, onSiteFor, smsLink, StepId } from '../lib/jobSteps';
import { log } from '../lib/log';
import { formatMoney } from '../lib/prices';
import { dayLabel, formatTime, mapsLink, onMyWayText } from '../lib/schedule';
import { useSchedule } from '../lib/useSchedule';
import { currentTotals, signedNow, subtotal } from '../lib/ticket';
import { useInvoices } from '../lib/useInvoices';
import { houseOf, NoteTarget } from '../lib/odooNotes';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';
import { EtaPicker } from '../components/EtaPicker';
import { colors, radius, shadow, touch, type } from '../theme';

type Tab = 'overview' | 'work' | 'photos' | 'notes';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'work', label: 'Work' },
  { id: 'photos', label: 'Photos' },
  { id: 'notes', label: 'Notes' },
];

const STATUS_BUTTONS: [StepId, string][] = [
  ['onMyWay', 'On my way'],
  ['arrived', 'Arrived'],
  ['work', 'Work done'],
  ['paid', 'Paid'],
];

const open = (url: string | undefined) => url && Linking.openURL(url).catch(() => undefined);

/**
 * One job, start to finish. The steps across the top show where it is:
 * On my way, Arrived, Inspect, Ticket, Work, Paid. The big button at the
 * bottom does the next one. Everything else about the job is one tap away.
 */
export function JobHubScreen({ id, now = Date.now }: { id: string; now?: () => number }) {
  const { jobs, loaded, setStep, setStatus } = useJobs();
  const { invoices, business } = useInvoices();
  const { appointments } = useSchedule();
  const [, tick] = useState(0);
  // Which text the minutes picker is for: the On my way button, or an ETA update.
  const [etaPick, setEtaPick] = useState<false | 'omw' | 'eta'>(false);
  const [tab, setTab] = useState<Tab>('overview');
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const job = jobs.find((j) => j.id === id);
  const customer = useJobCustomer(job);
  if (!job) return <Text style={styles.note}>{loaded ? "That job isn't saved on this phone any more." : 'Loading...'}</Text>;

  const visit = appointments.filter((a) => a.jobId === job.id && a.status === 'booked').sort((a, b) => a.start - b.start)[0];
  const steps = jobSteps(job, invoices);
  const next = nextStep(steps);
  const inv = jobInvoice(job, invoices);
  const site = onSiteFor(job.steps?.arrivedAt, now());
  const tel = phoneLink(job.phone);
  const maps = mapsLink(jobAddress(job, customer));

  const go = (step: StepId) => {
    log.info('job', `${job.id} step ${step}`);
    switch (step) {
      case 'onMyWay': {
        // With a phone number, ask how many minutes away first; the step is marked when they pick.
        if (smsLink(job.phone, '')) setEtaPick('omw');
        else setStep(job.id, 'onMyWayAt', now());
        return;
      }
      case 'arrived':
        setStep(job.id, 'arrivedAt', now());
        return;
      case 'inspect':
        router.push({ pathname: '/inspection/[id]', params: { id: job.id } });
        return;
      case 'quote':
        router.push({ pathname: '/ticket/[id]', params: { id: job.id } });
        return;
      case 'work':
        // With a ticket, Create invoice there marks the work done and makes the invoice.
        if (job.ticket?.lines.length && !inv) router.push({ pathname: '/ticket/[id]', params: { id: job.id } });
        else setStep(job.id, 'workDoneAt', now());
        return;
      case 'paid':
        if (inv) router.push({ pathname: '/invoice/[id]', params: { id: inv.id } });
        else router.push({ pathname: '/ticket/[id]', params: { id: job.id } });
        return;
    }
  };

  // The Work done button always works: the job is done and closed (it leaves Home) even when there is no
  // invoice yet or the customer hasn't paid or approved. The invoice is made later from the Ticket; Paid is its own step.
  const workDone = () => {
    log.info('job', `${job.id} work done`);
    if (!job.steps?.workDoneAt) setStep(job.id, 'workDoneAt', now());
    if (job.status !== 'done') setStatus(job.id, 'done');
  };

  return (
    <View style={styles.stack} testID="job-hub">
      <View style={styles.hero} testID="job-hero">
        <View style={styles.chipRow}>
          <Text style={styles.statusChip} testID="job-hub-status">
            {job.status === 'done' && steps.every((x) => x.done) ? 'Finished' : site ? `On site ${site}` : job.steps?.onMyWayAt ? `On the way since ${formatTime(job.steps.onMyWayAt)}` : 'Not started'}
          </Text>
          <CustomerBadgeLine partnerId={customer?.odooId} testID="job-badge" onDark />
        </View>
        <Text style={styles.title} accessibilityRole="header" testID="job-hub-title">
          {jobName(job)}
          {job.what ? ` · ${job.what}` : ''}
        </Text>
        {jobAddress(job, customer) ? <Text style={styles.sub}>{jobAddress(job, customer)}</Text> : null}
        {job.odooJob?.model === 'fsm.order' ? <EquipmentChips orderId={job.odooJob.id} partnerId={customer?.odooId} address={jobAddress(job, customer)} now={now} onDark /> : null}
      </View>
      <View style={styles.row}>
        {tel ? <QuickAction icon="phone" label="Call" onPress={() => open(tel)} testID="job-call" /> : null}
        {smsLink(job.phone, '') ? <QuickAction icon="chat" label="Text" onPress={() => open(smsLink(job.phone, ''))} testID="job-text" /> : null}
        {smsLink(job.phone, '') ? <QuickAction icon="clock" label="ETA" onPress={() => setEtaPick((v) => (v === 'eta' ? false : 'eta'))} testID="job-eta" /> : null}
        {maps ? <QuickAction icon="pin" label="Directions" onPress={() => open(maps)} testID="job-directions" /> : null}
      </View>
      {etaPick ? (
        <EtaPicker
          testID={etaPick === 'omw' ? 'job-omw' : 'job-eta-pick'}
          onPick={(m) => {
            if (etaPick === 'omw') setStep(job.id, 'onMyWayAt', now());
            setEtaPick(false);
            open(smsLink(job.phone, onMyWayText({ name: job.customer }, business, m, etaPick === 'eta' ? 'eta' : undefined)));
          }}
        />
      ) : null}

      <View style={styles.statusRow} accessibilityRole="list" testID="job-steps">
        {STATUS_BUTTONS.map(([id, label]) => {
          const st = steps.find((x) => x.id === id)!;
          const isNext = !st.done && (next?.id === id || (id === 'work' && (next?.id === 'inspect' || next?.id === 'quote')));
          const at = id === 'onMyWay' ? job.steps?.onMyWayAt : id === 'arrived' ? job.steps?.arrivedAt : id === 'work' ? job.steps?.workDoneAt : undefined;
          return (
            <Pressable
              key={id}
              onPress={() => (id === 'work' ? workDone() : go(id))}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${st.done ? 'done' : isNext ? 'next' : 'not yet'}`}
              testID={`job-step-${id}`}
              style={({ pressed }) => [styles.statusBtn, st.done && styles.statusDone, isNext && styles.statusNext, pressed && styles.statusPressed]}
            >
              <Text style={[styles.statusText, isNext && styles.statusTextNext, st.done && styles.statusTextDone]} numberOfLines={1} adjustsFontSizeToFit>
                {st.done ? '✓ ' : ''}
                {label}
              </Text>
              {st.done && at ? <Text style={styles.statusTime}>{formatTime(at)}</Text> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.tabs} accessibilityRole="tablist" testID="job-tabs">
        {TABS.map((t) => (
          <Pressable key={t.id} onPress={() => setTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.id }} testID={`job-tab-${t.id}`} style={[styles.tab, tab === t.id && styles.tabOn]}>
            <Text style={[styles.tabText, tab === t.id && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'overview' ? (
        <>

      <NavRow
        label="Visit"
        detail={visit ? `${dayLabel(visit.start, now())} ${formatTime(visit.start)}${job.odooJob ? ` · ${job.odooJob.name} in Odoo` : ''} · change` : job.odooJob ? `Not booked · ${job.odooJob.name} in Odoo` : 'Not booked · book a time'}
        href={{ pathname: '/schedule', params: { job: job.id } }}
        testID="job-visit"
      />
      {job.customerId ? <NavRow label="Customer" detail={job.customer || 'Their doors and history'} href={{ pathname: '/customer/[id]', params: { id: job.customerId } }} testID="job-open-customer" /> : null}
      {customer?.odooId ? <NavRow label="Address" detail={`${jobAddress(job, customer) || 'No address'} · change`} href={{ pathname: '/job-address/[id]', params: { id: job.id } }} testID="job-open-address" /> : null}
      {job.odooJob?.model === 'fsm.order' ? <HouseCard orderId={job.odooJob.id} partnerId={customer?.odooId} address={jobAddress(job, customer)} now={now} /> : null}
        <JobExtras job={job} partnerId={customer?.odooId} />
        </>
      ) : null}
      {tab === 'work' ? (
        <>
      <NavRow
        label="Inspection"
        detail={job.inspection ? `${checkCounts(job.inspection).done} of ${checkCounts(job.inspection).total} checked · ${checkCounts(job.inspection).fix} flagged` : 'Checklist, photos and signature'}
        href={{ pathname: '/inspection/[id]', params: { id: job.id } }}
        testID="job-open-inspection"
      />
      <NavRow
        label="Ticket"
        detail={ticketDetail(job)}
        href={{ pathname: '/ticket/[id]', params: { id: job.id } }}
        testID="job-open-ticket"
      />
      <JobParts jobId={job.id} />
      {inv ? (
        <NavRow
          label={invoiceLabel(inv)}
          detail={`${STATUS_LABEL[invoiceStatus(inv)]}${balance(inv) > 0 ? ` · ${formatMoney(balance(inv))} owed` : ''}`}
          href={{ pathname: '/invoice/[id]', params: { id: inv.id } }}
          testID="job-open-invoice"
        />
      ) : null}
      <View style={styles.row}>
        {job.steps?.workDoneAt ? <Action label="Undo work done" grow onPress={() => {
          setStep(job.id, 'workDoneAt', undefined);
          if (job.status === 'done') setStatus(job.id, 'open');
        }} testID="job-undo-work" /> : null}
        <Action label={job.status === 'done' ? 'Reopen job' : 'Close job'} grow onPress={() => setStatus(job.id, job.status === 'done' ? 'open' : 'done')} testID="job-close" />
      </View>
        </>
      ) : null}
      {tab === 'photos' ? (
        <>
      <NavRow label="Photos" detail="Before and after" href={{ pathname: '/photos/[id]', params: { id: job.id } }} testID="job-open-photos" />
        </>
      ) : null}
      {tab === 'notes' ? (
        <>
      {job.notes ? (
        <View style={styles.card}>
          <Text style={styles.label}>Notes</Text>
          <Text style={styles.body}>{job.notes}</Text>
        </View>
      ) : null}

      {job.odooJob ? <JobNotes job={job.odooJob} now={now} /> : null}

        </>
      ) : null}
      <Dock>
      {next ? (
        <Action label={nextLabel(next.id, job, !!inv)} primary onPress={() => go(next.id)} testID="job-next" />
      ) : (
        <Text style={styles.done} testID="job-finished">
          Job finished and paid.
        </Text>
      )}
      {next && next.id === 'onMyWay' ? <Action label="Skip, I'm already here" onPress={() => go('arrived')} testID="job-skip-arrived" /> : null}

      </Dock>
    </View>
  );
}

/** The job's notes in Odoo, and the house's (the Field Service location), which every visit there shares. */
function JobNotes({ job, now }: { job: NonNullable<Job['odooJob']>; now: () => number }) {
  const { client } = useOdoo();
  const [house, setHouse] = useState<NoteTarget | null>(null);
  useEffect(() => {
    if (!client) return;
    houseOf(client, job)
      .then(setHouse)
      .catch(() => undefined);
  }, [client, job]);
  const target = useMemo<NoteTarget>(() => ({ model: job.model, id: job.id }), [job.model, job.id]);
  return (
    <>
      <OdooNotes target={target} title="Job notes" now={now} testID="job-notes" />
      {house ? <OdooNotes target={house} title="House notes" now={now} testID="house-notes" /> : null}
    </>
  );
}

/** "3 items · $485", or what to do when the ticket is empty. */
function ticketDetail(job: Job): string {
  const t = job.ticket;
  if (!t || t.lines.length === 0) return 'Services and materials from the price book';
  const shown = currentTotals(t)?.total ?? subtotal(t);
  const est = t.estimateAt ? `Estimate${t.order ? ` ${t.order.name}` : ''} · ` : '';
  const sg = signedNow(t) ? `Signed by ${t.signed!.by || 'customer'} · ` : '';
  return `${est}${sg}${t.lines.length === 1 ? '1 item' : `${t.lines.length} items`} · ${formatMoney(shown)}${currentTotals(t) ? '' : ' before tax'}`;
}

function nextLabel(step: StepId, job: Job, hasInvoice: boolean): string {
  switch (step) {
    case 'onMyWay':
      return job.phone ? 'On my way (text them)' : 'On my way';
    case 'arrived':
      return "I'm here";
    case 'inspect':
      return 'Next: inspect';
    case 'quote':
      return 'Next: build the ticket';
    case 'work':
      return job.ticket?.lines.length && !hasInvoice ? 'Next: create invoice' : 'Work done';
    case 'paid':
      return hasInvoice ? 'Next: get paid' : 'Next: make the invoice';
  }
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  tabs: { flexDirection: 'row', gap: 6 },
  tab: { paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: radius.pill },
  tabOn: { backgroundColor: colors.selected },
  tabText: { fontSize: 15, fontWeight: '700', color: colors.muted },
  tabTextOn: { color: colors.onSelected },
  row: { flexDirection: 'row', gap: 8 },
  hero: { backgroundColor: colors.head, borderRadius: radius.sheet, padding: 16, gap: 6, ...shadow },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  statusChip: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.onHead, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden' },
  title: { fontSize: 24, fontWeight: '800', color: colors.onHead },
  sub: { fontSize: 16, fontWeight: '600', color: colors.onHead, opacity: 0.85 },
  statusRow: { flexDirection: 'row', gap: 6 },
  statusBtn: { flex: 1, minHeight: touch.min, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: radius.field, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line },
  statusDone: { backgroundColor: colors.info, borderColor: colors.info },
  statusNext: { backgroundColor: colors.selected, borderColor: colors.selected },
  statusPressed: { opacity: 0.8 },
  statusText: { fontSize: 15, fontWeight: '800', color: colors.text },
  statusTextNext: { color: colors.onSelected },
  statusTextDone: { color: colors.selected },
  statusTime: { fontSize: 12, fontWeight: '700', color: colors.muted },
  step: { flex: 1, gap: 6 },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.info },
  barDone: { backgroundColor: colors.selected, opacity: 0.55 },
  barNext: { backgroundColor: colors.selected },
  stepText: { fontSize: 13, fontWeight: '800', color: colors.text },
  stepNext: { color: colors.selected, fontWeight: '800' },
  stepLater: { color: colors.muted, fontWeight: '700' },
  done: { fontSize: type.body, fontWeight: '800', color: colors.ok, minHeight: touch.min, textAlignVertical: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: 14, gap: 4, borderWidth: 1, borderColor: colors.line },
  label: { fontSize: 15, fontWeight: '800', color: colors.muted },
  body: { fontSize: type.body, fontWeight: '600', color: colors.text },
  note: { fontSize: type.body, color: colors.muted },
});
