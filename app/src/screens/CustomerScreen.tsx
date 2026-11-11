import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Customer, CustomerFields, customerName, emailLink, summarize } from '../lib/customers';
import { formatJobDate, MODE_LABEL, phoneLink } from '../lib/jobs';
import { formatMoney, TIER_LABEL } from '../lib/prices';
import { useCustomers } from '../lib/useCustomers';
import { balance, invoiceStatus, STATUS_LABEL } from '../lib/invoices';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { colors, touch, type } from '../theme';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** One customer: how to reach them, and every job at their place, newest first. */
export function CustomerScreen({ customer }: { customer: Customer }) {
  const { jobs } = useJobs();
  const { update } = useCustomers();
  const [editing, setEditing] = useState(false);
  const s = summarize(customer, jobs);
  const tel = phoneLink(customer.phone);
  const mail = emailLink(customer.email);
  const jobIds = new Set(s.jobs.map((j) => j.id));
  const theirInvoices = useInvoices().invoices.filter((i) => i.customerId === customer.id || jobIds.has(i.jobId));
  const owed = theirInvoices.filter((i) => invoiceStatus(i) !== 'void').reduce((n, i) => n + balance(i), 0);

  return (
    <View style={styles.stack} testID="customer">
      <Text style={styles.name}>{customerName(customer)}</Text>
      {customer.name && customer.address ? <Text style={styles.detail}>{customer.address}</Text> : null}
      {customer.phone ? <Text style={styles.detail}>Phone: {customer.phone}</Text> : null}
      {customer.email ? <Text style={styles.detail}>Email: {customer.email}</Text> : null}
      {customer.notes ? <Text style={styles.detail}>{customer.notes}</Text> : null}
      <Text style={styles.meta} testID="customer-totals">
        {plural(s.jobs.length, 'job')}
        {s.openJobs > 0 ? `, ${s.openJobs} open` : ''}
        {s.acceptedTotal > 0 ? `. ${formatMoney(s.acceptedTotal)} in accepted quotes` : ''}
        {`. Customer since ${formatJobDate(customer.createdAt)}.`}
      </Text>
      {owed > 0 ? (
        <Text style={styles.owed} testID="customer-owed">
          Owes {formatMoney(owed)}
        </Text>
      ) : null}

      {tel ? <Action label={`Call ${customer.phone}`} primary onPress={() => Linking.openURL(tel).catch(() => undefined)} testID="customer-call" /> : null}
      {tel ? <Action label="Text" onPress={() => Linking.openURL(tel.replace('tel:', 'sms:')).catch(() => undefined)} testID="customer-text" /> : null}
      {mail ? <Action label="Email" onPress={() => Linking.openURL(mail).catch(() => undefined)} testID="customer-email" /> : null}
      <Action label="Book a visit" onPress={() => router.push({ pathname: '/schedule', params: { book: customer.id } })} testID="customer-book" />
      <Action label="Edit customer" onPress={() => setEditing(true)} testID="customer-edit" />

      <Text style={styles.section} accessibilityRole="header">
        Jobs
      </Text>
      {s.jobs.map((j) => (
        <Pressable
          key={j.id}
          onPress={() => router.push({ pathname: '/quote/[id]', params: { id: j.id } })}
          accessibilityRole="button"
          accessibilityHint="Opens this job's quote"
          testID={`customer-job-${j.id}`}
          style={({ pressed }) => [styles.job, j.status === 'done' && styles.jobDone, pressed && styles.pressed]}
        >
          <Text style={styles.jobTitle}>{j.summaryTitle || MODE_LABEL[j.mode]}</Text>
          {j.address && j.address !== customer.address ? <Text style={styles.detail}>{j.address}</Text> : null}
          {j.accepted ? (
            <Text style={styles.detail}>
              Picked {TIER_LABEL[j.accepted.tier]}, {formatMoney(j.accepted.total)}
            </Text>
          ) : null}
          {j.notes ? <Text style={styles.meta}>{j.notes}</Text> : null}
          <Text style={styles.meta}>
            {formatJobDate(j.savedAt)} · {j.status === 'done' ? 'Done' : 'Open'}
          </Text>
        </Pressable>
      ))}

      {theirInvoices.length > 0 ? (
        <Text style={styles.section} accessibilityRole="header">
          Invoices
        </Text>
      ) : null}
      {theirInvoices.map((i) => (
        <Pressable
          key={i.id}
          onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: i.id } })}
          accessibilityRole="button"
          testID={`customer-invoice-${i.id}`}
          style={({ pressed }) => [styles.job, pressed && styles.pressed]}
        >
          <Text style={styles.jobTitle}>
            Invoice {i.number} · {STATUS_LABEL[invoiceStatus(i)]}
          </Text>
          <Text style={styles.meta}>
            {formatMoney(i.total)} · {formatJobDate(i.createdAt)}
          </Text>
        </Pressable>
      ))}

      <CustomerSheet
        visible={editing}
        initial={customer}
        onCancel={() => setEditing(false)}
        onSave={(f) => {
          update(customer.id, f);
          setEditing(false);
        }}
      />
    </View>
  );
}

