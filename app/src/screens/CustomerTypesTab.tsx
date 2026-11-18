import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { renameCustomerType, typesFor } from '../lib/customerTypes';
import type { OdooClient } from '../lib/odoo';
import { queueBusiness } from '../lib/settingsSync';
import { useInvoices } from '../lib/useInvoices';
import { colors, touch, type } from '../theme';

/**
 * Management > Customer types: the kinds of customer (Homeowner, Commercial,
 * property manager...). Rename, move up or down, add or remove. Each type is
 * a tag on the customer's contact in Odoo; a renamed type renames its Odoo tag
 * so customers keep it. Maintenance plans can be limited to some types.
 */
export function CustomerTypesTab({ client, canEdit }: { client: OdooClient | undefined; canEdit: boolean }) {
  const { business, setBusiness } = useInvoices();
  const start = typesFor(business);
  const [rows, setRows] = useState<string[]>(start);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const edit = (next: string[]) => {
    setRows(next);
    setSaved(false);
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j]!, next[i]!];
    edit(next);
  };
  const save = async () => {
    setErr('');
    const clean = rows.map((r) => r.trim()).filter(Boolean).filter((r, i, a) => a.indexOf(r) === i);
    // A type renamed in place (same position, new name) renames its tag in Odoo.
    if (client) {
      for (let i = 0; i < Math.min(start.length, rows.length); i++) {
        const from = start[i]!;
        const to = rows[i]!.trim();
        if (to && from !== to && !start.includes(to)) {
          try {
            await renameCustomerType(client, from, to);
          } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
            return;
          }
        }
      }
    }
    const next = { ...business, customerTypes: clean };
    setBusiness(() => next);
    queueBusiness(next);
    setSaved(true);
  };
  return (
    <View style={styles.stack} testID="manage-customer-types">
      <Text style={styles.note}>The kinds of customer you serve. Each one is a tag on the customer in Odoo, set on the customer's page. Maintenance plans can be offered to some types only.</Text>
      {rows.map((r, i) => (
        <View key={i} style={styles.row} testID={`manage-type-${i}`}>
          <TextInput value={r} onChangeText={(v) => edit(rows.map((x, j) => (j === i ? v : x)))} editable={canEdit} placeholder="Type, like Homeowner" placeholderTextColor={colors.muted} accessibilityLabel="Customer type" testID={`manage-type-name-${i}`} style={[styles.input, styles.grow]} />
          {canEdit ? (
            <>
              <Pressable onPress={() => move(i, -1)} accessibilityRole="button" accessibilityLabel="Move up" testID={`manage-type-up-${i}`} style={styles.small}>
                <Text style={styles.buttonText}>↑</Text>
              </Pressable>
              <Pressable onPress={() => move(i, 1)} accessibilityRole="button" accessibilityLabel="Move down" testID={`manage-type-down-${i}`} style={styles.small}>
                <Text style={styles.buttonText}>↓</Text>
              </Pressable>
              <Pressable onPress={() => edit(rows.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel="Remove" testID={`manage-type-remove-${i}`} style={styles.small}>
                <Text style={styles.buttonText}>✕</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ))}
      {canEdit ? (
        <>
          <Pressable onPress={() => edit([...rows, ''])} accessibilityRole="button" testID="manage-type-add" style={styles.back}>
            <Text style={styles.buttonText}>Add a type</Text>
          </Pressable>
          <Pressable onPress={save} accessibilityRole="button" testID="manage-types-save" style={styles.primary}>
            <Text style={styles.primaryText}>Save to Odoo</Text>
          </Pressable>
          {saved ? <Text style={styles.note} testID="manage-types-saved">Saved. Removing a type here leaves the tag in Odoo, so customers keep it there.</Text> : null}
          {err ? <Text style={styles.note}>Not saved: {err}</Text> : null}
        </>
      ) : (
        <Text style={styles.note}>Only the owner can change the customer types.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  grow: { flex: 1 },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  input: { minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
  small: { minWidth: touch.min, minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  back: { minHeight: touch.min, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  primary: { minHeight: touch.min, borderRadius: 14, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: type.body, fontWeight: '800', color: colors.onSelected },
});
