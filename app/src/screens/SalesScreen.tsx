import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavRow } from '../components/Buttons';
import { SectionTitle } from '../components/controls';
import { followUps } from '../lib/followups';
import { jobName } from '../lib/jobs';
import { formatMoney, TIER_LABEL } from '../lib/prices';
import { useFollowUps } from '../lib/useFollowUps';
import { useFollowUpInvoices } from '../lib/useFollowUpInvoices';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';
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
  const followInvoices = useFollowUpInvoices();
  const { status, client } = useOdoo();
  const odoo = status === 'signedIn' && client ? client.session.apps : null;
  const t = now();
  const toInvoice = useMemo(() => jobs.filter((j) => j.accepted && !invoices.some((i) => i.jobId === j.id && !i.voidedAt)), [jobs, invoices]);
  const due = followUps(followInvoices, settings, business, t, dismissed).filter((f) => f.due <= t + 7 * 24 * 3600 * 1000).length;

  return (
    <View style={styles.stack} testID="sales">
      <NavRow label="Follow-ups" detail="Invoice and quote reminders, texted by you" badge={due ? `${due} due` : undefined} href="/follow-ups" testID="sales-followups" />
      <NavRow label="Price book" detail="Odoo's products and prices, and your estimate prices" href="/price-book" testID="sales-price-book" />
      {odoo?.sales ? <NavRow label="Odoo quotations" detail="Every quotation and sales order in Odoo" href="/odoo-list/quotations" testID="sales-odoo-quotations" /> : null}
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
      <SectionTitle>{odoo?.invoicing ? 'Invoices in Odoo' : 'Invoices on this phone'}</SectionTitle>
      <InvoicesScreen now={now} />
      <Text style={styles.meta}>{odoo?.invoicing ? 'Invoices made on the phone go to Odoo on their own once there is signal.' : 'Sign in to Odoo (Jobs › Team) to see and send invoices there.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  meta: { fontSize: 15, fontWeight: '600', color: colors.muted },
});
