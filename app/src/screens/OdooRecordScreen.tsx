import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Action } from '../components/Buttons';
import { formatJobDate } from '../lib/jobs';
import { log } from '../lib/log';
import { fetchRecord, ListKind, MODEL, OdooRecordDetail, odooWebLink } from '../lib/odooLists';
import { EmailResult, emailedText, emailRecord, partnerEmail } from '../lib/odooReports';
import { formatMoney } from '../lib/prices';
import { useOdoo } from '../lib/useOdoo';
import { colors, touch, type } from '../theme';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** One Odoo quotation or invoice: its lines and totals, emailed with Odoo's own template, or opened in Odoo. */
export function OdooRecordScreen({ kind, id, now = Date.now }: { kind: ListKind; id: number; now?: () => number }) {
  const { client } = useOdoo();
  const model = MODEL[kind];
  const [rec, setRec] = useState<OdooRecordDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailed, setEmailed] = useState<EmailResult | null>(null);

  useEffect(() => {
    if (!client) return;
    let alive = true;
    fetchRecord(client, model, id, now())
      .then((r) => alive && setRec(r))
      .catch((e) => alive && setError(message(e)));
    return () => {
      alive = false;
    };
  }, [client, model, id, now]);

  if (!client) return <Text style={styles.meta}>Sign in to Odoo (Jobs › Team) to open this.</Text>;
  if (error && !rec) return <Text style={styles.error} testID="odoo-record-error">Couldn't read Odoo: {error}</Text>;
  if (!rec) return <Text style={styles.meta}>Reading Odoo...</Text>;

  const what = kind === 'quotations' ? 'quotation' : 'invoice';
  const canEmail = kind === 'quotations' ? rec.status !== 'Cancelled' : rec.status !== 'Draft' && rec.status !== 'Cancelled';
  const ask = async () => {
    setBusy(true);
    setError(null);
    setEmailed(null);
    try {
      setConfirm(await partnerEmail(client, rec.partnerId));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    setConfirm(null);
    setBusy(true);
    try {
      const r = await emailRecord(client, model, rec.id, rec.partnerId);
      setEmailed(r);
      log.info('odoo', `${rec.name} email: ${r.state}`);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.stack} testID="odoo-record">
      <Text style={styles.title}>{rec.name}</Text>
      <Text style={styles.customer}>{rec.customer || 'No customer'}</Text>
      <Text style={[styles.meta, rec.warn && styles.warnText]} testID="odoo-record-status">
        {[rec.status, rec.date ? formatJobDate(rec.date) : '', rec.due && kind === 'invoices' ? `due ${formatJobDate(rec.due)}` : '', rec.ref].filter(Boolean).join(' · ')}
      </Text>

      <View style={styles.card}>
        {rec.lines.map((l, i) =>
          l.heading ? (
            <Text key={i} style={styles.heading}>
              {l.label}
            </Text>
          ) : (
            <View key={i} style={styles.line}>
              <Text style={styles.lineLabel}>
                {l.label}
                {l.qty !== 1 ? ` × ${l.qty}` : ''}
              </Text>
              <Text style={styles.lineValue}>{formatMoney(l.subtotal)}</Text>
            </View>
          ),
        )}
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Before tax</Text>
          <Text style={styles.lineValue}>{formatMoney(rec.untaxed)}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Tax</Text>
          <Text style={styles.lineValue}>{formatMoney(rec.tax)}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.total}>Total</Text>
          <Text style={styles.total} testID="odoo-record-total">
            {formatMoney(rec.total)}
          </Text>
        </View>
        {kind === 'invoices' && rec.residual && rec.residual > 0 && rec.status !== 'Draft' ? (
          <View style={styles.line}>
            <Text style={[styles.total, styles.warnText]}>Still owed</Text>
            <Text style={[styles.total, styles.warnText]} testID="odoo-record-owed">
              {formatMoney(rec.residual)}
            </Text>
          </View>
        ) : null}
      </View>

      {canEmail ? (
        confirm ? (
          <View style={styles.stack} testID="odoo-record-email-confirm">
            <Text style={styles.detail}>
              Email {confirm} Odoo's {what} {rec.name} ({formatMoney(rec.total)})?
            </Text>
            <Action label={`Send to ${confirm}`} primary disabled={busy} onPress={send} testID="odoo-record-email-send" />
            <Action label="Cancel" onPress={() => setConfirm(null)} testID="odoo-record-email-cancel" />
          </View>
        ) : (
          <Action label={busy ? 'Working...' : `Email the ${what}`} disabled={busy} onPress={ask} testID="odoo-record-email" />
        )
      ) : null}
      {emailed ? (
        <Text style={emailed.state === 'failed' ? styles.error : styles.detail} testID="odoo-record-emailed">
          {emailedText(emailed)}
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Action label="Open in Odoo" onPress={() => Linking.openURL(odooWebLink(client.session.url, model, rec.id)).catch(() => undefined)} testID="odoo-record-open" />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  title: { fontSize: type.value, fontWeight: '900', color: colors.text },
  customer: { fontSize: type.body, fontWeight: '800', color: colors.text },
  meta: { fontSize: 15, fontWeight: '600', color: colors.muted },
  detail: { fontSize: type.body, fontWeight: '700', color: colors.text },
  warnText: { color: colors.stop },
  error: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  card: { padding: 14, gap: 8, borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card, minHeight: touch.min },
  heading: { fontSize: 15, fontWeight: '900', letterSpacing: 0.5, color: colors.muted, marginTop: 4 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineLabel: { flex: 1, fontSize: type.body, color: colors.text },
  lineValue: { fontSize: type.body, fontWeight: '800', color: colors.text },
  total: { fontSize: type.value, fontWeight: '900', color: colors.text },
});
