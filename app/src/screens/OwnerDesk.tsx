/**
 * The owner's own screens: Home (the money board and what needs the owner), Money, Areas and Manage.
 * Every number is read from Odoo (or the numbers the app already counted); nothing is kept on the
 * phone and nothing is written here. Each row opens the full screen that already does the work, so
 * the owner can still do everything.
 */
import { router } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../components/AppText';
import { CrewToday } from '../components/CrewToday';
import { money as exact, Note } from '../components/Dept';
import { usePageRows } from '../components/DeptRows';
import { CountBadge } from '../components/SectionMenu';
import { Caption, IconRow, RowGroup } from '../components/ToolRows';
import { dispatchTotal, officeTotal, purchasingTotal, salesTotal } from '../lib/deptBadges';
import { overviewGroups, ROUTE } from '../lib/ownerOverview';
import { ageBuckets, changePercent, clockedIn, dollars as money } from '../lib/ownerMoney';
import { quotesWaiting, unpaidInvoices } from '../lib/odooOffice';
import { costWentUp } from '../lib/odooPurchasing';
import { addDays, startOfDay } from '../lib/schedule';
import { useBadges } from '../lib/useBadges';
import { useOdoo } from '../lib/useOdoo';
import { useStats } from '../lib/useStats';
import { bw, colors, fs, isDark, radius, shadow, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

const GOLD = isDark ? '#E3B341' : '#3A2F0F';

function Signin({ what }: { what: string }) {
  return <Note testID="owner-signin">Sign in to Odoo to see {what}. Everything here is read from Odoo.</Note>;
}

function Big({ value, label, sub, bad, good, testID, onPress }: { value: string; label: string; sub?: string; bad?: boolean; good?: boolean; testID?: string; onPress?: () => void }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} testID={testID} style={styles.big}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.bigValue}>{value}</Text>
      {sub ? <Text style={[styles.sub, bad && styles.bad, good && styles.good]}>{sub}</Text> : null}
    </Pressable>
  );
}

function Panel({ title, badge, children, testID, alert }: { title: string; badge?: number; children: ReactNode; testID?: string; alert?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.panel, alert && styles.panelAlert]} testID={testID}>
      <View style={styles.panelHead}>
        <Text style={styles.label} accessibilityRole="header">
          {title}
        </Text>
        {badge ? <CountBadge n={badge} /> : null}
      </View>
      {children}
    </View>
  );
}