const FIELDS: { key: keyof CustomerFields; label: string; placeholder: string; keyboard?: 'phone-pad' | 'email-address'; multiline?: boolean }[] = [
  { key: 'name', label: 'Name', placeholder: 'Person or business' },
  { key: 'phone', label: 'Phone', placeholder: 'Optional', keyboard: 'phone-pad' },
  { key: 'email', label: 'Email', placeholder: 'Optional', keyboard: 'email-address' },
  { key: 'address', label: 'Main address', placeholder: 'Street and town' },
  { key: 'notes', label: 'Notes', placeholder: 'Gate code, dog, best time to call', multiline: true },
];

/** The customer's details on the phone's own keyboard. A new name or phone is copied onto their jobs. */
function CustomerSheet({ visible, initial, onSave, onCancel }: { visible: boolean; initial: CustomerFields; onSave: (f: CustomerFields) => void; onCancel: () => void }) {
  const [f, setF] = useState<CustomerFields>(initial);
  useEffect(() => {
    if (visible) setF({ name: initial.name, phone: initial.phone, email: initial.email, address: initial.address, notes: initial.notes });
  }, [visible, initial]);
  const canSave = f.name.trim() !== '' || f.address.trim() !== '';
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.dismiss} onPress={onCancel} accessibilityLabel="Cancel" />
        <View style={styles.sheet} testID="customer-sheet">
          <View style={styles.titleRow}>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              Edit customer
            </Text>
            <Pressable onPress={onCancel} style={styles.cancel} accessibilityRole="button" testID="customer-sheet-cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.fields}>
            {FIELDS.map((x) => (
              <View key={x.key} style={styles.field}>
                <Text style={styles.label}>{x.label}</Text>
                <TextInput
                  value={f[x.key]}
                  onChangeText={(v) => setF((p) => ({ ...p, [x.key]: v }))}
                  placeholder={x.placeholder}
                  placeholderTextColor={colors.muted}
                  multiline={x.multiline}
                  keyboardType={x.keyboard ?? 'default'}
                  autoCapitalize={x.keyboard ? 'none' : 'sentences'}
                  accessibilityLabel={x.label}
                  testID={`customer-field-${x.key}`}
                  style={[styles.input, x.multiline && styles.multiline]}
                />
              </View>
            ))}
          </ScrollView>
          {!canSave ? <Text style={styles.meta}>Enter a name or an address.</Text> : null}
          <Pressable
            onPress={() => canSave && onSave(f)}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
            testID="customer-sheet-save"
            style={({ pressed }) => [styles.save, !canSave && styles.saveOff, pressed && styles.pressed]}
          >
            {({ pressed }) => <Text style={[styles.saveText, pressed && styles.pressedText]}>Save customer</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Action({ label, onPress, primary, testID }: { label: string; onPress: () => void; primary?: boolean; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.button, primary && styles.primary, pressed && styles.pressed]}>
      {({ pressed }) => <Text style={[styles.buttonText, primary && !pressed && styles.primaryText]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  name: { fontSize: type.big, fontWeight: '900', color: colors.text },
  detail: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  owed: { fontSize: type.value, fontWeight: '900', color: colors.stop },
  section: { fontSize: type.value, fontWeight: '900', color: colors.text, marginTop: 8 },
  job: { minHeight: touch.min, padding: 12, gap: 2, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg },
  jobDone: { backgroundColor: colors.card },
  jobTitle: { fontSize: type.body, fontWeight: '900', color: colors.text },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected },
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  primaryText: { color: colors.onSelected },
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 10, maxHeight: '90%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sheetTitle: { flex: 1, fontSize: type.value, fontWeight: '900', color: colors.text },
  cancel: { minHeight: touch.min, paddingHorizontal: 12, justifyContent: 'center' },
  cancelText: { fontSize: type.body, fontWeight: '800', color: colors.text, textDecorationLine: 'underline' },
  fields: { gap: 12, paddingBottom: 4 },
  field: { gap: 4 },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  input: {
    minHeight: touch.min,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: type.body,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  save: { minHeight: touch.bar, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selected },
  saveOff: { backgroundColor: colors.muted },
  saveText: { fontSize: type.value, fontWeight: '900', color: colors.onSelected },
  pressedText: { color: colors.text },
});
