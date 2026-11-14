import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Action, NavRow } from '../components/Buttons';
import { SectionTitle } from '../components/controls';
import { CustomerBadgeLine, HouseCard } from '../components/HouseHistory';
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
import { currentTotals, subtotal } from '../lib/ticket';
import { useInvoices } from '../lib/useInvoices';
import { houseOf, NoteTarget } from '../lib/odooNotes';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';
import { colors, touch, type } from '../theme';

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
        setStep(job.id, 'onMyWayAt', now());
        open(smsLink(job.phone, onMyWayText({ name: job.customer }, business.name, 15)));
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

  return (
    <View style={styles.stack} testID="job-hub">
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header" testID="job-hub-title">
          {jobName(job)}
          {job.what ? ` · ${job.what}` : ''}
        </Text>
        {jobAddress(job, customer) ? <Text style={styles.sub}>{jobAddress(job, customer)}</Text> : null}
        <CustomerBadgeLine partnerId={customer?.odooId} testID="job-badge" />
        <Text style={styles.sub} testID="job-hub-status">
          {job.status === 'done' && steps.every((x) => x.done) ? 'Finished' : site ? `On site ${site}` : job.steps?.onMyWayAt ? `On the way since ${formatTime(job.steps.onMyWayAt)}` : 'Not started'}
        </Text>
      </View>
      <View style={styles.row}>
        {tel ? <Action label="Call" grow onPress={() => open(tel)} testID="job-call" /> : null}
        {smsLink(job.phone, '') ? <Action label="Text" grow onPress={() => open(smsLink(job.phone, ''))} testID="job-text" /> : null}
        {maps ? <Action label="Directions" grow onPress={() => open(maps)} testID="job-directions" /> : null}
      </View>

      <View style={styles.steps} accessibilityRole="list" testID="job-steps">
        {steps.map((st) => {
          const isNext = next?.id === st.id;
          return (
            <View key={st.id} style={styles.step} accessibilityLabel={`${st.label}, ${st.done ? 'done' : isNext ? 'next' : 'not yet'}`} testID={`job-step-${st.id}`}>
              <View style={[styles.bar, st.done && styles.barDone, isNext && styles.barNext]} />
              <Text style={[styles.stepText, isNext && styles.stepNext, !st.done && !isNext && styles.stepLater]} numberOfLines={1} adjustsFontSizeToFit>
                {st.label}
              </Text>
            </View>
          );
        })}
      </View>

      {next ? (
        <Action label={nextLabel(next.id, job, !!inv)} primary onPress={() => go(next.id)} testID="job-next" />
      ) : (
        <Text style={styles.done} testID="job-finished">
          Job finished and paid.
        </Text>
      )}
      {next && next.id === 'onMyWay' ? <Action label="Skip, I'm already here" onPress={() => go('arrived')} testID="job-skip-arrived" /> : null}

      <SectionTitle>The job</SectionTitle>
      <NavRow
        label="Visit"
        detail={visit ? `${dayLabel(visit.start, now())} ${formatTime(visit.start)}${job.odooJob ? ` · ${job.odooJob.name} in Odoo` : ''} · change` : job.odooJob ? `Not booked · ${job.odooJob.name} in Odoo` : 'Not booked · book a time'}
        href={{ pathname: '/schedule', params: { job: job.id } }}
        testID="job-visit"
      />
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
      <NavRow label="Photos" detail="Before and after" href={{ pathname: '/photos/[id]', params: { id: job.id } }} testID="job-open-photos" />
      <JobParts jobId={job.id} />
      {inv ? (
        <NavRow
          label={invoiceLabel(inv)}
          detail={`${STATUS_LABEL[invoiceStatus(inv)]}${balance(inv) > 0 ? ` · ${formatMoney(balance(inv))} owed` : ''}`}
          href={{ pathname: '/invoice/[id]', params: { id: inv.id } }}
          testID="job-open-invoice"
        />
      ) : null}
      {job.customerId ? <NavRow label="Customer" detail={job.customer || 'Their doors and history'} href={{ pathname: '/customer/[id]', params: { id: job.customerId } }} testID="job-open-customer" /> : null}
      {customer?.odooId ? <NavRow label="Address" detail={`${jobAddress(job, customer) || 'No address'} · change`} href={{ pathname: '/job-address/[id]', params: { id: job.id } }} testID="job-open-address" /> : null}
      {job.odooJob?.model === 'fsm.order' ? <HouseCard orderId={job.odooJob.id} now={now} /> : null}
      {job.notes ? (
        <View style={styles.card}>
          <Text style={styles.label}>Notes</Text>
          <Text style={styles.body}>{job.notes}</Text>
        </View>
      ) : null}

      {job.odooJob ? <JobNotes job={job.odooJob} now={now} /> : null}

      <View style={styles.row}>
        {job.steps?.workDoneAt ? <Action label="Undo work done" grow onPress={() => setStep(job.id, 'workDoneAt', undefined)} testID="job-undo-work" /> : null}
        <Action label={job.status === 'done' ? 'Reopen job' : 'Close job'} grow onPress={() => setStatus(job.id, job.status === 'done' ? 'open' : 'done')} testID="job-close" />
      </View>
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
  return `${est}${t.lines.length === 1 ? '1 item' : `${t.lines.length} items`} · ${formatMoney(shown)}${currentTotals(t) ? '' : ' before tax'}`;
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
  row: { flexDirection: 'row', gap: 8 },
  head: { gap: 2 },
  title: { fontSize: 26, fontWeight: '900', color: colors.text },
  sub: { fontSize: 17, fontWeight: '700', color: colors.muted },
  steps: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  step: { flex: 1, gap: 6 },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.info },
  barDone: { backgroundColor: colors.text },
  barNext: { backgroundColor: colors.brand },
  stepText: { fontSize: 13, fontWeight: '800', color: colors.text },
  stepNext: { color: colors.brand, fontWeight: '900' },
  stepLater: { color: colors.muted, fontWeight: '700' },
  done: { fontSize: type.body, fontWeight: '900', color: colors.ok, minHeight: touch.min, textAlignVertical: 'center' },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 4 },
  label: { fontSize: 15, fontWeight: '900', color: colors.muted },
  body: { fontSize: type.body, fontWeight: '600', color: colors.text },
  note: { fontSize: type.body, color: colors.muted },
});
