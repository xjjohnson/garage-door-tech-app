import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { Icon } from '../components/Icon';
import { onHeaderAdd } from '../lib/headerAdd';
import { OdooCustomerSync } from '../components/OdooCustomerSync';
import { customerName, EMPTY_CUSTOMER, searchCustomers, sortCustomers, summarize } from '../lib/customers';
import { CustomerSheet } from './CustomerScreen';
import { formatJobDate } from '../lib/jobs';
import { formatMoney } from '../lib/prices';
import { useCustomers } from '../lib/useCustomers';
import { useJobs } from '../lib/useJobs';
import { colors, radius, shadow, touch, type } from '../theme';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Everyone the tech has saved a job for, most recent first, with a search box. */
export function CustomersScreen() {
  const { customers, loaded, add } = useCustomers();
  const [adding, setAdding] = useState(false);
  const { jobs } = useJobs();
  const [query, setQuery] = useState('');
  // The Add pill in the header opens the sheet.
  useEffect(() => onHeaderAdd(() => setAdding(true)), []);
  const shown = useMemo(() => searchCustomers(sortCustomers(customers.map((c) => summarize(c, jobs))), query), [customers, jobs, query]);

  return (
    <View style={styles.stack} testID="customers">
      <OdooCustomerSync />
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
        <Icon name="search" size={20} color={colors.muted} />
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
          <Text style={styles.avatar}>{initials(customerName(c))}</Text>
          <View style={styles.itemText}>
            <Text style={styles.name} numberOfLines={1}>
              {customerName(c)}
            </Text>
            {c.name && c.address ? <Text style={styles.detail} numberOfLines={1}>{c.address}</Text> : null}
            {c.phone ? <Text style={styles.detail}>{c.phone}</Text> : null}
            <Text style={styles.meta}>
              {plural(theirs.length, 'job')}
              {openJobs > 0 ? ` · ${openJobs} open` : ''}
              {acceptedTotal > 0 ? ` · ${formatMoney(acceptedTotal)} accepted` : ''}
              {lastJobAt ? ` · last ${formatJobDate(lastJobAt)}` : ''}
            </Text>
          </View>
          {theirs.length >= 2 ? <Text style={styles.badge}>{theirs.length} VISITS</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, paddingLeft: 14, paddingRight: 6 },
  search: { flex: 1, minWidth: 0, minHeight: 56, fontSize: type.body, fontWeight: '700', color: colors.text },
  clear: { minHeight: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.info },
  count: { fontSize: 16, fontWeight: '700', color: colors.muted },
  empty: { padding: 14, borderRadius: 14, backgroundColor: colors.card, gap: 6 },
  emptyTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: 16, color: colors.text, lineHeight: 22 },
  item: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, ...shadow },
  avatar: { width: 42, height: 42, borderRadius: 21, textAlign: 'center', textAlignVertical: 'center', lineHeight: 42, overflow: 'hidden', fontSize: 15, fontWeight: '800', color: colors.selected, backgroundColor: colors.info },
  itemText: { flex: 1, gap: 1 },
  name: { fontSize: 18, fontWeight: '800', color: colors.text },
  detail: { fontSize: 16, fontWeight: '600', color: colors.muted },
  meta: { fontSize: 14, fontWeight: '600', color: colors.muted },
  badge: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4, color: colors.warn, backgroundColor: colors.warnBg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden' },
  pressed: { backgroundColor: colors.info },
  buttonText: { fontSize: 15, fontWeight: '800', color: colors.selected, textAlign: 'center' },
});
