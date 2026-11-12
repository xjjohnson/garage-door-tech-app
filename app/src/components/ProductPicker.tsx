import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StockProduct } from '../lib/odooStock';
import { colors, touch, type } from '../theme';

/**
 * Picks a product that's already in Odoo (the price book): Odoo's goods by
 * category to scroll, or search by name, internal reference or barcode.
 * Making a new part is the last thing on the list, for when it isn't there.
 */
export function ProductPicker({
  visible,
  title = 'Add from Odoo',
  load,
  onPick,
  onNew,
  onClose,
  onTruck,
}: {
  visible: boolean;
  title?: string;
  /** Odoo products for what's typed ('' for the list to scroll). */
  load: (q: string) => Promise<StockProduct[]>;
  onPick: (p: StockProduct) => void;
  /** Make a new part, with what was typed as its name. */
  onNew: (name: string) => void;
  onClose: () => void;
  /** Products already on the truck, marked in the list. */
  onTruck?: Set<number>;
}) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<StockProduct[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const asked = useRef(0);

  const look = (text: string) => {
    const n = ++asked.current;
    setErr(null);
    load(text).then(
      (r) => n === asked.current && setList(r),
      (e) => n === asked.current && setErr(e instanceof Error ? e.message : String(e)),
    );
  };

  useEffect(() => {
    if (!visible) return;
    setQ('');
    setList(null);
    look('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Search a moment after typing stops.
  useEffect(() => {
    if (!visible || !q.trim()) return;
    const t = setTimeout(() => look(q), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  if (!visible) return null;
  const groups: { name: string; items: StockProduct[] }[] = [];
  for (const p of list ?? []) {
    const name = q.trim() ? 'Matches' : p.category || 'Other';
    const g = groups.find((x) => x.name === name);
    if (g) g.items.push(p);
    else groups.push({ name, items: [p] });
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="product-picker">
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" testID="product-picker-close">
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <TextInput
            value={q}
            onChangeText={(t) => {
              setQ(t);
              if (!t.trim()) look('');
            }}
            onSubmitEditing={() => look(q)}
            placeholder="Search name, part number or barcode"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Search Odoo products"
            returnKeyType="search"
            autoCorrect={false}
            testID="product-picker-search"
            style={styles.input}
          />
          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {err ? <Text style={styles.error}>{err}</Text> : null}
            {!list && !err ? <Text style={styles.meta}>Reading Odoo…</Text> : null}
            {list && list.length === 0 ? <Text style={styles.body}>{q.trim() ? `Nothing in Odoo matches "${q.trim()}".` : 'No products in Odoo yet.'}</Text> : null}
            {groups.map((g) => (
              <View key={g.name} style={styles.list}>
                <Text style={styles.group}>{g.name.toUpperCase()}</Text>
                {g.items.map((p) => (
                  <Pressable key={p.id} onPress={() => onPick(p)} accessibilityRole="button" testID={`product-pick-${p.id}`} style={({ pressed }) => [styles.pick, pressed && styles.pressed]}>
                    <View style={styles.grow}>
                      <Text style={styles.body}>{p.name}</Text>
                      {p.code || onTruck?.has(p.id) ? (
                        <Text style={styles.meta}>
                          {[p.code, onTruck?.has(p.id) ? 'on the truck' : ''].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            ))}
            <Pressable onPress={() => onNew(q.trim())} accessibilityRole="button" testID="product-picker-new" style={({ pressed }) => [styles.newPart, pressed && styles.pressed]}>
              <Text style={styles.body}>Not in Odoo? Make a new part{q.trim() ? ` "${q.trim()}"` : ''}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 10, maxHeight: '90%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: type.value, fontWeight: '900', color: colors.text },
  close: { minHeight: touch.min, paddingHorizontal: 12, justifyContent: 'center' },
  closeText: { fontSize: type.body, fontWeight: '800', color: colors.text, textDecorationLine: 'underline' },
  input: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text },
  list: { gap: 8, paddingBottom: 8 },
  group: { fontSize: 15, fontWeight: '900', color: colors.muted, marginTop: 4 },
  pick: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  newPart: { minHeight: touch.min, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, marginTop: 8 },
  grow: { flex: 1 },
  body: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: 15, fontWeight: '700', color: colors.muted },
  error: { fontSize: 16, fontWeight: '800', color: colors.stop },
  pressed: { backgroundColor: colors.safety },
});
