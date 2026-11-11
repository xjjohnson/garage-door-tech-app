import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChipOption, Segmented } from '../components/controls';
import { balance, invoiceStatus, sortInvoices, STATUS_LABEL } from '../lib/invoices';
import { formatJobDate } from '../lib/jobs';
import { formatMoney } from '../lib/prices';
import { useInvoices } from '../lib/useInvoices';
import { colors, touch, type } from '../theme';

type Filter = 'owed' | 'paid' | 'all';
const FILTERS: ChipOption<Filter>[] = [
  { label: 'Owed', value: 'owed' },
  { label: 'Paid', value: 'paid' },
  { label: 'All', value: 'all' },
];

/** Every invoice, money still owed first, with the total owed at the top. */
export function InvoicesScreen() {
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
      {shown.map((i) => {
        const s = invoiceStatus(i);
        return (
          <Pressable
            key={i.id}
            onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: i.id } })}
            accessibilityRole="button"
            testID={`invoice-${i.id}`}
            style={({ pressed }) => [styles.item, s === 'paid' && styles.itemPaid, pressed && styles.pressed]}
          >
            <View style={styles.row}>
              <Text style={styles.name} numberOfLines={1}>
                {i.number} · {i.billTo || i.address || 'Customer'}
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
      })}
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
  pressed: { backgroundColor: colors.safety },
});
