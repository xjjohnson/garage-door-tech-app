import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './AppText';
import { KeyboardBackdrop } from './KeyboardBackdrop';
import { categoryLevel, PriceBookItem, searchItems } from '../lib/priceBook';
import { formatMoney } from '../lib/prices';
import { colors, touch, type } from '../theme';

/**
 * Picks one product from the price book (Odoo's products, kept on the phone):
 * search by name, or walk the categories. Nothing here is typed in; a part
 * that isn't in Odoo gets made in Odoo first.
 */
export function PriceBookPicker({ visible, items, title = 'Add from the price book', onPick, onClose }: { visible: boolean; items: PriceBookItem[]; title?: string; onPick: (i: PriceBookItem) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [path, setPath] = useState<string[]>([]);
  const searching = q.trim() !== '';
  const level = useMemo(() => categoryLevel(items, path), [items, path]);
  const found = useMemo(() => (searching ? searchItems(items, q).slice(0, 60) : []), [items, q, searching]);
  if (!visible) return null;
  const close = () => {
    setQ('');
    setPath([]);
    onClose();
  };
  const row = (i: PriceBookItem) => (
    <Pressable key={i.id} onPress={() => { setQ(''); setPath([]); onPick(i); }} accessibilityRole="button" testID={`pb-pick-${i.id}`} style={({ pressed }) => [styles.pick, pressed && styles.pressed]}>
      <View style={styles.grow}>
        <Text style={styles.body}>{i.name}</Text>
        {i.code ? <Text style={styles.meta}>{i.code}</Text> : null}
      </View>
      <Text style={styles.body}>{formatMoney(i.cents)}</Text>
    </Pressable>
  );
  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <KeyboardBackdrop style={styles.backdrop}>
        <View style={styles.sheet} testID="pb-picker">
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={close} style={styles.close} accessibilityRole="button" testID="pb-picker-close">
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <TextInput value={q} onChangeText={setQ} placeholder="Search name, part number or category" placeholderTextColor={colors.muted} accessibilityLabel="Search the price book" autoCorrect={false} testID="pb-picker-search" style={styles.input} />
          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {items.length === 0 ? <Text style={styles.body}>The price book is empty. Sign in to Odoo and it fills from your products.</Text> : null}
            {searching ? (
              found.length === 0 ? <Text style={styles.body}>{`Nothing in the price book matches "${q.trim()}". Add it in Odoo first.`}</Text> : found.map(row)
            ) : (
              <>
                {path.length > 0 ? (
                  <Pressable onPress={() => setPath(path.slice(0, -1))} accessibilityRole="button" testID="pb-picker-up" style={({ pressed }) => [styles.pick, pressed && styles.pressed]}>
                    <Text style={styles.body}>‹ {path.join(' › ')}</Text>
                  </Pressable>
                ) : null}
                {level.folders.map((f) => (
                  <Pressable key={f.name} onPress={() => setPath([...path, f.name])} accessibilityRole="button" testID={`pb-folder-${f.name}`} style={({ pressed }) => [styles.pick, pressed && styles.pressed]}>
                    <Text style={[styles.body, styles.grow]}>{f.name}</Text>
                    <Text style={styles.meta}>{f.count}</Text>
                  </Pressable>
                ))}
                {level.items.map(row)}
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardBackdrop>
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
  pick: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  grow: { flex: 1 },
  body: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: 15, fontWeight: '700', color: colors.muted },
  pressed: { backgroundColor: colors.info },
});