function Line({ text, detail, action, onPress, bad, testID, last }: { text: string; detail?: string; action?: string; onPress: () => void; bad?: boolean; testID?: string; last?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={[styles.line, !last && styles.lineTop]}>
      <View style={styles.grow}>
        <Text style={styles.lineText} numberOfLines={1}>
          {text}
        </Text>
        {detail ? <Text style={[styles.sub, bad && styles.bad]}>{detail}</Text> : null}
      </View>
      {action ? (
        <View style={styles.pill}>
          <Text style={styles.pillText}>{action}</Text>
        </View>
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </Pressable>
  );
}

/** Home: money first, then the one list of things only the owner can decide. */
export function OwnerHome({ now = Date.now }: { now?: () => number }) {
  const styles = useStyles();
  const { client } = useOdoo();
  const badges = useBadges();
  const { stats } = useStats(now);
  const { data } = usePageRows(async () => {
    if (!client) return null;
    const day = startOfDay(now());
    const safe = <T,>(p: Promise<T>, d: T) => p.catch(() => d);
    const [rises, unpaid, done, clocked, tomorrow] = await Promise.all([
      safe(costWentUp(client, now()), []),
      safe(unpaidInvoices(client, now()), []),
      safe(client.call('fsm.order', 'search_count', [[['stage_id.is_closed', '=', true], ['date_end', '>=', new Date(day).toISOString().slice(0, 19).replace('T', ' ')]]]).then(Number), null),
      safe(clockedIn(client), null),
      safe(client.jobsPlannedBetween(addDays(day, 1), addDays(day, 2)).then((l) => l.length), null),
    ]);
    return { rises, unpaid, done, clocked, tomorrow };
  }, [client]);
  if (!client) return <Signin what="your numbers" />;
  const month = stats.month.collected;
  const last = stats.months.length > 1 ? stats.months[stats.months.length - 2].collected : 0;
  const change = changePercent(month, last);
  const late = data ? ageBuckets(data.unpaid).late : 0;
  const days = stats.days ?? [];
  const top = Math.max(1, ...days.map((d) => d.collected));
  const groups = overviewGroups(badges);
  const rises = data?.rises ?? [];
  const need = groups.reduce((n, g) => n + g.lines.length, 0) + (rises.length > 0 ? 1 : 0);
  return (
    <View style={styles.stack} testID="owner-home">
      <View style={styles.pair}>
        <Big value={money(month)} label="Collected this month" sub={change === null ? undefined : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}% vs last month`} good={change !== null && change >= 0} bad={change !== null && change < 0} testID="owner-collected" onPress={() => router.push('/stats')} />
        <Big value={money(stats.owed)} label="Owed to you" sub={late > 0 ? `${money(late)} over 30 days` : `${stats.owedInvoices} unpaid`} bad={late > 0} testID="owner-owed" onPress={() => router.navigate('/money')} />
      </View>
      {days.length > 0 ? (
        <Panel title="Collected, last 7 days" testID="owner-chart">
          <View style={styles.bars} accessibilityLabel="Money collected in the last seven days">
            {days.map((d, i) => (
              <View key={d.start} style={styles.barCol}>
                <View style={[styles.bar, i === days.length - 1 && styles.barToday, { height: Math.max(3, Math.round((d.collected / top) * 56)) }]} />
                <Text style={styles.sub}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(d.start).getDay()]}</Text>
              </View>
            ))}
          </View>
        </Panel>
      ) : null}
      <Panel title="Needs your OK" badge={need} alert={need > 0} testID="owner-needs">
        {need === 0 ? <Text style={styles.sub}>Nothing needs you right now.</Text> : null}
        {rises.length > 0 ? <Line text={`Cost went up on ${rises.length} part${rises.length === 1 ? '' : 's'}`} detail={`${rises[0].name}: ${exact(rises[0].costCents)} to ${exact(rises[0].paidCents)}`} action="Review" onPress={() => router.push('/purchasing')} testID="owner-need-cost" /> : null}
        {groups.flatMap((g) => g.lines.map((l) => ({ g, l }))).slice(0, 6).map(({ g, l }, i, all) => (
          <Line key={`${g.area}-${l.tab}`} text={`${l.label} · ${l.n}`} detail={g.title} action="Open" onPress={() => router.push(ROUTE[g.area] as never)} testID={`owner-need-${g.area}-${l.tab}`} last={i === all.length - 1} />
        ))}
      </Panel>
      <Panel title="Today" testID="owner-today">
        <Text style={styles.lineText}>
          {[data?.done != null ? `${data.done} job${data.done === 1 ? '' : 's'} done` : '', data?.clocked != null ? `${data.clocked} clocked in` : '', data?.tomorrow != null ? `${data.tomorrow} booked tomorrow` : ''].filter(Boolean).join(' · ') || 'Reading Odoo…'}
        </Text>
      </Panel>
      <CrewToday now={now} />
    </View>
  );
}

/** Money: what came in, what is owed by age, who to chase, and the quotes out. */
export function OwnerMoney({ now = Date.now }: { now?: () => number }) {
  const styles = useStyles();
  const { client } = useOdoo();
  const { stats } = useStats(now);
  const { data } = usePageRows(async () => {
    if (!client) return null;
    const safe = <T,>(p: Promise<T>) => p.catch(() => []) as Promise<T>;
    const [unpaid, quotes] = await Promise.all([safe(unpaidInvoices(client, now())), safe(quotesWaiting(client, now()))]);
    return { unpaid, quotes };
  }, [client]);
  if (!client) return <Signin what="your money" />;
  const b = data ? ageBuckets(data.unpaid) : null;
  const chase = data ? [...data.unpaid].filter((r) => r.days > 0).sort((a, c) => c.days - a.days).slice(0, 5) : [];
  const quoteTotal = data ? data.quotes.reduce((n, r) => n + r.cents, 0) : 0;
  return (
    <View style={styles.stack} testID="owner-money">
      <View style={styles.pair}>
        <Big value={money(stats.week.collected)} label="Collected this week" testID="owner-money-week" />
        <Big value={money(stats.month.collected)} label="Collected this month" testID="owner-money-month" />
      </View>
      <View style={styles.pair}>
        <Big value={money(stats.owed)} label="Owed to you" sub={`${stats.owedInvoices} invoice${stats.owedInvoices === 1 ? '' : 's'}`} testID="owner-money-owed" />
        <Big value={data ? money(quoteTotal) : '…'} label="Quotes out" sub={data ? `${data.quotes.length} waiting` : undefined} testID="owner-money-quotes" />
      </View>
      <Panel title="Owed, by age" testID="owner-ages">
        {b ? (
          <>
            <AgeLine color={colors.ok} label="Not late yet" cents={b.current} />
            <AgeLine color={colors.caution} label="1 to 30 days late" cents={b.late30} />
            <AgeLine color={colors.stop} label="Over 30 days late" cents={b.late} bad />
          </>
        ) : (
          <Text style={styles.sub}>Reading Odoo…</Text>
        )}
      </Panel>
      <Panel title="Who to chase" testID="owner-chase">
        {chase.length === 0 ? <Text style={styles.sub}>{data ? 'Nobody is late.' : 'Reading Odoo…'}</Text> : null}
        {chase.map((r, i) => (
          <Line key={`${r.model}-${r.id}`} text={r.customer || r.name} detail={`${r.text} · ${money(r.cents)}`} bad={r.days > 30} action="Open" onPress={() => router.push('/office')} testID={`owner-chase-${r.id}`} last={i === chase.length - 1} />
        ))}
      </Panel>
      <Caption>All the money pages</Caption>
      <RowGroup>
        <IconRow icon="dollar" label="Invoices, payments and quotes" detail="Overdue, to invoice, record a payment" href="/office" testID="owner-money-office" />
        <IconRow icon="star" label="Sales" detail="Quotes gone quiet and follow-ups" href="/sales-area" testID="owner-money-sales" />
        <IconRow icon="chart" label="Business numbers" detail="Month by month, close rate, average ticket" href="/stats" testID="owner-money-stats" />
        <IconRow icon="tag" label="Price book and purchasing" detail="Costs, prices and what to order" href="/purchasing" testID="owner-money-purchasing" last />
      </RowGroup>
    </View>
  );
}

function AgeLine({ color, label, cents, bad }: { color: string; label: string; cents: number; bad?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.age}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.lineText, styles.grow]}>{label}</Text>
      <Text style={[styles.ageValue, bad && cents > 0 && styles.bad]}>{money(cents)}</Text>
    </View>
  );
}

/** Areas: one tile per area with its colored light and key number, then everything else to open. */
export function OwnerAreas() {
  const styles = useStyles();
  const b = useBadges();
  const tiles: { id: string; title: string; n: number; sub: string; href: string }[] = [
    { id: 'dispatch', title: 'Dispatch', n: dispatchTotal(b), sub: b.dispatch.unassigned > 0 ? `${b.dispatch.unassigned} with no tech` : 'jobs and techs', href: '/dispatch' },
    { id: 'office', title: 'Office', n: officeTotal(b), sub: b.office.overdue > 0 ? `${b.office.overdue} overdue` : 'money and people', href: '/office' },
    { id: 'sales', title: 'Sales', n: salesTotal(b), sub: b.sales.quiet > 0 ? `${b.sales.quiet} quotes quiet` : 'quotes and follow-ups', href: '/sales-area' },
    { id: 'warehouse', title: 'Warehouse', n: b.warehouse.receive + b.warehouse.handOver, sub: b.warehouse.receive > 0 ? `${b.warehouse.receive} to receive` : b.warehouse.handOver > 0 ? `${b.warehouse.handOver} ready for a tech` : 'nothing to receive', href: '/warehouse' },
    { id: 'purchasing', title: 'Purchasing', n: purchasingTotal(b), sub: b.purchasing.drafts > 0 ? `${b.purchasing.drafts} orders to review` : b.purchasing.requests > 0 ? `${b.purchasing.requests} parts asked for` : 'orders and costs', href: '/purchasing' },
    { id: 'overview', title: 'Everything', n: 0, sub: 'one list of all of it', href: '/overview' },
  ];
  return (
    <View style={styles.stack} testID="owner-areas">
      <View style={styles.tiles}>
        {tiles.map((t) => (
          <Pressable key={t.id} onPress={() => router.push(t.href as never)} accessibilityRole="button" accessibilityLabel={`${t.title}, ${t.n > 0 ? `${t.n} need a look` : 'all clear'}`} testID={`owner-area-${t.id}`} style={styles.tile}>
            <View style={styles.tileHead}>
              <View style={[styles.dot, { backgroundColor: t.id === 'overview' ? colors.muted : t.n === 0 ? colors.ok : t.n > 4 ? colors.stop : colors.caution }]} />
              <Text style={styles.tileTitle}>{t.title}</Text>
            </View>
            <Text style={styles.tileValue}>{t.id === 'overview' ? '›' : t.n === 0 ? 'OK' : String(t.n)}</Text>
            <Text style={styles.sub}>{t.sub}</Text>
          </Pressable>
        ))}
      </View>
      <Caption>Also here</Caption>
      <RowGroup>
        <IconRow icon="users" label="Customers" detail="Doors, history and contact" onPress={() => router.navigate('/customers')} testID="owner-areas-customers" />
        <IconRow icon="star" label="Sales list" detail="Owed, quotes and follow-ups" onPress={() => router.navigate('/sales')} testID="owner-areas-sales-tab" />
        <IconRow icon="bell" label="Follow-ups" detail="Warranty and tune-up calls" href="/follow-ups" testID="owner-areas-followups" />
        <IconRow icon="cal" label="Schedule" detail="Book and move visits" href="/schedule" testID="owner-areas-schedule" />
        <IconRow icon="truck" label="Truck stock and time" detail="Parts on the truck, clock in and out" href="/stock" testID="owner-areas-stock" />
        <IconRow icon="calc" label="Tools" detail="Spring calculator, door weight, manuals, diagnose" onPress={() => router.navigate('/tools')} testID="owner-areas-tools" last />
      </RowGroup>
    </View>
  );
}

/** Manage: what needs the owner's approval, then all the setup. */
export function OwnerManage({ now = Date.now }: { now?: () => number }) {
  const styles = useStyles();
  const { client } = useOdoo();
  const { data } = usePageRows(async () => (client ? (await costWentUp(client, now()).catch(() => [])).length : null), [client]);
  return (
    <View style={styles.stack} testID="owner-manage">
      <Caption>Approvals</Caption>
      <RowGroup>
        <IconRow icon="warn" label="Cost changes" detail="Parts that cost more than the price book says" href="/purchasing" badge={data ? `${data} to review` : undefined} warn={!!data} testID="owner-manage-costs" />
        <IconRow icon="clock" label="Time sheets and hours" detail="Who is on the clock and the hours worked" href="/office" testID="owner-manage-hours" />
        <IconRow icon="dollar" label="Pay and commission" detail="Planned, not built yet" noChevron tag="Later" testID="owner-manage-pay" last />
      </RowGroup>
      <Caption>Set up</Caption>
      <RowGroup>
        <IconRow icon="gear" label="Management" detail="Job types, templates, parts, prices, texts, checklists, team roles" href="/management" testID="owner-manage-management" />
        <IconRow icon="tag" label="Price book" detail="Parts and labor prices" href="/price-book" testID="owner-manage-price-book" />
        <IconRow icon="chart" label="Business numbers" detail="Sales, close rate, average ticket" href="/stats" testID="owner-manage-stats" />
        <IconRow icon="star" label="Tech scorecard" detail="Quotes won, ticket, callbacks" href="/scorecard" testID="owner-manage-scorecard" />
        <IconRow icon="check" label="Setup check" detail="What Odoo still needs" href="/setup" testID="owner-manage-setup" />
        <IconRow icon="users" label="Team and Odoo sign-in" detail="Who is signed in, team jobs" href="/team" testID="owner-manage-team" />
        <IconRow icon="gear" label="Settings" detail="Look, theme, texts, backup and version" href="/settings" testID="owner-manage-settings" last />
      </RowGroup>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: sp(12) },
  grow: { flex: 1 },
  pair: { flexDirection: 'row', gap: sp(10) },
  big: { flex: 1, backgroundColor: colors.card, borderRadius: radius.card, borderWidth: bw(1), borderColor: colors.line, padding: sp(12), gap: sp(2), ...shadow },
  label: { fontSize: fs(11.5), fontWeight: '800', letterSpacing: 0.8, color: colors.muted, textTransform: 'uppercase' },
  bigValue: { fontSize: fs(26), fontWeight: '800', color: GOLD },
  sub: { fontSize: fs(12.5), fontWeight: '600', color: colors.muted },
  bad: { color: colors.stop },
  good: { color: colors.ok },
  panel: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: bw(1), borderColor: colors.line, padding: sp(12), gap: sp(4), ...shadow },
  panelAlert: { borderLeftWidth: 5, borderLeftColor: colors.stop },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: sp(8) },
  line: { flexDirection: 'row', alignItems: 'center', gap: sp(8), paddingVertical: sp(8), minHeight: 44 },
  lineTop: { borderBottomWidth: 1, borderBottomColor: colors.line },
  lineText: { fontSize: fs(16), fontWeight: '700', color: colors.text },
  pill: { backgroundColor: colors.selected, borderRadius: radius.pill, paddingHorizontal: sp(12), paddingVertical: sp(5) },
  pillText: { fontSize: fs(13), fontWeight: '800', color: colors.onSelected },
  chevron: { fontSize: fs(24), color: colors.muted },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: sp(6), height: 76 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: sp(2) },
  bar: { width: '100%', backgroundColor: colors.info, borderRadius: 3, borderWidth: 1, borderColor: colors.selected },
  barToday: { backgroundColor: colors.selected },
  age: { flexDirection: 'row', alignItems: 'center', gap: sp(8), paddingVertical: sp(6) },
  ageValue: { fontSize: fs(16), fontWeight: '800', color: colors.text },
  dot: { width: 10, height: 10, borderRadius: 5 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: sp(10) },
  tile: { width: '48.5%', backgroundColor: colors.card, borderRadius: radius.card, borderWidth: bw(1), borderColor: colors.line, padding: sp(12), gap: sp(2), ...shadow },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: sp(6) },
  tileTitle: { fontSize: fs(12.5), fontWeight: '800', letterSpacing: 0.8, color: colors.muted, textTransform: 'uppercase' },
  tileValue: { fontSize: fs(28), fontWeight: '800', color: GOLD },
}));
