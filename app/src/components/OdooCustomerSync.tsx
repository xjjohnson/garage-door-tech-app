import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { finishCustomerSync, planCustomerSync } from '../lib/customerSync';
import { OdooError } from '../lib/odoo';
import { useCustomers } from '../lib/useCustomers';
import { useOdoo } from '../lib/useOdoo';
import { colors, touch, type } from '../theme';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * At the top of Customers when signed in to Odoo: one tap brings in Odoo's
 * customers and sends the phone's new or changed ones to Odoo. Offline, the
 * list works as before and the next sync catches up.
 */
export function OdooCustomerSync({ now = Date.now }: { now?: () => number }) {
  const { status, client } = useOdoo();
  const { customers, apply } = useCustomers();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (status !== 'signedIn' || !client) return null;

  const sync = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    const before = customers;
    try {
      const plan = planCustomerSync(before, await client.partners(), now());
      const created: Record<string, number> = {};
      const sent = new Set<string>();
      try {
        for (const c of plan.toCreate) created[c.id] = await client.createPartner(c);
        for (const w of plan.toWrite) {
          await client.writePartner(w.odooId, w.fields);
          sent.add(w.customerId);
        }
      } finally {
        // Keep whatever made it across, even if Odoo stopped answering part way.
        apply((current) => finishCustomerSync(current, before, plan, created, sent));
      }
      const parts = [
        plan.added ? `brought in ${plural(plan.added, 'customer')} from Odoo` : '',
        plan.updated ? `updated ${plan.updated} with Odoo's changes` : '',
        plan.toCreate.length ? `added ${plan.toCreate.length} to Odoo` : '',
        plan.toWrite.length ? `sent ${plural(plan.toWrite.length, 'change')} to Odoo` : '',
      ].filter(Boolean);
      setResult(parts.length ? `Done: ${parts.join(', ')}.` : 'Customers already match Odoo.');
    } catch (e) {
      setError(e instanceof OdooError ? e.message : "Couldn't sync with Odoo. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.box} testID="odoo-customers">
      <Text style={styles.note}>Your Odoo customers come onto this phone, and customers added or changed here go to Odoo.</Text>
      <Pressable onPress={sync} disabled={busy} accessibilityRole="button" testID="odoo-customers-sync" style={({ pressed }) => [styles.button, busy && styles.off, pressed && styles.pressed]}>
        <Text style={styles.buttonText}>{busy ? 'Syncing...' : 'Sync customers with Odoo'}</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {result ? (
        <Text style={styles.note} testID="odoo-customers-result">
          {result}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, padding: 12, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  error: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  off: { opacity: 0.5 },
  pressed: { backgroundColor: colors.safety },
});
