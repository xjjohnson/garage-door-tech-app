import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavRow } from '../components/Buttons';
import { SectionTitle } from '../components/controls';
import { followUps } from '../lib/followups';
import { jobName } from '../lib/jobs';
import { formatMoney, TIER_LABEL } from '../lib/prices';
import { useFollowUps } from '../lib/useFollowUps';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { colors } from '../theme';
import { InvoicesScreen } from './InvoicesScreen';

/**
 * Sales: quotes the customer said yes to that still need an invoice,
 * follow-ups that are due, then every invoice with what's owed.
 */
export function SalesScreen({ now = Date.now }: { now?: () => number }) {
  const { jobs } = useJobs();
  const { invoices, business } = useInvoices();
  const { settings, dismissed } = useFollowUps();
  const t = now();
  const toInvoice = useMemo(() => jobs.filter((j) => j.accepted && !invoices.some((i) => i.jobId === j.id && !i.voidedAt)), [jobs, invoices]);
  const due = followUps(invoices, settings, business, t, dismissed).filter((f) => f.due <= t + 7 * 24 * 3600 * 1000).length;

  return (
    <View style={styles.stack} testID="sales">
      <NavRow label="Follow-ups" detail="Invoice and quote reminders, texted by you" badge={due ? `${due} due` : undefined} href="/follow-ups" testID="sales-followups" />
      <NavRow label="Price sheet" detail="Parts and labor for quotes" href="/price-sheet" testID="sales-price-sheet" />
      {toInvoice.length > 0 ? (
        <>
          <SectionTitle>Said yes, no invoice yet</SectionTitle>
          {toInvoice.map((j) => (
            <NavRow
              key={j.id}
              label={jobName(j)}
              detail={`${TIER_LABEL[j.accepted!.tier]} · ${formatMoney(j.accepted!.total)}`}
              onPress={() => router.push({ pathname: '/quote/[id]', params: { id: j.id } })}
              testID={`sales-to-invoice-${j.id}`}
            />
          ))}
        </>
      ) : null}
      <SectionTitle>Invoices</SectionTitle>
      <InvoicesScreen />
      <Text style={styles.meta}>Quotes and invoices go to Odoo Sales and Invoicing from each quote and invoice.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  meta: { fontSize: 15, fontWeight: '600', color: colors.muted },
});
