import { router } from 'expo-router';
import { invoiceNo } from '../lib/invoices';
import { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { MeasureField, SectionTitle } from '../components/controls';
import { followUpId, followUps, textLink } from '../lib/followups';
import { formatJobDate } from '../lib/jobs';
import { TIER_LABEL, TIERS } from '../lib/prices';
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
  const { settings, dismissed, dismiss, setSettings } = useFollowUps();
  const list = useMemo(() => followUps(invoices, settings, business, now(), dismissed), [invoices, settings, business, dismissed, now]);
  const t = now();

  const phoneFor = (customerId?: string) => customers.find((c) => c.id === customerId)?.phone ?? '';
  const num = (v: string, fallback: number) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  return (
    <View style={styles.stack} testID="followups">
      {list.length === 0 ? (
        <View style={styles.empty} testID="followups-empty">
          <Text style={styles.emptyTitle}>Nothing due</Text>
          <Text style={styles.emptyBody}>Worn springs and warranty ends show up here from your invoices, 45 days ahead.</Text>
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

      <SectionTitle>Settings</SectionTitle>
      <Text style={styles.note}>Spring life is the rating (10,000, 25,000 or 50,000 cycles) divided by how often the door runs. These are the starting values: on each invoice you can pick that job's warranty and how often its door is used.</Text>
      <MeasureField label="Door uses a day" hint="One open and close is a use. About 4 is typical for a home." value={String(settings.cyclesPerDay)} onChange={(v) => setSettings((s) => ({ ...s, cyclesPerDay: num(v, s.cyclesPerDay) || s.cyclesPerDay }))} unit="cycles" allowFraction={false} testID="followup-cycles" />
      {TIERS.map((tier) => (
        <MeasureField
          key={tier}
          label={`${TIER_LABEL[tier]} spring warranty`}
          value={String(settings.warrantyMonths[tier])}
          onChange={(v) => setSettings((s) => ({ ...s, warrantyMonths: { ...s.warrantyMonths, [tier]: num(v, s.warrantyMonths[tier]) } }))}
          unit="months"
          allowFraction={false}
          allowDecimal={false}
          testID={`followup-warranty-${tier}`}
        />
      ))}
      <MeasureField label="Labor warranty" value={String(settings.laborWarrantyMonths)} onChange={(v) => setSettings((s) => ({ ...s, laborWarrantyMonths: num(v, s.laborWarrantyMonths) }))} unit="months" allowFraction={false} allowDecimal={false} testID="followup-labor" />
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
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected },
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  primaryText: { color: colors.onSelected },
});
