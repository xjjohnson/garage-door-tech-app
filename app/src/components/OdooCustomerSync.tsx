import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { Icon } from './Icon';
import { OdooError } from '../lib/odoo';
import { CrampedAddress, crampedAddresses, splitAddresses } from '../lib/odooContacts';
import { useCustomerSync } from '../lib/useCustomerSync';
import { useOdoo } from '../lib/useOdoo';
import { colors, radius, shadow, touch, type } from '../theme';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * At the top of Customers when signed in to Odoo: one tap brings in Odoo's
 * customers and sends the phone's new or changed ones to Odoo. Offline, the
 * list works as before and the next sync catches up.
 */
export function OdooCustomerSync({ now = Date.now }: { now?: () => number }) {
  const { status, client } = useOdoo();
  const syncCustomers = useCustomerSync(now);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cramped, setCramped] = useState<CrampedAddress[]>([]);
  const [fixed, setFixed] = useState<string | null>(null);
  // Contacts left out of the split (unticked).
  const [skip, setSkip] = useState<Set<number>>(new Set());
  if (status !== 'signedIn' || !client) return null;

  const sync = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await syncCustomers());
      setFixed(null);
      setSkip(new Set());
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
      const picked = cramped.filter((a) => !skip.has(a.id));
      const n = await splitAddresses(client, picked);
      setFixed(`Split ${n} ${n === 1 ? 'address' : 'addresses'} into street, city and ZIP in Odoo.`);
      setCramped((list) => list.filter((a) => skip.has(a.id)));
    } catch (e) {
      setError(e instanceof OdooError ? e.message : "Couldn't fix the addresses. Try again.");
      setCramped(await crampedAddresses(client).catch(() => []));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrapAll} testID="odoo-customers">
      <View style={styles.bar}>
        <Icon name="wrap" size={22} color={colors.selected} />
        <View style={styles.barText}>
          <Text style={styles.barTitle}>Synced with Odoo</Text>
          <Text style={styles.barSub} numberOfLines={2} testID={result && !busy && !error ? 'odoo-customers-result' : undefined}>
            {busy ? 'Syncing...' : error ? 'Last sync failed' : result ?? 'New and changed customers go on their own'}
          </Text>
        </View>
        <Pressable onPress={sync} disabled={busy} accessibilityRole="button" accessibilityLabel="Sync customers with Odoo" testID="odoo-customers-sync" style={({ pressed }) => [styles.barButton, busy && styles.off, pressed && styles.pressed]}>
          <Text style={styles.barButtonText}>{busy ? 'Syncing' : 'Sync now'}</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {cramped.length > 0 ? (
        <View style={styles.box} testID="odoo-cramped">
          <Text style={styles.note}>
            {plural(cramped.length, 'contact')} in Odoo {cramped.length === 1 ? 'has' : 'have'} the whole address in Street, so the City and ZIP boxes are empty. Here is what each becomes. Untick any to leave alone.
          </Text>
          {cramped.map((a) => {
            const on = !skip.has(a.id);
            return (
              <Pressable
                key={a.id}
                onPress={() =>
                  setSkip((cur) => {
                    const next = new Set(cur);
                    if (on) next.add(a.id);
                    else next.delete(a.id);
                    return next;
                  })
                }
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                testID={`odoo-cramped-${a.id}`}
                style={({ pressed }) => [styles.pick, pressed && styles.pressed]}
              >
                <Text style={styles.tick}>{on ? '☑' : '☐'}</Text>
                <View style={styles.grow}>
                  <Text style={styles.pickName}>{a.name}</Text>
                  <Text style={styles.note}>Now: {a.street}</Text>
                  <Text style={styles.note}>
                    Becomes: {[a.vals.street, a.vals.street2].filter(Boolean).join(', ')} · {a.vals.city} {a.vals.zip}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          <Pressable onPress={split} disabled={busy || skip.size >= cramped.length} accessibilityRole="button" testID="odoo-cramped-fix" style={({ pressed }) => [styles.button, (busy || skip.size >= cramped.length) && styles.off, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>{`Split ${plural(cramped.length - skip.size, 'ticked contact')} into street, city and ZIP`}</Text>
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
  wrapAll: { gap: 8 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 12, paddingRight: 8, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, ...shadow },
  barText: { flex: 1, gap: 1 },
  barTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  barSub: { fontSize: 14, fontWeight: '600', color: colors.muted },
  barButton: { minHeight: 44, minWidth: 88, borderRadius: radius.field, borderWidth: 1.5, borderColor: colors.selected, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  barButtonText: { fontSize: 15, fontWeight: '800', color: colors.selected },
  box: { gap: 8, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  error: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  button: { minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.card },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  off: { opacity: 0.5 },
  pick: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', minHeight: touch.min, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  tick: { fontSize: 24, color: colors.text },
  grow: { flex: 1 },
  pickName: { fontSize: type.body, fontWeight: '800', color: colors.text },
  pressed: { backgroundColor: colors.info },
});
