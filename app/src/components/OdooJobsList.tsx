/**
 * The Jobs tab's list when signed in to Odoo: every Field Service order (or
 * task), whoever has it, newest planned first, not only jobs made on this
 * phone. Tapping one opens its job page, making the phone's side of it the
 * first time. The last open list read is kept, so it still shows with no
 * signal.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { VisitCard } from './VisitCard';
import { Text } from './AppText';
import { log } from '../lib/log';
import type { OdooTask } from '../lib/odoo';
import { whatOf } from '../lib/odooJobs';
import { dayLabel, formatTime } from '../lib/schedule';
import { invoiceStatus } from '../lib/invoices';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';
import { useOpenOdooJob } from '../lib/useStartJob';
import { colors, touch, type, bw, fs, rad, sp } from '../theme';

export const ODOO_JOBS_STORAGE_KEY = 'odoo-jobs-list/v1';
const PAGE = 40;
const SEARCH_WAIT_MS = 400;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function parseSavedJobs(raw: string | null): { rows: OdooTask[]; at: number } | null {
  try {
    const d = raw ? JSON.parse(raw) : null;
    if (!d || !Array.isArray(d.rows) || typeof d.at !== 'number') return null;
    return { rows: d.rows.filter((r: unknown) => r && typeof (r as OdooTask).id === 'number' && typeof (r as OdooTask).name === 'string'), at: d.at };
  } catch {
    return null;
  }
}

/** The start of tomorrow on this phone: jobs planned from then on are upcoming. */
export function startOfTomorrow(now: number): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

export function OdooJobsList({ filter, search, owedJobIds, now = Date.now }: { filter: 'open' | 'done' | 'all' | 'upcoming'; search: string; /** When given, only jobs the phone has an unpaid invoice for. */ owedJobIds?: Set<string>; now?: () => number }) {
  const { client } = useOdoo();
  const { jobs } = useJobs();
  const { invoices } = useInvoices();
  const openJob = useOpenOdooJob();
  const [rows, setRows] = useState<OdooTask[] | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem(ODOO_JOBS_STORAGE_KEY)
      .then((raw) => {
        const saved = parseSavedJobs(raw);
        if (saved) {
          setRows((r) => r ?? saved.rows);
          setSavedAt((t) => t ?? saved.at);
        }
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(
    async (offset: number) => {
      if (!client) return;
      const n = ++asked.current;
      setBusy(true);
      setError(null);
      try {
        const page = await client.listJobs(filter, search, offset, PAGE, filter === 'upcoming' ? startOfTomorrow(now()) : undefined);
        if (n !== asked.current) return;
        setRows((r) => (offset === 0 ? page : [...(r ?? []), ...page]));
        setMore(page.length === PAGE);
        setSavedAt(null);
        if (offset === 0 && filter === 'open' && !search.trim()) AsyncStorage.setItem(ODOO_JOBS_STORAGE_KEY, JSON.stringify({ rows: page, at: now() })).catch(() => undefined);
      } catch (e) {
        if (n !== asked.current) return;
        setError(message(e));
        log.warn('odoo', `jobs list: ${message(e)}`);
      } finally {
        if (n === asked.current) setBusy(false);
      }
    },
    [client, filter, search, now],
  );

  // Straight away for a filter change; after a pause while a search is typed.
  useEffect(() => {
    if (!search.trim()) {
      load(0);
      return;
    }
    const t = setTimeout(() => load(0), SEARCH_WAIT_MS);
    return () => clearTimeout(t);
  }, [load, search]);

  const t0 = now();
  return (
    <View style={styles.stack} testID="odoo-jobs">
      {error ? (
        <Text style={styles.error} testID="odoo-jobs-error">
          Couldn&apos;t read Odoo&apos;s jobs: {error}
          {savedAt ? ` Showing the list from ${dayLabel(savedAt, t0)} ${formatTime(savedAt)}.` : ''}
        </Text>
      ) : null}
      {rows === null && busy ? <Text style={styles.meta}>Reading Odoo&apos;s jobs...</Text> : null}
      {rows && rows.length === 0 && !busy ? (
        <Text style={styles.meta} testID="odoo-jobs-empty">
          {search.trim() ? 'No jobs in Odoo match.' : filter === 'upcoming' ? 'Nothing planned after today. Visits from maintenance plans show up here once Odoo makes them, about 30 days ahead.' : filter === 'open' ? 'No open jobs in Odoo.' : 'No jobs in Odoo.'}
        </Text>
      ) : null}
      {(rows ?? []).map((t) => {
        const phoneJob = jobs.find((j) => j.odooJob?.id === t.id);
        if (owedJobIds && !(phoneJob && owedJobIds.has(phoneJob.id))) return null;
        const when = t.start ?? t.deadline;
        const started = !!phoneJob?.steps?.arrivedAt;
        // Work finished but not paid: say so instead of "In progress".
        const mine = phoneJob ? invoices.filter((i) => i.jobId === phoneJob.id && invoiceStatus(i) !== 'void') : [];
        const waiting = !!phoneJob?.steps?.workDoneAt && !(mine.length > 0 && mine.every((i) => invoiceStatus(i) === 'paid'));
        const stage = t.stage || 'New';
        return (
          <VisitCard
            key={t.id}
            top={t.name}
            chip={waiting ? 'Waiting for payment' : started ? 'In progress' : stage}
            tone={started || waiting ? 'on' : 'plain'}
            name={t.customer || t.name}
            address={t.address}
            what={whatOf(t)}
            note={when !== undefined ? `${dayLabel(when, t0)} ${formatTime(when)}` : 'No date'}
            onPress={() => openJob(t)}
            testID={`odoo-job-${t.id}`}
          />
        );
      })}
      {more ? (
        <Pressable onPress={() => load(rows?.length ?? 0)} disabled={busy} accessibilityRole="button" testID="odoo-jobs-more" style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>{busy ? 'Loading...' : 'Show more'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: sp(12) },
  item: { minHeight: touch.min, padding: sp(12), gap: sp(2), borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, backgroundColor: colors.card },
  headTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp(8) },
  name: { flex: 1, fontSize: type.value, fontWeight: '800', color: colors.text },
  badge: { fontSize: fs(14), fontWeight: '800', color: colors.text, backgroundColor: colors.warnBg, paddingHorizontal: sp(8), paddingVertical: sp(2), borderRadius: rad(6), overflow: 'hidden', letterSpacing: 1 },
  address: { fontSize: type.body, fontWeight: '700', color: colors.text },
  answer: { fontSize: type.body, fontWeight: '800', color: colors.text, marginTop: sp(4) },
  meta: { fontSize: fs(16), fontWeight: '600', color: colors.muted },
  error: { fontSize: fs(16), fontWeight: '700', color: colors.stop },
  button: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(10), backgroundColor: colors.card },
  pressed: { backgroundColor: colors.info },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
});
