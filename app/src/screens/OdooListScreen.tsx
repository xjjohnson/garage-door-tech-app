import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { Action } from '../components/Buttons';
import { ChipRow } from '../components/controls';
import { formatJobDate, phoneLink } from '../lib/jobs';
import { smsLink } from '../lib/jobSteps';
import { log } from '../lib/log';
import { fetchList, FILTERS, ListFilter, ListKind, LISTS_STORAGE_KEY, OdooListRow, PAGE, parseSavedLists } from '../lib/odooLists';
import { formatMoney } from '../lib/prices';
import { formatTime } from '../lib/schedule';
import { useOdoo } from '../lib/useOdoo';
import { agingBuckets, chaseOrder, daysLate, isUnpaid, owedOf, sections } from '../lib/salesLayouts';
import { colors, layouts, touch, type, bw, fs, rad, sz, sp } from '../theme';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Odoo's Quotations or Invoices list, every record and not only the phone's:
 * search by number or customer, filter by status, tap one for its lines. The
 * last list read is kept, so it still shows with no signal.
 */
export function OdooListScreen({ kind, now = Date.now, openLocal }: { kind: ListKind; now?: () => number; openLocal?: (odooId: number) => string | undefined }) {
  const { status, client } = useOdoo();
  const [rows, setRows] = useState<OdooListRow[] | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [filter, setFilter] = useState<ListFilter>('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(0);
  const can = status === 'signedIn' && !!client && (kind === 'quotations' ? client.session.apps.sales : client.session.apps.invoicing);

  // What was read last time, until Odoo answers.
  useEffect(() => {
    AsyncStorage.getItem(LISTS_STORAGE_KEY)
      .then((raw) => {
        const saved = parseSavedLists(raw)[kind];
        if (saved) {
          setRows((r) => r ?? saved.rows);
          setSavedAt((t) => t ?? saved.at);
        }
      })
      .catch(() => undefined);
  }, [kind]);

  const load = useCallback(
    async (offset: number) => {
      if (!client || !can) return;
      const n = ++asked.current;
      setBusy(true);
      setError(null);
      try {
        const page = await fetchList(client, kind, filter, search, offset, now());
        if (n !== asked.current) return;
        setRows((r) => (offset === 0 ? page : [...(r ?? []), ...page]));
        setMore(page.length === PAGE);
        setSavedAt(null);
        if (offset === 0 && filter === 'all' && !search.trim()) {
          const raw = await AsyncStorage.getItem(LISTS_STORAGE_KEY).catch(() => null);
          AsyncStorage.setItem(LISTS_STORAGE_KEY, JSON.stringify({ ...parseSavedLists(raw), [kind]: { rows: page, at: now() } })).catch(() => undefined);
        }
      } catch (e) {
        if (n !== asked.current) return;
        setError(message(e));
        log.warn('odoo', `${kind} list: ${message(e)}`);
      } finally {
        if (n === asked.current) setBusy(false);
      }
    },
    [client, can, kind, filter, search, now],
  );

  // Read again when the filter or search changes (search waits for typing to stop).
  useEffect(() => {
    if (!search) {
      load(0);
      return;
    }
    const t = setTimeout(() => load(0), 400);
    return () => clearTimeout(t);
  }, [load, search]);

  if (!can) {
    return (
      <View style={styles.stack} testID="odoo-list">
        <Text style={styles.meta} testID="odoo-list-off">
          {status === 'signedIn' ? `This Odoo user can't open ${kind === 'quotations' ? 'Sales' : 'Invoicing'}.` : 'Sign in to Odoo (Jobs › Team) to see this list.'}
        </Text>
        {rows?.length ? <Rows kind={kind} rows={rows} now={now()} openLocal={openLocal} /> : null}
      </View>
    );
  }

  return (
    <View style={styles.stack} testID="odoo-list">
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={kind === 'quotations' ? 'Search number or customer' : 'Search invoice number or customer'}
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        accessibilityLabel="Search"
        testID="odoo-list-search"
        style={styles.input}
      />
      <ChipRow options={FILTERS[kind].map((f) => ({ ...f }))} value={filter} onChange={(v) => setFilter(v as ListFilter)} testID="odoo-list-filter" />
      {savedAt ? <Text style={styles.meta}>Saved {formatJobDate(savedAt)} {formatTime(savedAt)}; reading Odoo...</Text> : null}
      {error ? (
        <Text style={styles.error} testID="odoo-list-error">
          Couldn't read Odoo: {error}
        </Text>
      ) : null}
      {rows === null ? <Text style={styles.meta}>Reading Odoo...</Text> : rows.length === 0 ? <Text style={styles.meta} testID="odoo-list-empty">Nothing here.</Text> : <Rows kind={kind} rows={rows} now={now()} openLocal={openLocal} />}
      {more ? <Action label={busy ? 'Reading...' : 'Show more'} disabled={busy} onPress={() => load(rows?.length ?? 0)} testID="odoo-list-more" /> : null}
    </View>
  );
}

/** Rows open Odoo's record, or the phone's own invoice (payments, signature) when openLocal knows it. */
function Rows({ kind, rows, now, openLocal }: { kind: ListKind; rows: OdooListRow[]; now: number; openLocal?: (odooId: number) => string | undefined }) {
  const open = (r: OdooListRow) => {
    const local = openLocal?.(r.id);
    if (local) router.push({ pathname: '/invoice/[id]', params: { id: local } });
    else router.push({ pathname: '/odoo-record/[kind]/[id]', params: { kind, id: String(r.id) } });
  };
  // The theme picks how the list is drawn; quotes always use the plain dense row when a theme is on.
  const layout = layouts.sales === 'classic' ? 'classic' : kind === 'invoices' ? layouts.sales : 'dense';
  const meta = (r: OdooListRow) =>
    [r.status, r.residual && r.residual !== r.total && r.warn ? `${formatMoney(r.residual)} owed` : '', r.date ? formatJobDate(r.date) : '', r.warn && r.due && r.due < now ? `due ${formatJobDate(r.due)}` : ''].filter(Boolean).join(' · ');
  const dense = (r: OdooListRow) => (
    <Pressable key={r.id} onPress={() => open(r)} accessibilityRole="button" testID={`odoo-row-${r.id}`} style={({ pressed }) => [styles.dense, pressed && styles.pressed]}>
      <View style={[styles.dot, { backgroundColor: r.warn ? colors.stop : isUnpaid(r) ? colors.caution : r.status === 'Paid' ? colors.ok : colors.muted }]} />
      <View style={styles.denseText}>
        <Text style={styles.denseName} numberOfLines={1}>
          {r.name} · {r.customer || 'No customer'}
        </Text>
        <Text style={[styles.denseMeta, r.warn && styles.warn]} numberOfLines={1}>
          {meta(r)}
        </Text>
      </View>
      <Text style={styles.money}>{formatMoney(r.refund ? -r.total : r.total)}</Text>
    </Pressable>
  );
  const head = (title: string, amount?: number) => (
    <Text key={`h-${title}`} style={styles.groupHead} accessibilityRole="header">
      {title}
      {amount ? ` · ${formatMoney(amount)}` : ''}
    </Text>
  );

  if (layout === 'dense') return <View style={styles.tight}>{rows.map(dense)}</View>;
  if (layout === 'grouped')
    return (
      <View style={styles.tight}>
        {sections(rows, now).map((sec) => (
          <View key={sec.title} style={styles.tight}>
            {head(sec.title, sec.title === 'Paid and other' ? undefined : sec.owed)}
            {sec.rows.map(dense)}
          </View>
        ))}
      </View>
    );
  if (layout === 'table')
    return (
      <View style={styles.tight}>
        <View style={styles.tHead}>
          <Text style={[styles.tHeadText, styles.tNo]}>No.</Text>
          <Text style={[styles.tHeadText, styles.tMain]}>Customer</Text>
          <Text style={[styles.tHeadText, styles.tDot]}>Status</Text>
          <Text style={[styles.tHeadText, styles.tEnd]}>Amount</Text>
        </View>
        {rows.map((r) => (
          <Pressable key={r.id} onPress={() => open(r)} accessibilityRole="button" testID={`odoo-row-${r.id}`} style={({ pressed }) => [styles.tRow, pressed && styles.pressed]}>
            <Text style={[styles.tCell, styles.tNo, styles.tBold]} numberOfLines={1}>
              {r.name.split('/').pop()}
            </Text>
            <Text style={[styles.tCell, styles.tMain, r.warn && styles.warn]} numberOfLines={1}>
              {r.customer || 'No customer'}
            </Text>
            <View style={styles.tDot} accessibilityLabel={r.status}>
              <View style={[styles.dot, { backgroundColor: r.warn ? colors.stop : isUnpaid(r) ? colors.caution : r.status === 'Paid' ? colors.ok : colors.muted }]} />
            </View>
            <Text style={[styles.tCell, styles.tEnd, styles.tBold]} numberOfLines={1}>
              {formatMoney(r.refund ? -r.total : r.total)}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  if (layout === 'aging') {
    const buckets = agingBuckets(rows, now);
    const max = Math.max(1, ...buckets.map((b) => b.total));
    return (
      <View style={styles.tight}>
        <View style={styles.aging} testID="sales-aging">
          <Text style={styles.groupHead}>Unpaid by age</Text>
          {buckets.map((b, i) => (
            <View key={b.bucket} style={styles.ageRow}>
              <Text style={styles.ageLabel}>{b.bucket}</Text>
              <View style={styles.ageTrack}>
                <View style={[styles.ageFill, { width: `${Math.max(b.total > 0 ? 4 : 0, Math.round((b.total / max) * 100))}%`, backgroundColor: i === 0 ? colors.ok : i === 1 ? colors.caution : colors.stop }]} />
              </View>
              <Text style={styles.ageMoney}>{b.total > 0 ? formatMoney(b.total) : '–'}</Text>
            </View>
          ))}
        </View>
        {rows.filter(isUnpaid).length > 0 ? head('Unpaid, oldest first') : null}
        {chaseOrder(rows, now).map(dense)}
      </View>
    );
  }
  if (layout === 'chase') return <Chase rows={rows} now={now} open={open} head={head} />;
  return (
    <View style={styles.stack}>
      {rows.map((r) => (
        <Pressable
          key={r.id}
          onPress={() => open(r)}
          accessibilityRole="button"
          testID={`odoo-row-${r.id}`}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <View style={styles.top}>
            <Text style={styles.name}>{r.name}</Text>
            <Text style={styles.money}>{formatMoney(r.refund ? -r.total : r.total)}</Text>
          </View>
          <Text style={styles.customer}>{r.customer || 'No customer'}</Text>
          <Text style={[styles.meta, r.warn && styles.warn]}>{meta(r)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Owner Sales: who to chase, longest overdue first, each row with Call, Text and Take payment. */
function Chase({ rows, now, open, head }: { rows: OdooListRow[]; now: number; open: (r: OdooListRow) => void; head: (title: string, amount?: number) => ReactNode }) {
  const { client } = useOdoo();
  const list = chaseOrder(rows, now);
  const owed = list.reduce((n, r) => n + owedOf(r), 0);
  const [phones, setPhones] = useState<Record<number, string>>({});
  const ids = [...new Set(list.map((r) => r.partnerId).filter((id) => id > 0))].join(',');
  useEffect(() => {
    if (!client || !ids) return;
    let alive = true;
    client
      .call('res.partner', 'read', [ids.split(',').map(Number)], { fields: ['phone'] })
      .then((r) => {
        if (!alive || !Array.isArray(r)) return;
        setPhones(Object.fromEntries((r as { id: number; phone?: unknown }[]).map((p) => [p.id, typeof p.phone === 'string' ? p.phone : ''])));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [client, ids]);
  const go = (url: string | undefined) => url && Linking.openURL(url).catch(() => undefined);
  return (
    <View style={styles.tight} testID="sales-chase">
      {head('To collect', owed)}
      {list.length === 0 ? <Text style={styles.meta}>Nothing to collect here.</Text> : null}
      {list.map((r) => {
        const late = daysLate(r, now);
        const phone = phones[r.partnerId] ?? '';
        return (
          <View key={r.id} style={[styles.chase, late > 0 && styles.chaseLate]}>
            <Pressable onPress={() => open(r)} accessibilityRole="button" testID={`odoo-row-${r.id}`} style={({ pressed }) => [styles.chaseTop, pressed && styles.pressed]}>
              <View style={styles.top}>
                <Text style={styles.customer} numberOfLines={1}>
                  {r.customer || 'No customer'}
                </Text>
                <Text style={styles.chaseMoney}>{formatMoney(owedOf(r))}</Text>
              </View>
              <Text style={[styles.meta, late > 0 && styles.warn]}>
                {r.name}
                {late > 0 ? ` · ${late} day${late === 1 ? '' : 's'} overdue` : r.due ? ` · due ${formatJobDate(r.due)}` : ''}
              </Text>
            </Pressable>
            <View style={styles.chaseBtns}>
              {phoneLink(phone) ? <Pressable onPress={() => go(phoneLink(phone))} accessibilityRole="button" accessibilityLabel={`Call ${r.customer}`} testID={`chase-call-${r.id}`} style={styles.chaseBtn}><Text style={styles.chaseBtnText}>Call</Text></Pressable> : null}
              {smsLink(phone, '') ? <Pressable onPress={() => go(smsLink(phone, ''))} accessibilityRole="button" accessibilityLabel={`Text ${r.customer}`} testID={`chase-text-${r.id}`} style={styles.chaseBtn}><Text style={styles.chaseBtnText}>Text</Text></Pressable> : null}
              <Pressable onPress={() => open(r)} accessibilityRole="button" accessibilityLabel={`Take payment for ${r.name}`} testID={`chase-pay-${r.id}`} style={[styles.chaseBtn, styles.chaseBtnMain]}><Text style={[styles.chaseBtnText, styles.chaseBtnMainText]}>Take payment</Text></Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: sp(10) },
  tight: { gap: sp(4) },
  dense: { flexDirection: 'row', alignItems: 'center', gap: sp(10), minHeight: touch.min + 6, paddingHorizontal: sp(12), paddingVertical: sp(6), borderRadius: rad(10), backgroundColor: colors.card, borderWidth: bw(1), borderColor: colors.line },
  dot: { width: 9, height: 9, borderRadius: 5 },
  denseText: { flex: 1, minWidth: 0 },
  denseName: { fontSize: fs(16), fontWeight: '800', color: colors.text },
  denseMeta: { fontSize: fs(13), fontWeight: '600', color: colors.muted },
  groupHead: { fontSize: fs(13), fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase', color: colors.muted, marginTop: sp(6), paddingHorizontal: sp(4) },
  tHead: { flexDirection: 'row', gap: sp(8), paddingHorizontal: sp(12), paddingVertical: sp(4) },
  tHeadText: { fontSize: fs(12), fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  tRow: { flexDirection: 'row', alignItems: 'center', gap: sp(8), minHeight: touch.min, paddingHorizontal: sp(12), borderRadius: rad(6), backgroundColor: colors.card, borderWidth: bw(1), borderColor: colors.line },
  tCell: { fontSize: fs(14), fontWeight: '600', color: colors.text },
  tBold: { fontWeight: '800' },
  tNo: { width: '17%' },
  tMain: { flex: 1 },
  chaseTop: { gap: sp(2) },
  chaseBtns: { flexDirection: 'row', gap: sp(8) },
  chaseBtn: { flex: 1, minHeight: sz(40), borderRadius: rad(10), borderWidth: bw(1.5), borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(8) },
  chaseBtnMain: { flex: 1.6, backgroundColor: colors.selected, borderColor: colors.selected },
  chaseBtnText: { fontSize: fs(14), fontWeight: '800', color: colors.text },
  chaseBtnMainText: { color: colors.onSelected },
  tDot: { width: 52, alignItems: 'center' },
  tEnd: { width: '27%', textAlign: 'right' },
  aging: { gap: sp(6), padding: sp(12), borderRadius: rad(12), backgroundColor: colors.card, borderWidth: bw(1), borderColor: colors.line },
  ageRow: { flexDirection: 'row', alignItems: 'center', gap: sp(8) },
  ageLabel: { width: '24%', fontSize: fs(13), fontWeight: '700', color: colors.muted },
  ageTrack: { flex: 1, height: 14, borderRadius: 7, backgroundColor: colors.info, overflow: 'hidden' },
  ageFill: { height: 14, borderRadius: 7 },
  ageMoney: { width: '24%', textAlign: 'right', fontSize: fs(14), fontWeight: '800', color: colors.text },
  chase: { gap: sp(8), padding: sp(14), borderRadius: rad(14), backgroundColor: colors.card, borderWidth: bw(1), borderColor: colors.line, borderLeftWidth: 4, borderLeftColor: colors.caution },
  chaseLate: { borderLeftColor: colors.stop },
  chaseMoney: { fontSize: fs(20), fontWeight: '800', color: colors.text },
  input: { minHeight: touch.min, borderRadius: rad(12), borderWidth: bw(1.5), borderColor: colors.border, paddingHorizontal: sp(14), fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
  row: { minHeight: touch.min, padding: sp(12), gap: sp(2), borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, backgroundColor: colors.card },
  pressed: { backgroundColor: colors.info },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: sp(12) },
  name: { fontSize: type.body, fontWeight: '800', color: colors.text },
  money: { fontSize: type.body, fontWeight: '800', color: colors.text },
  customer: { fontSize: fs(17), fontWeight: '700', color: colors.text },
  meta: { fontSize: fs(15), fontWeight: '600', color: colors.muted },
  warn: { color: colors.stop },
  error: { fontSize: type.body, fontWeight: '800', color: colors.stop },
});
