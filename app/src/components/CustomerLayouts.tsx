import { router } from 'expo-router';
import { useMemo } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Text } from './AppText';
import { formatMiles, googleNavLink, miles, Point } from '../lib/geocode';
import { phoneLink } from '../lib/jobs';
import { formatMoney } from '../lib/prices';
import { onDay } from '../lib/schedule';
import { useGeocode } from '../lib/useGeocode';
import { useVisits } from '../lib/useVisits';
import { colors, bw, fs, rad, radius, sp, sz, touch } from '../theme';
import type { CustomersLayout } from '../lib/themes';
import { makeStyles } from '../lib/makeStyles';

/** One customer, ready to draw in any of the themed layouts. */
export interface CustomerRow {
  id: string;
  name: string;
  address: string;
  phone: string;
  jobs: number;
  open: number;
  quotes: number;
  /** Money still owed, in the app's money units. 0 when nothing is owed. */
  owed: number;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
const open = (url: string | undefined) => url && Linking.openURL(url).catch(() => undefined);
const go = (id: string) => router.push({ pathname: '/customer/[id]', params: { id } });
const sub = (c: CustomerRow) => [c.address, c.jobs > 0 ? `${c.jobs} job${c.jobs === 1 ? '' : 's'}` : 'No jobs yet'].filter(Boolean).join(' · ');

/**
 * Customers in the themed layouts. big: large rows with Call and Go on the
 * row. table: columns. owed: who owes you, biggest first, with a bar.
 * near: closest to the next stop first, with the distance.
 */
export function CustomerLayouts({ layout, rows }: { layout: Exclude<CustomersLayout, 'classic'>; rows: CustomerRow[] }) {
  if (layout === 'table') return <Table rows={rows} />;
  if (layout === 'owed') return <Owed rows={rows} />;
  if (layout === 'near') return <Near rows={rows} />;
  return <Big rows={rows} />;
}

function Big({ rows }: { rows: CustomerRow[] }) {
  const styles = useStyles();
  return (
    <View style={styles.stack} testID="customers-big">
      {rows.map((c) => {
        const call = phoneLink(c.phone);
        return (
          <View key={c.id} style={styles.bigRow}>
            <Pressable onPress={() => go(c.id)} accessibilityRole="button" testID={`customer-${c.id}`} style={({ pressed }) => [styles.bigTop, pressed && styles.pressed]}>
              <Text style={styles.avatar}>{initials(c.name)}</Text>
              <View style={styles.grow}>
                <Text style={styles.bigName} numberOfLines={2}>{c.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{sub(c)}</Text>
                {c.owed > 0 ? <Text style={styles.owes}>owes {formatMoney(c.owed)}</Text> : null}
              </View>
            </Pressable>
            {call || c.address ? (
              <View style={styles.pair}>
                {call ? <Pressable onPress={() => open(call)} accessibilityRole="button" accessibilityLabel={`Call ${c.name}`} testID={`customer-call-${c.id}`} style={styles.pill}><Text style={styles.pillText}>Call</Text></Pressable> : null}
                {c.address ? <Pressable onPress={() => open(googleNavLink(c.address))} accessibilityRole="button" accessibilityLabel={`Directions to ${c.name}`} testID={`customer-go-${c.id}`} style={styles.pill}><Text style={styles.pillText}>Go</Text></Pressable> : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function Table({ rows }: { rows: CustomerRow[] }) {
  const styles = useStyles();
  return (
    <View style={styles.table} testID="customers-table">
      <View style={styles.tr}>
        <Text style={[styles.th, styles.cName]}>CUSTOMER</Text>
        <Text style={[styles.th, styles.cNum]}>JOBS</Text>
        <Text style={[styles.th, styles.cNum]}>OPEN</Text>
        <Text style={[styles.th, styles.cOwe]}>OWES</Text>
      </View>
      {rows.map((c) => (
        <Pressable key={c.id} onPress={() => go(c.id)} accessibilityRole="button" testID={`customer-${c.id}`} style={({ pressed }) => [styles.tr, styles.trBody, pressed && styles.pressed]}>
          <Text style={[styles.td, styles.cName, c.jobs === 0 && c.owed === 0 && styles.quiet]} numberOfLines={1}>{c.name}</Text>
          <Text style={[styles.td, styles.cNum]}>{c.jobs > 0 ? c.jobs : ''}</Text>
          <Text style={[styles.td, styles.cNum]}>{c.open > 0 ? c.open : ''}</Text>
          <Text style={[styles.td, styles.cOwe, c.owed > 0 && styles.owes]}>{c.owed > 0 ? formatMoney(c.owed) : ''}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Owed({ rows }: { rows: CustomerRow[] }) {
  const styles = useStyles();
  const owing = rows.filter((c) => c.owed > 0).sort((a, b) => b.owed - a.owed);
  const rest = rows.filter((c) => c.owed <= 0);
  const top = owing[0]?.owed ?? 1;
  const total = owing.reduce((n, c) => n + c.owed, 0);
  return (
    <View style={styles.stack} testID="customers-owed">
      <View style={styles.sumRow}>
        <View style={styles.grow}>
          <Text style={styles.head}>OWED TO YOU</Text>
          <Text style={styles.sumValue} testID="customers-owed-total">{formatMoney(total)}</Text>
        </View>
        <View>
          <Text style={styles.head}>CUSTOMERS</Text>
          <Text style={styles.sumValue}>{rows.length}</Text>
        </View>
      </View>
      <Text style={styles.head}>OWE YOU · {owing.length}</Text>
      {owing.map((c) => (
        <Pressable key={c.id} onPress={() => go(c.id)} accessibilityRole="button" testID={`customer-${c.id}`} style={({ pressed }) => [styles.owedRow, pressed && styles.pressed]}>
          <View style={styles.between}>
            <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
            <Text style={styles.owes}>{formatMoney(c.owed)}</Text>
          </View>
          <View style={styles.barBg}><View style={[styles.barFill, { width: `${Math.max(4, Math.round((c.owed / top) * 100))}%` }]} /></View>
        </Pressable>
      ))}
      <Text style={styles.head}>EVERYONE ELSE · {rest.length}</Text>
      <View style={styles.table}>
        {rest.map((c) => (
          <Pressable key={c.id} onPress={() => go(c.id)} accessibilityRole="button" testID={`customer-${c.id}`} style={({ pressed }) => [styles.tr, styles.trBody, pressed && styles.pressed]}>
            <View style={styles.grow}>
              <Text style={styles.td} numberOfLines={1}>{c.name}</Text>
              <Text style={styles.meta} numberOfLines={1}>{sub(c)}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Near({ rows }: { rows: CustomerRow[] }) {
  const styles = useStyles();
  const visits = useVisits();
  const now = Date.now();
  // Near the next stop today; with no stop left, near the first one.
  const stops = onDay(visits, now).filter((a) => a.status !== 'cancelled' && a.address.trim());
  const from = (stops.find((a) => a.status === 'booked' && a.start + a.minutes * 60000 > now) ?? stops[0])?.address ?? '';
  const addresses = useMemo(() => [from, ...rows.slice(0, 40).map((c) => c.address)], [from, rows]);
  const { points } = useGeocode(addresses);
  const origin: Point | null | undefined = from ? points[from.trim()] : undefined;
  const dist = (c: CustomerRow): number | undefined => {
    const p = c.address.trim() ? points[c.address.trim()] : undefined;
    return origin && p ? miles(origin, p) : undefined;
  };
  const sorted = [...rows].sort((a, b) => (dist(a) ?? Infinity) - (dist(b) ?? Infinity) || a.name.localeCompare(b.name));
  return (
    <View style={styles.stack} testID="customers-near">
      <Text style={styles.head}>{origin ? 'NEAREST TO YOUR NEXT STOP' : 'A TO Z (NO STOP TO MEASURE FROM)'}</Text>
      <View style={styles.table}>
        {sorted.map((c) => {
          const d = dist(c);
          return (
            <Pressable key={c.id} onPress={() => go(c.id)} accessibilityRole="button" testID={`customer-${c.id}`} style={({ pressed }) => [styles.tr, styles.trBody, pressed && styles.pressed]}>
              <View style={styles.grow}>
                <Text style={styles.td} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>{sub(c)}</Text>
              </View>
              {d !== undefined ? <Text style={styles.meta} testID={`customer-miles-${c.id}`}>{formatMiles(d)}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: sp(10) },
  grow: { flex: 1, minWidth: 0 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: sp(8) },
  head: { fontSize: fs(13), fontWeight: '800', letterSpacing: 0.6, color: colors.muted },
  bigRow: { gap: sp(10), padding: sp(12), borderRadius: radius.card, borderWidth: bw(1), borderColor: colors.line, backgroundColor: colors.card },
  bigTop: { flexDirection: 'row', alignItems: 'center', gap: sp(12) },
  avatar: { width: 44, height: 44, borderRadius: rad(22), textAlign: 'center', textAlignVertical: 'center', lineHeight: 44, overflow: 'hidden', fontSize: fs(15), fontWeight: '800', color: colors.selected, backgroundColor: colors.info },
  bigName: { fontSize: fs(18), fontWeight: '800', color: colors.text },
  name: { fontSize: fs(17), fontWeight: '800', color: colors.text, flexShrink: 1 },
  meta: { fontSize: fs(14), fontWeight: '600', color: colors.muted },
  owes: { fontSize: fs(15), fontWeight: '800', color: colors.warn },
  pair: { flexDirection: 'row', gap: sp(10) },
  pill: { flex: 1, minHeight: sz(52), paddingHorizontal: sp(12), borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.info },
  pillText: { fontSize: fs(17), fontWeight: '800', color: colors.selected },
  pressed: { backgroundColor: colors.info },
  table: { borderRadius: radius.card, borderWidth: bw(1), borderColor: colors.line, backgroundColor: colors.card, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', gap: sp(8), paddingHorizontal: sp(12), paddingVertical: sp(8) },
  trBody: { minHeight: sz(44), borderTopWidth: bw(1), borderTopColor: colors.line },
  th: { fontSize: fs(12), fontWeight: '800', letterSpacing: 0.5, color: colors.muted },
  td: { fontSize: fs(16), fontWeight: '700', color: colors.text },
  quiet: { color: colors.muted, fontWeight: '600' },
  cName: { flex: 1, minWidth: 0 },
  cNum: { width: 44, textAlign: 'right' },
  cOwe: { width: 92, textAlign: 'right' },
  sumRow: { flexDirection: 'row', gap: sp(12), padding: sp(12), borderRadius: radius.card, borderWidth: bw(1), borderColor: colors.line, backgroundColor: colors.card },
  sumValue: { fontSize: fs(24), fontWeight: '800', color: colors.text },
  owedRow: { gap: sp(6), padding: sp(12), borderRadius: radius.card, borderWidth: bw(1), borderColor: colors.line, backgroundColor: colors.card },
  barBg: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.warn },
}));
