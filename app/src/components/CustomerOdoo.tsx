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
import { createManualFollowUp } from '../lib/odooFollowUps';
import { AgreementRow, createAgreement, createRepeat, editAgreement, endAgreement, fetchAgreements, fetchFrequencySets, fetchRepeats, FrequencySet, RepeatAction, RepeatRow, setRepeatState } from '../lib/odooRecurring';
import { Action } from './Buttons';
import { AgreementSheet, dayAhead, NewFollowUpSheet, RepeatSheet } from './PlanSheets';
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
  repeats?: RepeatRow[];
  agreements?: AgreementRow[];
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
      out[k] = { jobs: arr<OdooTask>(v.jobs, (x) => typeof x.id === 'number' && typeof x.name === 'string'), quotes: arr(v.quotes, row), invoices: arr(v.invoices, row), repeats: arr<RepeatRow>(v.repeats, (x) => typeof x.id === 'number' && typeof x.name === 'string'), agreements: arr<AgreementRow>(v.agreements, (x) => typeof x.id === 'number' && typeof x.name === 'string'), at: v.at };
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
      const [jobs, quotes, invoices, repeats, agreements] = await Promise.all([
        client.customerJobs(partnerId, LIMIT),
        apps?.sales ? fetchForCustomer(client, 'quotations', partnerId, LIMIT, t) : Promise.resolve([]),
        apps?.invoicing ? fetchForCustomer(client, 'invoices', partnerId, LIMIT, t) : Promise.resolve([]),
        // Optional apps: a missing one just shows nothing.
        client.session.kind === 'oca' ? fetchRepeats(client, partnerId, LIMIT).catch(() => []) : Promise.resolve([]),
        client.session.kind === 'oca' ? fetchAgreements(client, partnerId, LIMIT).catch(() => []) : Promise.resolve([]),
      ]);
      if (n !== asked.current) return;
      const got = { jobs, quotes, invoices, repeats, agreements, at: t };
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

  return { records, fresh, error, online: !!client, refresh };
}

export function CustomerOdoo({ partnerId, name = 'this customer', address = '', now = Date.now }: { partnerId: number; name?: string; address?: string; now?: () => number }) {
  const { client } = useOdoo();
  const { records, fresh, error, refresh } = useCustomerRecords(partnerId, now);
  const [sheet, setSheet] = useState<'repeat' | 'followup' | 'agreement' | null>(null);
  const [editing, setEditing] = useState<AgreementRow | undefined>();
  const [sets, setSets] = useState<FrequencySet[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const oca = client?.session.kind === 'oca';

  const run = async (job: () => Promise<unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      await job();
      setSheet(null);
      await refresh();
    } catch (e) {
      setProblem(message(e));
    } finally {
      setBusy(false);
    }
  };
  const openRepeat = () => {
    setProblem(null);
    setSheet('repeat');
    if (client) fetchFrequencySets(client).then(setSets).catch(() => setSets([]));
  };
  const openAgreement = (a?: AgreementRow) => {
    setProblem(null);
    setEditing(a);
    setSheet('agreement');
  };
  const end = (a: AgreementRow) =>
    client &&
    run(() =>
      endAgreement(
        client,
        a.id,
        Date.now(),
        (records?.repeats ?? []).filter((r) => r.agreementId === a.id && (r.status === 'Active' || r.status === 'Paused')).map((r) => r.id),
      ),
    );
  const change = (id: number, action: RepeatAction) => client && run(() => setRepeatState(client, id, action));
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

      <View style={styles.row}>
        <Action label="New follow-up" grow onPress={() => { setProblem(null); setSheet('followup'); }} testID="customer-new-followup" />
        {oca ? <Action label="Repeat visits" grow onPress={openRepeat} testID="customer-repeat" /> : null}
      </View>
      {oca ? <Action label="New agreement" onPress={() => openAgreement()} testID="customer-agreement" /> : null}
      <Plans repeats={records?.repeats} agreements={records?.agreements} onChange={change} onEdit={openAgreement} onEnd={end} busy={busy} />
      <AgreementSheet
        visible={sheet === 'agreement'}
        customer={name}
        editing={editing}
        repeats={records?.repeats ?? []}
        busy={busy}
        error={problem}
        onCancel={() => setSheet(null)}
        onSave={(a) =>
          client &&
          run(() =>
            editing
              ? editAgreement(client, editing.id, { name: a.name, notes: a.notes })
              : createAgreement(client, partnerId, { name: a.name, notes: a.notes, start: Date.now(), end: a.years ? Date.now() + a.years * 365 * 24 * 60 * 60 * 1000 : undefined, repeatId: a.repeatId }),
          )
        }
      />
      <RepeatSheet
        visible={sheet === 'repeat'}
        customer={name}
        sets={sets}
        busy={busy}
        error={problem}
        onCancel={() => setSheet(null)}
        onSave={(r) => client && run(() => createRepeat(client, partnerId, { customer: name, address, every: r.every, start: dayAhead(r.days, Date.now()), what: r.what }))}
      />
      <NewFollowUpSheet
        visible={sheet === 'followup'}
        customer={name}
        busy={busy}
        error={problem}
        onCancel={() => setSheet(null)}
        onSave={(f) => client && run(() => createManualFollowUp(client, partnerId, { title: f.title, note: f.note, due: dayAhead(f.days, Date.now()) }))}
      />
      <Rows title="Quotes" kind="quotations" rows={records?.quotes} onOpen={openRecord} />
      <Rows title="Invoices" kind="invoices" rows={records?.invoices} onOpen={openRecord} />
    </View>
  );
}

