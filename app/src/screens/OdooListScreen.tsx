import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { Action } from '../components/Buttons';
import { ChipRow } from '../components/controls';
import { formatJobDate } from '../lib/jobs';
import { log } from '../lib/log';
import { fetchList, FILTERS, ListFilter, ListKind, LISTS_STORAGE_KEY, OdooListRow, PAGE, parseSavedLists } from '../lib/odooLists';
import { formatMoney } from '../lib/prices';
import { formatTime } from '../lib/schedule';
import { useOdoo } from '../lib/useOdoo';
import { colors, touch, type } from '../theme';

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
  return (
    <View style={styles.stack}>
      {rows.map((r) => (
        <Pressable
          key={r.id}
          onPress={() => {
            const local = openLocal?.(r.id);
            if (local) router.push({ pathname: '/invoice/[id]', params: { id: local } });
            else router.push({ pathname: '/odoo-record/[kind]/[id]', params: { kind, id: String(r.id) } });
          }}
          accessibilityRole="button"
          testID={`odoo-row-${r.id}`}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <View style={styles.top}>
            <Text style={styles.name}>{r.name}</Text>
            <Text style={styles.money}>{formatMoney(r.refund ? -r.total : r.total)}</Text>
          </View>
          <Text style={styles.customer}>{r.customer || 'No customer'}</Text>
          <Text style={[styles.meta, r.warn && styles.warn]}>
            {[r.status, r.residual && r.residual !== r.total && r.warn ? `${formatMoney(r.residual)} owed` : '', r.date ? formatJobDate(r.date) : '', r.warn && r.due && r.due < now ? `due ${formatJobDate(r.due)}` : ''].filter(Boolean).join(' · ')}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  input: { minHeight: touch.min, borderRadius: 12, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.bg },
  row: { minHeight: touch.min, padding: 12, gap: 2, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card },
  pressed: { backgroundColor: colors.info },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  name: { fontSize: type.body, fontWeight: '900', color: colors.text },
  money: { fontSize: type.body, fontWeight: '900', color: colors.text },
  customer: { fontSize: 17, fontWeight: '700', color: colors.text },
  meta: { fontSize: 15, fontWeight: '600', color: colors.muted },
  warn: { color: colors.stop },
  error: { fontSize: type.body, fontWeight: '800', color: colors.stop },
});
