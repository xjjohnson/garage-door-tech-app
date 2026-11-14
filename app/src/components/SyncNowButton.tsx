import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { log } from '../lib/log';
import { requestSyncNow } from '../lib/syncNow';
import { useOdoo } from '../lib/useOdoo';
import { colors, touch, type } from '../theme';

/**
 * Sync now, where it's easy to find (Today and Jobs): asks every background
 * sync (customers, jobs and visits, photos, invoices, truck parts) to run
 * right away, which also takes in what was deleted in Odoo. Shown when signed
 * in to Odoo.
 */
export function SyncNowButton({ testID = 'sync-now' }: { testID?: string }) {
  const { status, client } = useOdoo();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (status !== 'signedIn' || !client) return null;
  const go = async () => {
    setBusy(true);
    setDone(false);
    try {
      await requestSyncNow();
      log.info('odoo', 'sync now (button)');
      setDone(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.row}>
      <Pressable onPress={go} disabled={busy} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.button, busy && styles.off, pressed && styles.pressed]}>
        <Text style={styles.text}>{busy ? 'Syncing...' : 'Sync now'}</Text>
      </Pressable>
      {done ? (
        <Text style={styles.ok} testID={`${testID}-done`}>
          ✓ Synced with Odoo
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, backgroundColor: colors.bg },
  text: { fontSize: type.body, fontWeight: '800', color: colors.text },
  ok: { fontSize: 16, color: colors.muted, fontWeight: '700' },
  off: { opacity: 0.5 },
  pressed: { backgroundColor: colors.info },
});
