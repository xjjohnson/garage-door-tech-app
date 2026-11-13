import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { OdooCustomerSync } from '../components/OdooCustomerSync';
import { customerName, EMPTY_CUSTOMER, searchCustomers, sortCustomers, summarize } from '../lib/customers';
import { CustomerSheet } from './CustomerScreen';
import { formatJobDate } from '../lib/jobs';
import { formatMoney } from '../lib/prices';
import { useCustomers } from '../lib/useCustomers';
import { useJobs } from '../lib/useJobs';
import { colors, touch, type } from '../theme';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Everyone the tech has saved a job for, most recent first, with a search box. */
export function CustomersScreen() {
  const { customers, loaded, add } = useCustomers();
  const [adding, setAdding] = useState(false);
  const { jobs } = useJobs();
  const [query, setQuery] = useState('');
  const shown = useMemo(() => searchCustomers(sortCustomers(customers.map((c) => summarize(c, jobs))), query), [customers, jobs, query]);

  return (
    <View style={styles.stack} testID="customers">
      <OdooCustomerSync />
      <Pressable onPress={() => setAdding(true)} accessibilityRole="button" testID="customers-add" style={({ pressed }) => [styles.add, pressed && styles.pressed]}>
        {({ pressed }) => <Text style={[styles.buttonText, !pressed && styles.addText]}>+ Add customer</Text>}
      </Pressable>
      <CustomerSheet
        visible={adding}
        title="Add customer"
        initial={EMPTY_CUSTOMER}
        onCancel={() => setAdding(false)}
        onSave={(f) => {
          const c = add(f);
          setAdding(false);
          router.push({ pathname: '/customer/[id]', params: { id: c.id } });
        }}
      />
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Name, phone or address"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search customers"
          testID="customers-search"
          style={styles.search}
        />
        {query !== '' ? (
          <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" style={({ pressed }) => [styles.clear, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {loaded && customers.length === 0 ? (
        <View style={styles.empty} testID="customers-empty">
          <Text style={styles.emptyTitle}>No customers yet</Text>
          <Text style={styles.emptyBody}>Each saved job adds its customer here. A repeat customer (same phone, or same name) gets their jobs together.</Text>
        </View>
      ) : null}
      {customers.length > 0 ? (
        <Text style={styles.count} testID="customers-count">
          {shown.length === 0 ? 'No customers match.' : plural(shown.length, 'customer')}
        </Text>
      ) : null}

      {shown.map(({ customer: c, jobs: theirs, openJobs, acceptedTotal, lastJobAt }) => (
        <Pressable
          key={c.id}
          onPress={() => router.push({ pathname: '/customer/[id]', params: { id: c.id } })}
          accessibilityRole="button"
          testID={`customer-${c.id}`}
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
        >
          <Text style={styles.name} numberOfLines={1}>
            {customerName(c)}
          </Text>
          {c.name && c.address ? <Text style={styles.detail}>{c.address}</Text> : null}
          {c.phone ? <Text style={styles.detail}>{c.phone}</Text> : null}
          <Text style={styles.meta}>
            {plural(theirs.length, 'job')}
            {openJobs > 0 ? ` · ${openJobs} open` : ''}
            {acceptedTotal > 0 ? ` · ${formatMoney(acceptedTotal)} accepted` : ''}
            {lastJobAt ? ` · last ${formatJobDate(lastJobAt)}` : ''}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  add: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, backgroundColor: colors.selected },
  addText: { color: colors.onSelected },
  stack: { gap: 12 },
  searchRow: { flexDirection: 'row', gap: 8 },
  search: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: type.value,
    fontWeight: '700',
    color: colors.text,
  },
  clear: { minHeight: 64, minWidth: touch.min + 16, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  count: { fontSize: 16, fontWeight: '700', color: colors.muted },
  empty: { padding: 12, borderRadius: 10, backgroundColor: colors.card, gap: 6 },
  emptyTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: 16, color: colors.text, lineHeight: 22 },
  item: { minHeight: touch.min, padding: 12, gap: 2, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg },
  name: { fontSize: type.value, fontWeight: '900', color: colors.text },
  detail: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
});