const span = (a?: string, b?: string) => [a, b].filter(Boolean).join(' to ');

/** Repeating visits and agreements read from Odoo; nothing shows when the customer has none. */
function Plans({ repeats, agreements, onChange, onEdit, onEnd, busy }: { repeats?: RepeatRow[]; agreements?: AgreementRow[]; onChange: (id: number, a: RepeatAction) => void; onEdit: (a: AgreementRow) => void; onEnd: (a: AgreementRow) => void; busy: boolean }) {
  return (
    <>
      {repeats && repeats.length ? (
        <>
          <Text style={styles.section} accessibilityRole="header">
            Repeating visits
          </Text>
          {repeats.map((r) => (
            <View key={r.id} style={styles.item} testID={`customer-odoo-repeat-${r.id}`}>
              <View style={styles.top}>
                <Text style={styles.title}>{r.name}</Text>
                {r.status ? <Text style={styles.badge}>{r.status.toUpperCase()}</Text> : null}
              </View>
              <Text style={styles.meta}>{[r.every, span(r.start, r.end), r.place].filter(Boolean).join(' · ')}</Text>
              {r.status === 'Active' || r.status === 'Paused' || r.status === 'Draft' ? (
                <View style={styles.row}>
                  {r.status === 'Active' ? <Action label="Pause" grow disabled={busy} onPress={() => onChange(r.id, 'pause')} testID={`customer-repeat-pause-${r.id}`} /> : <Action label="Start" grow disabled={busy} onPress={() => onChange(r.id, 'start')} testID={`customer-repeat-start-${r.id}`} />}
                  <Action label="Stop" grow disabled={busy} onPress={() => onChange(r.id, 'stop')} testID={`customer-repeat-stop-${r.id}`} />
                </View>
              ) : null}
            </View>
          ))}
        </>
      ) : null}
      {agreements && agreements.length ? (
        <>
          <Text style={styles.section} accessibilityRole="header">
            Agreements
          </Text>
          {agreements.map((a) => (
            <View key={a.id} style={styles.item} testID={`customer-odoo-agreement-${a.id}`}>
              <View style={styles.top}>
                <Text style={styles.title}>{a.name}</Text>
                {a.status ? <Text style={styles.badge}>{a.status.toUpperCase()}</Text> : null}
              </View>
              <Text style={styles.meta}>{[a.code, span(a.start, a.end), a.active ? '' : 'Archived'].filter(Boolean).join(' · ')}</Text>
              {a.notes ? <Text style={styles.detail}>{a.notes}</Text> : null}
              {(repeats ?? []).some((r) => r.agreementId === a.id) ? <Text style={styles.meta}>Covers: {(repeats ?? []).filter((r) => r.agreementId === a.id).map((r) => r.every ?? r.name).join(', ')}</Text> : null}
              {a.active ? (
                <View style={styles.row}>
                  <Action label="Edit" grow disabled={busy} onPress={() => onEdit(a)} testID={`customer-agreement-edit-${a.id}`} />
                  <Action label="End today" grow disabled={busy} onPress={() => onEnd(a)} testID={`customer-agreement-end-${a.id}`} />
                </View>
              ) : null}
            </View>
          ))}
        </>
      ) : null}
    </>
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
  row: { flexDirection: 'row', gap: 8 },
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
