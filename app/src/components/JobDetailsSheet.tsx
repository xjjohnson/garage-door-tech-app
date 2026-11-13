import { useEffect, useState } from 'react';
import { AddressSuggestions } from './AddressSuggestions';
import { useKeyboardHeight } from '../lib/useKeyboardHeight';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { suggestCustomers } from '../lib/customers';
import { EMPTY_DETAILS, JobDetails } from '../lib/jobs';
import { useCustomersIfAny } from '../lib/useCustomers';
import { colors, touch, type } from '../theme';

const FIELDS: { key: keyof JobDetails; label: string; placeholder: string; multiline?: boolean; phone?: boolean }[] = [
  { key: 'customer', label: 'Customer', placeholder: 'Name' },
  { key: 'address', label: 'Address', placeholder: 'Street and town' },
  { key: 'phone', label: 'Phone', placeholder: 'Optional', phone: true },
  { key: 'notes', label: 'Notes', placeholder: 'Door, parts used, what was found', multiline: true },
];

/**
 * The customer's details for a job, typed on the phone's own keyboard. Save
 * needs a customer or an address so the job can be found again.
 */
export function JobDetailsSheet({
  visible,
  title,
  initial = EMPTY_DETAILS,
  saveLabel = 'Save job',
  onSave,
  onCancel,
}: {
  visible: boolean;
  title: string;
  initial?: JobDetails;
  saveLabel?: string;
  onSave: (details: JobDetails) => void;
  onCancel: () => void;
}) {
  const [details, setDetails] = useState<JobDetails>(initial);
  const kb = useKeyboardHeight();
  const [focused, setFocused] = useState<string | null>(null);
  useEffect(() => {
    if (visible) setDetails(initial);
  }, [visible, initial]);
  const canSave = details.customer.trim() !== '' || details.address.trim() !== '';
  const customers = useCustomersIfAny()?.customers ?? [];
  const suggestions = suggestCustomers(customers, details.customer);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={[styles.backdrop, Platform.OS !== 'ios' && kb > 0 && { paddingBottom: kb }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.dismiss} onPress={onCancel} accessibilityLabel="Cancel" />
        <View style={styles.sheet} testID="job-sheet">
          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Pressable onPress={onCancel} style={styles.cancel} accessibilityRole="button" testID="job-sheet-cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.fields}>
            {FIELDS.map((f) => (
              <View key={f.key} style={styles.field}>
                <Text style={styles.label}>{f.label}</Text>
                <TextInput
                  value={details[f.key]}
                  onChangeText={(v) => setDetails((d) => ({ ...d, [f.key]: v }))}
                  onFocus={() => setFocused(f.key)}
                  onBlur={() => setFocused((cur) => (cur === f.key ? null : cur))}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.muted}
                  multiline={f.multiline}
                  keyboardType={f.phone ? 'phone-pad' : 'default'}
                  autoCapitalize={f.phone ? 'none' : 'sentences'}
                  accessibilityLabel={f.label}
                  testID={`job-${f.key}`}
                  style={[styles.input, f.multiline && styles.multiline]}
                />
                {f.key === 'address' ? (
                  <AddressSuggestions typed={details.address} focused={focused === 'address'} reset={visible} onPick={(a) => setDetails((d) => ({ ...d, address: a.address }))} testID="job-place" />
                ) : null}
                {f.key === 'customer' && suggestions.length > 0 ? (
                  <View style={styles.suggestions} testID="customer-suggestions">
                    <Text style={styles.hint}>Repeat customer?</Text>
                    {suggestions.map((c) => (
                      <Pressable
                        key={c.id}
                        onPress={() => setDetails((d) => ({ ...d, customer: c.name, phone: c.phone || d.phone, address: d.address || c.address }))}
                        accessibilityRole="button"
                        testID={`suggest-${c.id}`}
                        style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
                      >
                        <Text style={styles.suggestionText} numberOfLines={2}>
                          {[c.name, c.phone, c.address].filter(Boolean).join(' · ')}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>
          {!canSave ? <Text style={styles.hint}>Enter a customer or an address.</Text> : null}
          <Pressable
            onPress={() => canSave && onSave(details)}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
            testID="job-sheet-save"
            style={({ pressed }) => [styles.save, !canSave && styles.saveOff, pressed && styles.pressed]}
          >
            {({ pressed }) => <Text style={[styles.saveText, pressed && styles.pressedText]}>{saveLabel}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 10, maxHeight: '90%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, fontSize: type.value, fontWeight: '900', color: colors.text },
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
  hint: { fontSize: 16, fontWeight: '700', color: colors.muted },
  suggestions: { gap: 6, marginTop: 4 },
  suggestion: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.card },
  suggestionText: { fontSize: type.body, fontWeight: '700', color: colors.text },
  save: { minHeight: touch.bar, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selected },
  saveOff: { backgroundColor: colors.muted },
  pressed: { backgroundColor: colors.safety },
  saveText: { fontSize: type.value, fontWeight: '900', color: colors.onSelected },
  pressedText: { color: colors.text },
});
