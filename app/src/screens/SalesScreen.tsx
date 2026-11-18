import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { AlertBanner, IconRow, RowGroup } from '../components/ToolRows';
import { followUps } from '../lib/followups';
import { acceptedLabel, jobName } from '../lib/jobs';
import { formatMoney } from '../lib/prices';
import { useFollowUps } from '../lib/useFollowUps';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';
import { useStats } from '../lib/useStats';
import { SyncNowButton } from '../components/SyncNowButton';
import { colors, radius, shadow, type } from '../theme';
import { InvoicesScreen } from './InvoicesScreen';
import { OdooListScreen } from './OdooListScreen';

type View_ = 'invoices' | 'quotes';

/**
 * Sales: what you're owed and took this week, the two things that need
 * action (follow-ups due, quotes the customer said yes to with no invoice
 * yet), then an Invoices / Quotes switch over Odoo's own lists.
 */
export function SalesScreen({ now = Date.now }: { now?: () => number }) {
  const { jobs } = useJobs();
  const { invoices, business } = useInvoices();
  const { settings, dismissed } = useFollowUps();
  const { status, client } = useOdoo();
  const { stats } = useStats(now);
  const [view, setView] = useState<View_>('invoices');
  const [showYes, setShowYes] = useState(false);
  const odoo = status === 'signedIn' && client ? client.session.apps : null;
  const t = now();
  const toInvoice = useMemo(() => jobs.filter((j) => j.accepted && !invoices.some((i) => i.jobId === j.id && !i.voidedAt)), [jobs, invoices]);
  const due = followUps(invoices, settings, business, t, dismissed).filter((f) => f.due <= t + 7 * 24 * 3600 * 1000).length;

  return (
    <View style={styles.stack} testID="sales">
      <View style={styles.money} testID="sales-summary">
        <View>
          <Text style={styles.moneyLabel}>Owed to you</Text>
          <Text style={[styles.moneyBig, stats.owed > 0 && styles.moneyOwed]} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(stats.owed)}
          </Text>
        </View>
        <View style={styles.moneyRight}>
          <Text style={styles.moneyLabel}>Collected this week</Text>
          <Text style={styles.moneyMid}>{formatMoney(stats.week.collected)}</Text>
        </View>
      </View>

      <SyncNowButton label="Sync all" testID="sales-sync-all" />

      {due > 0 ? <AlertBanner testID="sales-followups" title={`${due} follow-up${due === 1 ? '' : 's'} due`} detail="Invoice and quote reminders" action="Review" onPress={() => router.push('/follow-ups')} /> : null}
      {toInvoice.length > 0 ? (
        <AlertBanner testID="sales-said-yes" tone="ok" title={`${toInvoice.length} said yes, no invoice yet`} detail="Make the invoice from the quote" action={showYes ? 'Hide' : 'Open'} onPress={() => setShowYes((v) => !v)} />
      ) : null}
      {showYes && toInvoice.length > 0 ? (
        <RowGroup>
          {toInvoice.map((j, i) => (
            <IconRow
              key={j.id}
              icon="wrap"
              label={jobName(j)}
              detail={`${acceptedLabel(j.accepted!)} · ${formatMoney(j.accepted!.total)}`}
              onPress={() => router.push({ pathname: '/quote/[id]', params: { id: j.id } })}
              testID={`sales-to-invoice-${j.id}`}
              last={i === toInvoice.length - 1}
            />
          ))}
        </RowGroup>
      ) : null}

      <View style={styles.switch} accessibilityRole="tablist">
        <Pressable onPress={() => setView('invoices')} accessibilityRole="tab" accessibilityState={{ selected: view === 'invoices' }} testID="sales-tab-invoices" style={[styles.tab, view === 'invoices' && styles.tabOn]}>
          <Text style={[styles.tabText, view === 'invoices' && styles.tabTextOn]}>Invoices</Text>
        </Pressable>
        <Pressable onPress={() => setView('quotes')} accessibilityRole="tab" accessibilityState={{ selected: view === 'quotes' }} testID="sales-odoo-quotations" style={[styles.tab, view === 'quotes' && styles.tabOn]}>
          <Text style={[styles.tabText, view === 'quotes' && styles.tabTextOn]}>Work orders</Text>
        </Pressable>
      </View>

      {view === 'invoices' ? (
        <>
          <InvoicesScreen now={now} />
          <Text style={styles.meta}>{odoo?.invoicing ? 'Invoices made on the phone go to Odoo on their own once there is signal.' : 'Sign in to Odoo (Jobs › Team) to see and send invoices there.'}</Text>
        </>
      ) : (
        <View testID="sales-quotes">
          <OdooListScreen kind="quotations" now={now} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  meta: { fontSize: 15, fontWeight: '600', color: colors.muted },
  money: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.card, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, ...shadow },
  moneyRight: { alignItems: 'flex-end' },
  moneyLabel: { fontSize: 14, fontWeight: '700', color: colors.muted },
  moneyBig: { fontSize: type.big, fontWeight: '800', color: colors.text },
  moneyOwed: { color: colors.stop },
  moneyMid: { fontSize: type.value, fontWeight: '800', color: colors.text },
  switch: { flexDirection: 'row', backgroundColor: colors.info, borderRadius: radius.field, padding: 4, gap: 4 },
  tab: { flex: 1, minHeight: 48, borderRadius: radius.field - 3, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.selected },
  tabText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  tabTextOn: { color: colors.onSelected },
});
