/**
 * A customer's real jobs, quotations and invoices from Odoo, for the customer
 * page when signed in: what the Field Service, Sales and Invoicing apps hold
 * for them and the contacts under them, not only what this phone made. The
 * last read is kept per customer, so the page still shows it with no signal.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatJobDate } from '../lib/jobs';
import { log } from '../lib/log';
import type { OdooTask } from '../lib/odoo';
import { whatOf } from '../lib/odooJobs';
import { fetchForCustomer, ListKind, OdooListRow } from '../lib/odooLists';
import { formatMoney } from '../lib/prices';
import { dayLabel, formatTime } from '../lib/schedule';
import { useInvoices } from '../lib/useInvoices';
import { useOdoo } from '../lib/useOdoo';
import { useOpenOdooJob } from '../lib/useStartJob';
import { colors, touch, type } from '../theme';

export const CUSTOMER_ODOO_STORAGE_KEY = 'odoo-customer/v1';
const LIMIT = 20;

export interface CustomerRecords {
  jobs: OdooTask[];
  quotes: OdooListRow[];
  invoices: OdooListRow[];
  at: number;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const arr = <T,>(v: unknown, ok: (x: T) => boolean): T[] => (Array.isArray(v) ? (v as T[]).filter((x) => x && ok(x)) : []);

/** The saved reads, by Odoo contact id. */
export function parseSavedRecords(raw: string | null): Record<string, CustomerRecords> {
  try {
    const d = raw ? JSON.parse(raw) : null;
    if (!d || typeof d !== 'object') return {};
    const out: Record<string, CustomerRecords> = {};
    for (const [k, v] of Object.entries(d as Record<string, Record<string, unknown>>)) {
      if (!v || typeof v.at !== 'number') continue;
      const row = (x: OdooListRow) => typeof x.id === 'number' && typeof x.name === 'string';
      out[k] = { jobs: arr<OdooTask>(v.jobs, (x) => typeof x.id === 'number' && typeof x.name === 'string'), quotes: arr(v.quotes, row), invoices: arr(v.invoices, row), at: v.at };
    }
    return out;
  } catch {
    return {};
  }
}

/** Reads a customer's records from Odoo, keeping the last read for no signal. */
export function useCustomerRecords(partnerId: number, now: () => number = Date.now) {
  const { client } = useOdoo();
  const [records, setRecords] = useState<CustomerRecords | null>(null);
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem(CUSTOMER_ODOO_STORAGE_KEY)
      .then((raw) => {
        const saved = parseSavedRecords(raw)[String(partnerId)];
        if (saved) setRecords((r) => r ?? saved);
      })
      .catch(() => undefined);
  }, [partnerId]);

  const refresh = useCallback(async () => {
    if (!client) return;
    const n = ++asked.current;
    setError(null);
    try {
      const apps = client.session.apps;
      const t = now();
      const [jobs, quotes, invoices] = await Promise.all([
        client.customerJobs(partnerId, LIMIT),
        apps?.sales ? fetchForCustomer(client, 'quotations', partnerId, LIMIT, t) : Promise.resolve([]),
        apps?.invoicing ? fetchForCustomer(client, 'invoices', partnerId, LIMIT, t) : Promise.resolve([]),
      ]);
      if (n !== asked.current) return;
      const got = { jobs, quotes, invoices, at: t };
      setRecords(got);
      setFresh(true);
      const all = parseSavedRecords(await AsyncStorage.getItem(CUSTOMER_ODOO_STORAGE_KEY).catch(() => null));
      all[String(partnerId)] = got;
      AsyncStorage.setItem(CUSTOMER_ODOO_STORAGE_KEY, JSON.stringify(all)).catch(() => undefined);
    } catch (e) {
      if (n !== asked.current) return;
      setError(message(e));
      log.warn('odoo', `customer records: ${message(e)}`);
    }
  }, [client, partnerId, now]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { records, fresh, error, online: !!client };
}

