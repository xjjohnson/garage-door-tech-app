import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { log } from '../lib/log';
import { requestSyncNow } from '../lib/syncNow';
import { useOdoo } from '../lib/useOdoo';
import { Icon } from './Icon';
import { colors, radius, touch, type } from '../theme';

/**
 * Sync now, where it's easy to find (Today and Jobs): asks every background
 * sync (customers, jobs and visits, photos, invoices, truck parts) to run
 * right away, which also takes in what was deleted in Odoo. Shown when signed
 * in to Odoo.
 */
export function SyncNowButton({ testID = 'sync-now', label = 'Sync now' }: { testID?: string; label?: string }) {
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
        <Text style={styles.text}>{busy ? 'Syncing...' : label}</Text>
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
  button: { minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, backgroundColor: colors.card },
  text: { fontSize: type.body, fontWeight: '800', color: colors.text },
  ok: { fontSize: 16, color: colors.muted, fontWeight: '700' },
  off: { opacity: 0.5 },
  pressed: { backgroundColor: colors.info },
});

/** The Sync now pill that sits in the header on Today: same job as the button, in the 0.9 style. */
export function SyncPill({ testID = 'sync-now' }: { testID?: string }) {
  const { status, client } = useOdoo();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (status !== 'signedIn' || !client) return null;
  const go = async () => {
    setBusy(true);
    setDone(false);
    try {
      await requestSyncNow();
      log.info('odoo', 'sync now (header)');
      setDone(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable onPress={go} disabled={busy} accessibilityRole="button" testID={testID} style={({ pressed }) => [pill.button, busy && styles.off, pressed && pill.pressed]}>
      <Icon name={done && !busy ? 'check' : 'sync'} size={16} color={colors.onHead} />
      <Text style={pill.text}>{busy ? 'Syncing...' : done ? 'Synced' : 'Sync now'}</Text>
    </Pressable>
  );
}

const pill = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: touch.min - 12, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.2)' },
  pressed: { backgroundColor: 'rgba(255,255,255,0.35)' },
  text: { fontSize: 15, fontWeight: '800', color: colors.onHead },
});
