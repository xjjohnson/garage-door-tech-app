import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Action } from '../components/Buttons';
import { ChipOption, Segmented } from '../components/controls';
import { useInvoiceOdoo } from '../components/OdooSales';
import { balance, Invoice, invoiceNo, invoiceStatus, sortInvoices, STATUS_LABEL } from '../lib/invoices';
import { formatJobDate } from '../lib/jobs';
import { formatMoney } from '../lib/prices';
import { useInvoices } from '../lib/useInvoices';
import { useOdoo } from '../lib/useOdoo';
import { OdooListScreen } from './OdooListScreen';
import { colors, touch, type } from '../theme';

type Filter = 'owed' | 'paid' | 'all';
const FILTERS: ChipOption<Filter>[] = [
  { label: 'Owed', value: 'owed' },
  { label: 'Paid', value: 'paid' },
  { label: 'All', value: 'all' },
];

/**
 * Invoices. Signed in to Odoo with Invoicing, these are Odoo's: its own list,
 * with the phone's only for invoices still waiting to go there. Otherwise the
 * invoices kept on this phone, money still owed first.
 */
export function InvoicesScreen({ now = Date.now }: { now?: () => number }) {
  const { status, client } = useOdoo();
  if (status === 'signedIn' && client?.session.apps.invoicing) return <OdooInvoices now={now} />;
  return <PhoneInvoices />;
}

/** Odoo's invoice list, under the phone's invoices that aren't in Odoo yet. */
function OdooInvoices({ now }: { now: () => number }) {
  const { invoices } = useInvoices();
  const { send } = useInvoiceOdoo(now);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waiting = sortInvoices(invoices.filter((i) => !i.odoo && !i.voidedAt));
  const byOdoo = useMemo(() => new Map(invoices.filter((i) => i.odoo).map((i) => [i.odoo!.id, i.id])), [invoices]);
  const sendAll = async () => {
    setBusy(true);
    setError(null);
    // Every waiting invoice is tried, oldest first; one Odoo refuses doesn't stop the rest.
    const failed: string[] = [];
    let reason = '';
    for (const i of [...waiting].reverse()) {
      try {
        await send(i);
      } catch (e) {
        failed.push(invoiceNo(i));
        reason = e instanceof Error ? e.message : "Couldn't reach Odoo.";
      }
    }
    if (failed.length) setError(`${failed.length === 1 ? `Invoice ${failed[0]} didn't` : `Invoices ${failed.join(', ')} didn't`} go to Odoo: ${reason} Try again.`);
    setBusy(false);
  };
  return (
    <View style={styles.stack} testID="invoices">
      {waiting.length > 0 ? (
        <View style={styles.stack} testID="invoices-waiting">
          <Text style={styles.detail}>
            {waiting.length === 1 ? '1 invoice' : `${waiting.length} invoices`} made on this phone {waiting.length === 1 ? "isn't" : "aren't"} in Odoo yet
          </Text>
          {waiting.map((i) => (
            <InvoiceRow key={i.id} invoice={i} />
          ))}
          <Action label={busy ? 'Sending...' : waiting.length === 1 ? 'Send it to Odoo now' : `Send all ${waiting.length} to Odoo now`} disabled={busy} onPress={sendAll} testID="invoices-send-all" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      ) : null}
      <OdooListScreen kind="invoices" now={now} openLocal={(id) => byOdoo.get(id)} />
    </View>
  );
}

function InvoiceRow({ invoice: i }: { invoice: Invoice }) {
  const s = invoiceStatus(i);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: i.id } })}
      accessibilityRole="button"
      testID={`invoice-${i.id}`}
      style={({ pressed }) => [styles.item, s === 'paid' && styles.itemPaid, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <Text style={styles.name} numberOfLines={1}>
          {invoiceNo(i)} · {i.billTo || i.address || 'Customer'}
        </Text>
        <Text style={[styles.badge, s === 'paid' && styles.badgePaid, s === 'void' && styles.badgeVoid]}>{STATUS_LABEL[s]}</Text>
      </View>
      <Text style={styles.detail}>
        {formatMoney(i.total)}
        {s === 'partial' ? `, ${formatMoney(balance(i))} still owed` : ''}
      </Text>
      <Text style={styles.meta}>{formatJobDate(i.createdAt)}</Text>
    </Pressable>
  );
}

/** Every invoice on this phone, money still owed first, with the total owed at the top. */
function PhoneInvoices() {
  const { invoices, loaded } = useInvoices();
  const [filter, setFilter] = useState<Filter>('owed');
  const owed = invoices.filter((i) => ['unpaid', 'partial'].includes(invoiceStatus(i)));
  const totalOwed = owed.reduce((n, i) => n + balance(i), 0);
  const shown = useMemo(() => {
    const list = filter === 'all' ? invoices : invoices.filter((i) => (filter === 'owed' ? ['unpaid', 'partial'] : ['paid']).includes(invoiceStatus(i)));
    return sortInvoices(list);
  }, [invoices, filter]);

  return (
    <View style={styles.stack} testID="invoices">
      <Text style={styles.owed} testID="invoices-owed">
        Owed to you: {formatMoney(totalOwed)}
        {owed.length > 0 ? ` on ${owed.length} invoice${owed.length === 1 ? '' : 's'}` : ''}
      </Text>
      <Segmented options={FILTERS} value={filter} onChange={setFilter} testID="invoices-filter" />
      {loaded && invoices.length === 0 ? (
        <View style={styles.empty} testID="invoices-empty">
          <Text style={styles.emptyTitle}>No invoices yet</Text>
          <Text style={styles.emptyBody}>On a job's quote, tap Customer picked, then Make invoice.</Text>
        </View>
      ) : null}
      {invoices.length > 0 && shown.length === 0 ? <Text style={styles.meta}>None here.</Text> : null}
      {shown.map((i) => (
        <InvoiceRow key={i.id} invoice={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  owed: { fontSize: type.value, fontWeight: '900', color: colors.text },
  empty: { padding: 12, borderRadius: 10, backgroundColor: colors.card, gap: 6 },
  emptyTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: 16, color: colors.text, lineHeight: 22 },
  item: { minHeight: touch.min, padding: 12, gap: 2, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg },
  itemPaid: { backgroundColor: colors.card },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: type.value, fontWeight: '900', color: colors.text },
  badge: { fontSize: 14, fontWeight: '900', color: colors.text, backgroundColor: colors.safety, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', letterSpacing: 1 },
  badgePaid: { color: colors.onSelected, backgroundColor: colors.selected },
  badgeVoid: { color: colors.onStop, backgroundColor: colors.stop },
  detail: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  pressed: { backgroundColor: colors.info },
  error: { fontSize: type.body, fontWeight: '800', color: colors.stop },
});
