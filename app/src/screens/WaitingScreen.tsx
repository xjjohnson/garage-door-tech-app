import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { customerName } from '../lib/customers';
import { invoiceLabel } from '../lib/invoices';
import { MODE_LABEL } from '../lib/jobs';
import { log } from '../lib/log';
import { formatMoney, TIER_LABEL } from '../lib/prices';
import { requestSyncNow } from '../lib/syncNow';
import { useCustomerSync } from '../lib/useCustomerSync';
import { useOdoo } from '../lib/useOdoo';
import { usePendingItems } from '../lib/usePending';
import { colors, touch, type } from '../theme';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Waiting for Odoo: every record on this phone that Odoo doesn't have yet,
 * each one tappable, with Sync now to send what goes on its own straight
 * away. Opened from Today's "Not in Odoo yet" line and Developer › To send.
 */
export function WaitingScreen() {
  const { status, client } = useOdoo();
  const items = usePendingItems();
  const syncCustomers = useCustomerSync();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const online = status === 'signedIn' && !!client;
  const none = !items.customers.length && !items.jobs.length && !items.quotes.length && !items.invoices.length && !items.payments.length;

  const syncNow = async () => {
    setBusy(true);
    setResult(null);
    const notes: string[] = [];
    try {
      if (items.customers.length) notes.push(await syncCustomers());
    } catch (e) {
      notes.push(`Customers didn't sync: ${message(e)}`);
    }
    // Let the screen take in the customers' new Odoo ids before jobs go, so a
    // job uses its customer's contact instead of looking for one.
    await new Promise((r) => setTimeout(r, 50));
    await requestSyncNow();
    log.info('odoo', 'sync now');
    setResult([...notes, 'Sent what goes on its own. Anything still listed needs the step shown under it.'].join(' '));
    setBusy(false);
  };

  return (
    <View style={styles.stack} testID="waiting">
      {none ? <Text style={styles.ok}>✓ Nothing waiting. Odoo has everything from this phone.</Text> : null}
      {online ? (
        <Pressable onPress={syncNow} disabled={busy || none} accessibilityRole="button" testID="waiting-sync" style={({ pressed }) => [styles.button, styles.primary, (busy || none) && styles.off, pressed && styles.pressed]}>
          {({ pressed }) => <Text style={[styles.buttonText, !pressed && styles.primaryText]}>{busy ? 'Syncing...' : 'Sync now'}</Text>}
        </Pressable>
      ) : (
        <Pressable onPress={() => router.push('/team')} accessibilityRole="button" testID="waiting-signin" style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Sign in to Odoo to sync</Text>
        </Pressable>
      )}
      {result ? (
        <Text style={styles.meta} testID="waiting-result">
          {result}
        </Text>
      ) : null}

      <Group title="Quotes" testID="waiting-quotes">
        {items.quotes.map((j) => (
          <Row
            key={j.id}
            testID={`waiting-quote-${j.id}`}
            title={`${j.customer.trim() || 'No name'} · ${TIER_LABEL[j.accepted!.tier]} ${formatMoney(j.accepted!.total)}`}
            detail={[j.what || j.summaryTitle || MODE_LABEL[j.mode], j.address].filter(Boolean).join(' · ')}
            how={j.ticket?.lines.length ? 'Picked by the customer, not in Odoo yet. Open its ticket and tap Save as estimate.' : 'Picked by the customer, not sent yet. Open it and tap Send to Odoo as a sales order.'}
            onPress={() => (j.ticket?.lines.length ? router.push({ pathname: '/ticket/[id]', params: { id: j.id } }) : router.push({ pathname: '/quote/[id]', params: { id: j.id } }))}
          />
        ))}
      </Group>
      <Group title="Jobs" testID="waiting-jobs">
        {items.jobs.map((j) => (
          <Row
            key={j.id}
            testID={`waiting-job-${j.id}`}
            title={`${j.customer.trim() || 'No name'} · ${j.what || j.summaryTitle || MODE_LABEL[j.mode]}`}
            detail={j.address}
            how="Goes to Odoo as a Field Service job on Sync now."
            onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })}
          />
        ))}
      </Group>
      <Group title="Customers" testID="waiting-customers">
        {items.customers.map((c) => (
          <Row
            key={c.id}
            testID={`waiting-customer-${c.id}`}
            title={customerName(c)}
            detail={c.address}
            how={c.odooId ? 'Changed on this phone. Goes to Odoo on Sync now.' : 'New on this phone. Goes to Odoo on Sync now.'}
            onPress={() => router.push({ pathname: '/customer/[id]', params: { id: c.id } })}
          />
        ))}
      </Group>
      <Group title="Invoices" testID="waiting-invoices">
        {items.invoices.map((i) => (
          <Row
            key={i.id}
            testID={`waiting-invoice-${i.id}`}
            title={`${invoiceLabel(i)} · ${formatMoney(i.total)}`}
            detail={i.billTo}
            how={i.autoSend ? 'Goes to Odoo on Sync now.' : 'Open it and tap Send to Odoo.'}
            onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: i.id } })}
          />
        ))}
        {items.payments.map(({ invoice: i, count }) => (
          <Row
            key={`pay-${i.id}`}
            testID={`waiting-payment-${i.id}`}
            title={`${count} ${count === 1 ? 'payment' : 'payments'} on ${invoiceLabel(i)}`}
            detail={i.billTo}
            how="Taken on this phone, not recorded in Odoo yet. Goes on Sync now."
            onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: i.id } })}
          />
        ))}
      </Group>
    </View>
  );
}

function Group({ title, testID, children }: { title: string; testID: string; children: React.ReactNode[] }) {
  if (children.length === 0) return null;
  return (
    <View style={styles.stack} testID={testID}>
      <Text style={styles.section} accessibilityRole="header">
        {title} ({children.length})
      </Text>
      {children}
    </View>
  );
}

function Row({ title, detail, how, onPress, testID }: { title: string; detail?: string; how: string; onPress: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <Text style={styles.title}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      <Text style={styles.meta}>{how}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  section: { fontSize: type.value, fontWeight: '900', color: colors.text, marginTop: 8 },
  item: { minHeight: touch.min, padding: 12, gap: 2, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg },
  title: { fontSize: type.body, fontWeight: '900', color: colors.text },
  detail: { fontSize: type.body, fontWeight: '600', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  ok: { fontSize: type.body, fontWeight: '800', color: colors.text },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected },
  primaryText: { color: colors.onSelected },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  off: { opacity: 0.5 },
  pressed: { backgroundColor: colors.safety },
});
