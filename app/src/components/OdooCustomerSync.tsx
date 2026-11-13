import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { finishCustomerSync, planCustomerSync } from '../lib/customerSync';
import { OdooError } from '../lib/odoo';
import { CrampedAddress, crampedAddresses, splitAddresses } from '../lib/odooContacts';
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
  const [cramped, setCramped] = useState<CrampedAddress[]>([]);
  const [fixed, setFixed] = useState<string | null>(null);
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
      setFixed(null);
      setCramped(await crampedAddresses(client).catch(() => []));
    } catch (e) {
      setError(e instanceof OdooError ? e.message : "Couldn't sync with Odoo. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // Contacts with the whole address typed into Street: split only when asked.
  const split = async () => {
    setBusy(true);
    setError(null);
    try {
      const n = await splitAddresses(client, cramped);
      setFixed(`Split ${plural(n, 'address')} into street, city and ZIP in Odoo.`);
      setCramped([]);
    } catch (e) {
      setError(e instanceof OdooError ? e.message : "Couldn't fix the addresses. Try again.");
      setCramped(await crampedAddresses(client).catch(() => []));
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
      {cramped.length > 0 ? (
        <View style={styles.box} testID="odoo-cramped">
          <Text style={styles.note}>
            {plural(cramped.length, 'contact')} in Odoo {cramped.length === 1 ? 'has' : 'have'} the whole address in Street, so the City and ZIP boxes are empty. For example:
          </Text>
          {cramped.slice(0, 3).map((a) => (
            <Text key={a.id} style={styles.note}>
              {a.name}: {a.vals.street} · {[a.vals.city, a.vals.zip].filter(Boolean).join(' ')}
            </Text>
          ))}
          <Pressable onPress={split} disabled={busy} accessibilityRole="button" testID="odoo-cramped-fix" style={({ pressed }) => [styles.button, busy && styles.off, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>{`Split ${cramped.length === 1 ? 'it' : `all ${cramped.length}`} into street, city and ZIP`}</Text>
          </Pressable>
        </View>
      ) : null}
      {fixed ? (
        <Text style={styles.note} testID="odoo-cramped-done">
          {fixed}
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
