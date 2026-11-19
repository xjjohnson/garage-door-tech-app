import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { Icon } from '../components/Icon';
import { onHeaderAdd } from '../lib/headerAdd';
import { OdooCustomerSync } from '../components/OdooCustomerSync';
import { customerName, EMPTY_CUSTOMER, searchCustomers, summarize } from '../lib/customers';
import { CustomerSheet } from './CustomerScreen';
import { balance, invoiceStatus } from '../lib/invoices';
import { CustomerLayouts } from '../components/CustomerLayouts';
import { useCustomers } from '../lib/useCustomers';
import { useCustomerCounts } from '../lib/useCustomerCounts';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { colors, layouts, radius, shadow, touch, type, bw, fs, rad, sz, sp } from '../theme';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

type Filter = 'all' | 'open' | 'owes' | 'repeat';

/** Everyone the tech has saved a job for, A to Z with letter dividers, a search box and filters. */
export function CustomersScreen() {
  const { customers, loaded, add } = useCustomers();
  const [adding, setAdding] = useState(false);
  const { jobs } = useJobs();
  const { invoices } = useInvoices();
  const odooCounts = useCustomerCounts();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  // The Add pill in the header opens the sheet.
  useEffect(() => onHeaderAdd(() => setAdding(true)), []);

  // Who still owes money: unpaid invoices, matched to the customer through their job.
  const owes = useMemo(() => {
    const byJob = new Map(jobs.map((j) => [j.id, j.customerId]));
    const set = new Map<string, number>();
    for (const i of invoices) {
      const c = i.jobId ? byJob.get(i.jobId) : undefined;
      if (c && ['unpaid', 'partial'].includes(invoiceStatus(i))) set.set(c, (set.get(c) ?? 0) + balance(i));
    }
    return set;
  }, [jobs, invoices]);

  const rows = useMemo(() => {
    return searchCustomers(customers.map((c) => summarize(c, jobs)), query).map((sum) => {
      const c = sum.customer;
      // Linked to Odoo, the counts are Odoo's (plus any job still waiting to go there); otherwise the phone's own.
      const odoo = c.odooId ? odooCounts[c.odooId] : undefined;
      const waiting = odoo ? sum.jobs.filter((j) => !j.odooJob && !j.odooOrder) : sum.jobs;
      const jobsN = odoo ? odoo.jobs + waiting.length : sum.jobs.length;
      const openN = odoo ? odoo.open + waiting.filter((j) => j.status === 'open').length : sum.openJobs;
      return { sum, jobsN, openN, quotes: odoo?.quotes ?? 0, owes: owes.has(c.id), owed: owes.get(c.id) ?? 0 };
    });
  }, [customers, jobs, query, odooCounts, owes]);

  const counts = { all: rows.length, open: rows.filter((r) => r.openN > 0).length, owes: rows.filter((r) => r.owes).length, repeat: rows.filter((r) => r.jobsN >= 2).length };
  const shown = useMemo(() => {
    const keep = rows.filter((r) => (filter === 'open' ? r.openN > 0 : filter === 'owes' ? r.owes : filter === 'repeat' ? r.jobsN >= 2 : true));
    return keep.sort((a, b) => customerName(a.sum.customer).localeCompare(customerName(b.sum.customer), undefined, { sensitivity: 'base' }));
  }, [rows, filter]);
  const letterOf = (r: (typeof shown)[number]) => {
    const l = customerName(r.sum.customer).trim()[0]?.toUpperCase() ?? '#';
    return /[A-Z]/.test(l) ? l : '#';
  };

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

      {customers.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="tablist">
          {(
            [
              ['all', `All ${counts.all}`],
              ['open', 'Open jobs'],
              ['owes', 'Owes money'],
              ['repeat', 'Repeat'],
            ] as const
          ).map(([id, label]) => (
            <Pressable key={id} onPress={() => setFilter(id)} accessibilityRole="tab" accessibilityState={{ selected: filter === id }} testID={`customers-filter-${id}`} style={[styles.chip, filter === id && styles.chipOn]}>
              <Text style={[styles.chipText, filter === id && styles.chipTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

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

      {shown.length > 0 && layouts.customers !== 'classic' ? (
        <CustomerLayouts
          layout={layouts.customers}
          rows={shown.map((r) => ({ id: r.sum.customer.id, name: customerName(r.sum.customer), address: r.sum.customer.address ?? '', phone: r.sum.customer.phone ?? '', jobs: r.jobsN, open: r.openN, quotes: r.quotes, owed: r.owed }))}
        />
      ) : null}
      {shown.length > 0 && layouts.customers === 'classic' ? (
        <View style={styles.group}>
          {shown.map((r, i) => {
            const c = r.sum.customer;
            const letter = letterOf(r);
            const first = i === 0 || letterOf(shown[i - 1]!) !== letter;
            const sub = [c.name && c.address ? c.address : '', c.phone].filter(Boolean).join(' · ');
            const meta = [r.jobsN > 0 ? plural(r.jobsN, 'job') : '', r.openN > 0 ? `${r.openN} open` : '', r.quotes > 0 ? plural(r.quotes, 'quote') : '', r.owes ? 'owes money' : ''].filter(Boolean).join(' · ');
            return (
              <View key={c.id}>
                {first ? (
                  <Text style={styles.letter} accessibilityRole="header">
                    {letter}
                  </Text>
                ) : null}
                <Pressable
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
                    {sub ? (
                      <Text style={styles.detail} numberOfLines={1}>
                        {sub}
                      </Text>
                    ) : null}
                    {meta ? <Text style={styles.meta}>{meta}</Text> : sub ? null : <Text style={styles.meta}>No jobs yet</Text>}
                  </View>
                  {r.jobsN >= 2 ? <Text style={styles.badge}>{r.jobsN} VISITS</Text> : null}
                  <Icon name="chevron" size={18} color={colors.muted} />
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: sp(12) },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: sp(8), backgroundColor: colors.card, borderWidth: bw(1), borderColor: colors.line, borderRadius: radius.card, paddingLeft: sp(14), paddingRight: sp(6) },
  search: { flex: 1, minWidth: 0, minHeight: sz(56), fontSize: type.body, fontWeight: '700', color: colors.text },
  clear: { minHeight: sz(44), borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(12), backgroundColor: colors.info },
  count: { fontSize: fs(16), fontWeight: '700', color: colors.muted },
  empty: { padding: sp(14), borderRadius: rad(14), backgroundColor: colors.card, gap: sp(6) },
  emptyTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: fs(16), color: colors.text, lineHeight: fs(22) },
  chips: { gap: sp(8), paddingRight: sp(8) },
  chip: { minHeight: sz(44), paddingHorizontal: sp(16), borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: bw(1), borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.selected, borderColor: colors.selected },
  chipText: { fontSize: fs(15), fontWeight: '800', color: colors.muted },
  chipTextOn: { color: colors.onSelected },
  group: { borderRadius: radius.card, borderWidth: bw(1), borderColor: colors.line, backgroundColor: colors.card, overflow: 'hidden', ...shadow },
  letter: { fontSize: fs(13), fontWeight: '800', letterSpacing: 1, color: colors.muted, backgroundColor: colors.bg, paddingHorizontal: sp(14), paddingTop: sp(8), paddingBottom: sp(4) },
  item: { minHeight: touch.min + 6, flexDirection: 'row', alignItems: 'center', gap: sp(12), paddingVertical: sp(10), paddingHorizontal: sp(14), borderTopWidth: 1, borderTopColor: colors.line },
  avatar: { width: 42, height: 42, borderRadius: rad(21), textAlign: 'center', textAlignVertical: 'center', lineHeight: 42, overflow: 'hidden', fontSize: fs(15), fontWeight: '800', color: colors.selected, backgroundColor: colors.info },
  itemText: { flex: 1, gap: sp(1) },
  name: { fontSize: fs(18), fontWeight: '800', color: colors.text },
  detail: { fontSize: fs(16), fontWeight: '600', color: colors.muted },
  meta: { fontSize: fs(14), fontWeight: '600', color: colors.muted },
  badge: { fontSize: fs(12), fontWeight: '800', letterSpacing: 0.4, color: colors.warn, backgroundColor: colors.warnBg, paddingHorizontal: sp(9), paddingVertical: sp(4), borderRadius: radius.pill, overflow: 'hidden' },
  pressed: { backgroundColor: colors.info },
  buttonText: { fontSize: fs(15), fontWeight: '800', color: colors.selected, textAlign: 'center' },
});