export function CustomerOdoo({ partnerId, now = Date.now }: { partnerId: number; now?: () => number }) {
  const { records, fresh, error } = useCustomerRecords(partnerId, now);
  const openJob = useOpenOdooJob();
  const { invoices: local } = useInvoices();
  const t0 = now();
  const openRecord = (kind: ListKind, r: OdooListRow) => {
    const mine = kind === 'invoices' ? local.find((i) => i.odoo?.id === r.id) : undefined;
    if (mine) router.push({ pathname: '/invoice/[id]', params: { id: mine.id } });
    else router.push({ pathname: '/odoo-record/[kind]/[id]', params: { kind, id: String(r.id) } });
  };

  const owed = (records?.invoices ?? []).filter((r) => r.warn).reduce((n, r) => n + (r.residual ?? 0), 0);

  return (
    <View style={styles.stack} testID="customer-odoo">
      {owed > 0 ? (
        <Text style={styles.owed} testID="customer-odoo-owed">
          Owes {formatMoney(owed)} in Odoo
        </Text>
      ) : null}
      {error ? (
        <Text style={styles.error} testID="customer-odoo-error">
          Couldn&apos;t read Odoo: {error}
          {records && !fresh ? ` Showing what was read ${dayLabel(records.at, t0)} ${formatTime(records.at)}.` : ''}
        </Text>
      ) : null}

      <Text style={styles.section} accessibilityRole="header">
        Jobs
      </Text>
      {records === null ? <Text style={styles.meta}>Reading Odoo...</Text> : null}
      {records && records.jobs.length === 0 ? <Text style={styles.meta}>No jobs in Odoo for this customer.</Text> : null}
      {(records?.jobs ?? []).map((t) => {
        const when = t.start ?? t.deadline;
        return (
          <Pressable key={t.id} onPress={() => openJob(t)} accessibilityRole="button" accessibilityHint="Opens this job" testID={`customer-odoo-job-${t.id}`} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
            <View style={styles.top}>
              <Text style={styles.title}>{whatOf(t)}</Text>
              {t.stage ? <Text style={styles.badge}>{t.stage.toUpperCase()}</Text> : null}
            </View>
            {t.address ? <Text style={styles.detail}>{t.address}</Text> : null}
            <Text style={styles.meta}>{[t.name, when !== undefined ? `${dayLabel(when, t0)} ${formatTime(when)}` : 'No date'].join(' · ')}</Text>
          </Pressable>
        );
      })}

      <Rows title="Quotes" kind="quotations" rows={records?.quotes} onOpen={openRecord} />
      <Rows title="Invoices" kind="invoices" rows={records?.invoices} onOpen={openRecord} />
    </View>
  );
}

function Rows({ title, kind, rows, onOpen }: { title: string; kind: ListKind; rows?: OdooListRow[]; onOpen: (kind: ListKind, r: OdooListRow) => void }) {
  if (!rows || rows.length === 0) return null;
  return (
    <>
      <Text style={styles.section} accessibilityRole="header">
        {title}
      </Text>
      {rows.map((r) => (
        <Pressable key={r.id} onPress={() => onOpen(kind, r)} accessibilityRole="button" testID={`customer-odoo-${kind}-${r.id}`} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
          <View style={styles.top}>
            <Text style={styles.title}>{r.name}</Text>
            <Text style={styles.title}>{formatMoney(r.refund ? -r.total : r.total)}</Text>
          </View>
          <Text style={[styles.meta, r.warn && styles.warn]}>
            {[r.status, r.residual && r.residual !== r.total && r.warn ? `${formatMoney(r.residual)} owed` : '', r.date !== undefined ? formatJobDate(r.date) : '', r.ref ?? ''].filter(Boolean).join(' · ')}
          </Text>
        </Pressable>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  section: { fontSize: type.value, fontWeight: '900', color: colors.text, marginTop: 8 },
  item: { minHeight: touch.min, padding: 12, gap: 2, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flexShrink: 1, fontSize: type.body, fontWeight: '900', color: colors.text },
  badge: { fontSize: 14, fontWeight: '900', color: colors.text, backgroundColor: colors.safety, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', letterSpacing: 1 },
  detail: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  warn: { color: colors.stop },
  owed: { fontSize: type.value, fontWeight: '900', color: colors.stop },
  error: { fontSize: 16, fontWeight: '700', color: colors.stop },
  pressed: { backgroundColor: colors.safety },
});
