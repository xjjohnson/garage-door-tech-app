import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SectionTitle } from '../components/controls';
import { PAY_LABEL, PAY_METHODS } from '../lib/invoices';
import { formatJobDate } from '../lib/jobs';
import { formatMoney } from '../lib/prices';
import { monthLabel, percent, PeriodStats, snapshot } from '../lib/stats';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { colors, touch, type } from '../theme';

/** The short version, at the top of Jobs: open jobs, owed, and collected this week. Taps through to the full page. */
export function StatsCard({ now = Date.now }: { now?: () => number }) {
  const { jobs } = useJobs();
  const { invoices } = useInvoices();
  const s = useMemo(() => snapshot(jobs, invoices, now()), [jobs, invoices, now]);
  return (
    <Pressable
      onPress={() => router.push('/stats')}
      accessibilityRole="button"
      accessibilityHint="Opens the business numbers"
      testID="stats-card"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Tile label="Open jobs" value={String(s.openJobs)} />
      <Tile label="Owed to you" value={formatMoney(s.owed)} alert={s.owed > 0} />
      <Tile label="This week" value={formatMoney(s.week.collected)} />
    </Pressable>
  );
}

function Tile({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, alert && styles.alert]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

/** How the business is doing, from what's saved on this phone. */
export function StatsScreen({ now = Date.now }: { now?: () => number }) {
  const { jobs } = useJobs();
  const { invoices } = useInvoices();
  const s = useMemo(() => snapshot(jobs, invoices, now()), [jobs, invoices, now]);
  const top = Math.max(1, ...s.months.map((m) => m.collected));

  return (
    <View style={styles.stack} testID="stats">
      <View style={styles.row}>
        <Tile label="Open jobs" value={String(s.openJobs)} />
        <Tile label={`Owed on ${s.owedInvoices} invoice${s.owedInvoices === 1 ? '' : 's'}`} value={formatMoney(s.owed)} alert={s.owed > 0} />
      </View>
      {s.oldestOwed ? (
        <Pressable
          onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: s.oldestOwed!.id } })}
          accessibilityRole="button"
          testID="stats-oldest"
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>
            Oldest unpaid: {s.oldestOwed.number}, {s.oldestOwed.billTo || 'customer'}, since {formatJobDate(s.oldestOwed.createdAt)}
          </Text>
        </Pressable>
      ) : null}

      <Period title="This week" p={s.week} testID="stats-week" />
      <Period title="This month" p={s.month} testID="stats-month" />

      <SectionTitle>Collected by month</SectionTitle>
      <View style={styles.chart} testID="stats-chart" accessibilityLabel={s.months.map((m) => `${monthLabel(m.start)} ${formatMoney(m.collected)}`).join(', ')} accessible>
        {s.months.map((m) => (
          <View key={m.start} style={styles.barCol}>
            <Text style={styles.barValue} numberOfLines={1} adjustsFontSizeToFit>
              {m.collected > 0 ? formatMoney(Math.round(m.collected / 100) * 100) : ''}
            </Text>
            <View style={styles.barTrack}>
              <View style={[styles.bar, { height: `${(m.collected / top) * 100}%` }]} />
            </View>
            <Text style={styles.barLabel}>{monthLabel(m.start)}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.note}>Counted from the jobs, quotes and invoices on this phone.</Text>
    </View>
  );
}

function Period({ title, p, testID }: { title: string; p: PeriodStats; testID: string }) {
  const methods = PAY_METHODS.filter((m) => p.byMethod[m] > 0);
  return (
    <View style={styles.period} testID={testID}>
      <Text style={styles.periodTitle}>{title}</Text>
      <Line label="Collected" value={formatMoney(p.collected)} bold />
      {methods.map((m) => (
        <Line key={m} label={`   ${PAY_LABEL[m]}`} value={formatMoney(p.byMethod[m])} />
      ))}
      <Line label={`Invoiced (${p.invoices})`} value={formatMoney(p.invoiced)} />
      <Line label="Average ticket" value={p.averageTicket === null ? '—' : formatMoney(p.averageTicket)} />
      <Line label="Jobs saved" value={String(p.jobsSaved)} />
      <Line label="Quotes accepted" value={`${p.accepted} (${percent(p.closeRate)} of jobs)`} />
    </View>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.lineValue, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  card: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card, minHeight: touch.bar },
  row: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, padding: 6 },
  tileValue: { fontSize: type.value, fontWeight: '900', color: colors.text },
  tileLabel: { fontSize: 15, fontWeight: '700', color: colors.muted, textAlign: 'center' },
  alert: { color: colors.stop },
  period: { padding: 14, borderRadius: 12, borderWidth: 2, borderColor: colors.border, gap: 6 },
  periodTitle: { fontSize: type.value, fontWeight: '900', color: colors.text },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineLabel: { flex: 1, fontSize: type.body, color: colors.text },
  lineValue: { fontSize: type.body, fontWeight: '800', color: colors.text },
  bold: { fontWeight: '900' },
  chart: { flexDirection: 'row', gap: 6, height: 200, alignItems: 'stretch', padding: 8, borderRadius: 12, borderWidth: 2, borderColor: colors.border },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barValue: { fontSize: 13, fontWeight: '800', color: colors.text },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: colors.selected, borderTopLeftRadius: 4, borderTopRightRadius: 4, minHeight: 2 },
  barLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  pressed: { backgroundColor: colors.safety },
});
