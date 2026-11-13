import { useEffect, useState } from 'react';
import { useKeyboardHeight } from '../lib/useKeyboardHeight';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChipRow } from './controls';
import { ADDRESS_TYPES, AddressFields, AddressType, EMPTY_ADDRESS } from '../lib/odooContacts';
import { colors, touch, type } from '../theme';

const FIELDS: { key: Exclude<keyof AddressFields, 'type'>; label: string; placeholder: string; keyboard?: 'phone-pad' | 'email-address' }[] = [
  { key: 'address', label: 'Address', placeholder: '400 Main St, Kyle 78640' },
  { key: 'name', label: 'Name', placeholder: 'Optional: tenant, unit or place' },
  { key: 'phone', label: 'Phone', placeholder: 'Optional', keyboard: 'phone-pad' },
  { key: 'email', label: 'Email', placeholder: 'Optional', keyboard: 'email-address' },
];

/** Adds or edits one of a customer's addresses in Odoo (a house, billing address, person...). */
export function AddressSheet({
  visible,
  initial,
  busy,
  error,
  onSave,
  onCancel,
}: {
  visible: boolean;
  /** The address being changed; none to add one. */
  initial?: AddressFields;
  busy?: boolean;
  error?: string | null;
  onSave: (f: AddressFields) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<AddressFields>(initial ?? EMPTY_ADDRESS);
  const kb = useKeyboardHeight();
  useEffect(() => {
    if (visible) setF(initial ?? EMPTY_ADDRESS);
  }, [visible, initial]);
  const canSave = !busy && (f.address.trim() !== '' || f.name.trim() !== '');
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={[styles.backdrop, Platform.OS !== 'ios' && kb > 0 && { paddingBottom: kb }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.dismiss} onPress={onCancel} accessibilityLabel="Cancel" />
        <View style={styles.sheet} testID="address-sheet">
          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header">
              {initial ? 'Edit address' : 'Add address'}
            </Text>
            <Pressable onPress={onCancel} style={styles.cancel} accessibilityRole="button" testID="address-sheet-cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.fields}>
            <Text style={styles.label}>Kind</Text>
            <ChipRow options={ADDRESS_TYPES.map((t) => ({ label: t.label, value: t.value }))} value={f.type} onChange={(v: AddressType) => setF((p) => ({ ...p, type: v }))} testID="address-type" />
            {FIELDS.map((x) => (
              <View key={x.key} style={styles.field}>
                <Text style={styles.label}>{x.label}</Text>
                <TextInput
                  value={f[x.key]}
                  onChangeText={(v) => setF((p) => ({ ...p, [x.key]: v }))}
                  placeholder={x.placeholder}
                  placeholderTextColor={colors.muted}
                  keyboardType={x.keyboard ?? 'default'}
                  autoCapitalize={x.keyboard ? 'none' : 'words'}
                  accessibilityLabel={x.label}
                  testID={`address-field-${x.key}`}
                  style={styles.input}
                />
              </View>
            ))}
          </ScrollView>
          {error ? (
            <Text style={styles.error} testID="address-error">
              {error}
            </Text>
          ) : null}
          <Pressable
            onPress={() => canSave && onSave(f)}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
            testID="address-sheet-save"
            style={({ pressed }) => [styles.save, !canSave && styles.saveOff, pressed && styles.pressed]}
          >
            <Text style={styles.saveText}>{busy ? 'Saving to Odoo...' : 'Save to Odoo'}</Text>
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
  input: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 8, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.bg },
  error: { fontSize: 16, fontWeight: '700', color: colors.stop },
  save: { minHeight: touch.bar, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selected },
  saveOff: { backgroundColor: colors.muted },
  pressed: { backgroundColor: colors.safety },
  saveText: { fontSize: type.value, fontWeight: '900', color: colors.onSelected },
});
