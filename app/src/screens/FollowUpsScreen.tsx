import { router } from 'expo-router';
import { invoiceNo } from '../lib/invoices';
import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { NewFollowUpSheet, dayAhead } from '../components/PlanSheets';
import { createManualFollowUp } from '../lib/odooFollowUps';
import { useOdoo } from '../lib/useOdoo';
import { followUpId, followUps, textLink } from '../lib/followups';
import { formatJobDate } from '../lib/jobs';
import { useCustomers } from '../lib/useCustomers';
import { useFollowUps } from '../lib/useFollowUps';
import { useInvoices } from '../lib/useInvoices';
import { colors, touch, type } from '../theme';

/**
 * Repeat work that's due: tune-ups, springs near the end of their life and
 * warranties about to end, each with a text to the customer ready to send.
 */
export function FollowUpsScreen({ now = Date.now }: { now?: () => number }) {
  const { invoices, business } = useInvoices();
  const { customers } = useCustomers();
  const { settings, dismissed, dismiss } = useFollowUps();
  const { client } = useOdoo();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const list = useMemo(() => followUps(invoices, settings, business, now(), dismissed), [invoices, settings, business, dismissed, now]);
  const t = now();

  const phoneFor = (customerId?: string) => customers.find((c) => c.id === customerId)?.phone ?? '';
  const withOdoo = customers.filter((c) => c.odooId).map((c) => ({ id: c.odooId as number, name: c.name || c.address || 'Customer' }));

  return (
    <View style={styles.stack} testID="followups">
      {client ? <Action label="New follow-up" primary onPress={() => { setProblem(null); setAdded(false); setAdding(true); }} testID="followup-new" /> : null}
      {added ? <Text style={styles.meta} testID="followup-added">Added as a to-do on the customer in Odoo.</Text> : null}
      <NewFollowUpSheet
        visible={adding}
        customers={withOdoo}
        busy={busy}
        error={problem}
        onCancel={() => setAdding(false)}
        onSave={async (f) => {
          if (!client || f.customerId === undefined) return;
          setBusy(true);
          setProblem(null);
          try {
            await createManualFollowUp(client, f.customerId, { title: f.title, note: f.note, due: dayAhead(f.days, Date.now()) });
            setAdding(false);
            setAdded(true);
          } catch (e) {
            setProblem(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      />
      {list.length === 0 ? (
        <View style={styles.empty} testID="followups-empty">
          <Text style={styles.emptyTitle}>Nothing due</Text>
          <Text style={styles.emptyBody}>Springs near the end of their life and warranties about to end show up here from your invoices, 45 days ahead. Yearly tune-ups are repeating visits on the customer's page.</Text>
        </View>
      ) : null}
      {list.map((f) => {
        const id = followUpId(f.kind, f.invoice);
        const sms = textLink(phoneFor(f.invoice.customerId), f.message);
        const overdue = f.due < t;
        return (
          <View key={id} style={[styles.item, overdue && styles.overdue]} testID={`followup-${id}`}>
            <Text style={styles.title}>{f.title}</Text>
            <Text style={styles.detail}>
              {f.invoice.billTo || 'Customer'}
              {f.invoice.address ? `, ${f.invoice.address}` : ''}
            </Text>
            <Text style={styles.meta}>
              {overdue ? 'Due since' : 'Due'} {formatJobDate(f.due)} · from invoice {invoiceNo(f.invoice)}, {formatJobDate(f.invoice.createdAt)}
            </Text>
            {sms ? (
              <Action label="Text the customer" primary onPress={() => Linking.openURL(sms).catch(() => undefined)} testID={`followup-text-${id}`} />
            ) : (
              <Text style={styles.meta}>No phone number saved for this customer.</Text>
            )}
            <View style={styles.row}>
              {f.invoice.customerId ? (
                <Action label="Customer" grow onPress={() => router.push({ pathname: '/customer/[id]', params: { id: f.invoice.customerId! } })} testID={`followup-customer-${id}`} />
              ) : null}
              <Action label="Done" grow onPress={() => dismiss(id)} testID={`followup-done-${id}`} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Action({ label, onPress, primary, grow, testID }: { label: string; onPress: () => void; primary?: boolean; grow?: boolean; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.button, grow && styles.grow, primary && styles.primary, pressed && styles.pressed]}>
      {({ pressed }) => <Text style={[styles.buttonText, primary && !pressed && styles.primaryText]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  empty: { padding: 12, borderRadius: 10, backgroundColor: colors.card, gap: 6 },
  emptyTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: 16, color: colors.text, lineHeight: 22 },
  item: { padding: 12, gap: 6, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  overdue: { borderWidth: 4, borderColor: colors.caution },
  title: { fontSize: type.value, fontWeight: '900', color: colors.text },
  detail: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected },
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  primaryText: { color: colors.onSelected },
});
