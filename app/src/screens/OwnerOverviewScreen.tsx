import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Text } from '../components/AppText';
import { Card, Meta, money, Note, Title } from '../components/Dept';
import { CountBadge } from '../components/SectionMenu';
import { usePageRows } from '../components/DeptRows';
import { overviewGroups, ROUTE } from '../lib/ownerOverview';
import { odooPaymentsFor } from '../lib/odooPayments';
import { startOfDay, addDays } from '../lib/schedule';
import { useBadges } from '../lib/useBadges';
import { useDepartments } from '../lib/useDepartments';
import { useOdoo } from '../lib/useOdoo';
import { colors, radius, bw, fs, sz, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

/** The owner's day: money in, jobs done, who is working, then every list that needs a look. */
export function OwnerOverviewScreen({ now = Date.now }: { now?: () => number }) {
  const styles = useStyles();
  const { client, status } = useOdoo();
  const { access, ready } = useDepartments();
  const badges = useBadges();
  const { data } = usePageRows(async () => {
    if (!client) return null;
    const day = startOfDay(now());
    const safe = <T,>(p: Promise<T>, d: T) => p.catch(() => d);
    const [pay, done, tomorrow, clocked] = await Promise.all([
      safe(odooPaymentsFor(client, day), null),
      safe(client.call('fsm.order', 'search_count', [[['stage_id.is_closed', '=', true], ['date_end', '>=', new Date(day).toISOString().slice(0, 19).replace('T', ' ')]]]).then(Number), null),
      safe(client.jobsPlannedBetween(addDays(day, 1), addDays(day, 2)).then((l) => l.length), null),
      safe(client.call('hr.attendance', 'search_count', [[['check_out', '=', false]]]).then(Number), null),
    ]);
    const collected = pay ? Object.values(pay.byMethod).reduce((n, v) => n + v, 0) + pay.other : null;
    return { collected, done, tomorrow, clocked };
  }, [client]);

  if (status === 'loading' || status === 'signingIn' || (client && !ready)) return <Note>Checking your Odoo access…</Note>;
  if (!client) return <Note testID="overview-signin">Sign in to Odoo to see the overview.</Note>;
  if (!access.owner) {
    return (
      <Card testID="overview-no-access">
        <Title>For the owner</Title>
        <Note>The overview is for the owner.</Note>
      </Card>
    );
  }
  const groups = overviewGroups(badges);
  const today = [data?.collected != null ? `Collected today ${money(data.collected)}` : '', data?.done != null ? `${data.done} job${data.done === 1 ? '' : 's'} done` : '', data?.tomorrow != null ? `${data.tomorrow} booked tomorrow` : '', data?.clocked != null ? `${data.clocked} clocked in` : ''].filter(Boolean);
  return (
    <View style={styles.stack} testID="overview">
      <Card testID="overview-today">
        <Title>Today</Title>
        {today.length ? today.map((t) => <Meta key={t}>{t}</Meta>) : <Meta>Reading Odoo…</Meta>}
      </Card>
      {groups.length === 0 ? <Note testID="overview-quiet">Nothing needs you right now.</Note> : null}
      {groups.map((g) => (
        <View key={g.area} testID={`overview-${g.area}`}>
          <Text style={styles.heading} accessibilityRole="header">
            {g.title}
          </Text>
          <View style={styles.card}>
            {g.lines.map((l, i) => (
              <Pressable key={l.label} onPress={() => router.push(ROUTE[g.area] as never)} accessibilityRole="button" testID={`overview-${g.area}-${l.tab}`} style={[styles.row, i > 0 && styles.line]}>
                <Text style={styles.label}>{l.label}</Text>
                <CountBadge n={l.n} />
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <Pressable onPress={() => router.push('/stats')} accessibilityRole="button" testID="overview-stats" style={styles.link}>
        <Text style={styles.label}>Business numbers ›</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/scorecard')} accessibilityRole="button" testID="overview-scorecard" style={styles.link}>
        <Text style={styles.label}>Tech scorecard ›</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: sp(12) },
  heading: { fontSize: fs(13), fontWeight: '800', letterSpacing: 1, color: colors.muted, textTransform: 'uppercase', paddingHorizontal: sp(4), paddingBottom: sp(6), paddingTop: sp(4) },
  card: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: bw(1), borderColor: colors.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: sp(10), paddingHorizontal: sp(16), paddingVertical: sp(14), minHeight: sz(52) },
  line: { borderTopWidth: 1, borderTopColor: colors.line },
  label: { flex: 1, fontSize: fs(18), fontWeight: '800', color: colors.text },
  chevron: { fontSize: fs(26), color: colors.muted },
  link: { minHeight: sz(52), justifyContent: 'center', paddingHorizontal: sp(16), borderRadius: radius.card, backgroundColor: colors.card, borderWidth: bw(1), borderColor: colors.line },
}));
