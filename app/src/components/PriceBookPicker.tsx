import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './AppText';
import { KeyboardBackdrop } from './KeyboardBackdrop';
import { categoryLevel, groupVariants, PriceBookItem, searchItems } from '../lib/priceBook';
import { formatMoney } from '../lib/prices';
import { colors, touch, type, bw, fs, rad, sp } from '../theme';

/**
 * Picks one product from the price book (Odoo's products, kept on the phone):
 * search by name, or walk the categories. Nothing here is typed in; a part
 * that isn't in Odoo gets made in Odoo first.
 */
export function PriceBookPicker({ visible, items, title = 'Add from the price book', initialQuery = '', onPick, onClose }: { visible: boolean; items: PriceBookItem[]; title?: string; /** What the search box starts with. */ initialQuery?: string; onPick: (i: PriceBookItem) => void; onClose: () => void }) {
  const [q, setQ] = useState(initialQuery);
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
        {i.variant && i.baseName ? <Text style={styles.meta}>{i.baseName}</Text> : null}
        <Text style={styles.body}>{i.variant ?? i.name}</Text>
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
                {groupVariants(level.items).map((g, n) => ('heading' in g ? <Text key={`h-${g.heading}-${n}`} style={styles.heading}>{g.heading}</Text> : row(g.item)))}
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
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: sp(16), gap: sp(10), maxHeight: '90%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: type.value, fontWeight: '800', color: colors.text },
  close: { minHeight: touch.min, paddingHorizontal: sp(12), justifyContent: 'center' },
  closeText: { fontSize: type.body, fontWeight: '800', color: colors.text, textDecorationLine: 'underline' },
  input: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, paddingHorizontal: sp(14), fontSize: type.body, fontWeight: '700', color: colors.text },
  list: { gap: sp(8), paddingBottom: sp(8) },
  pick: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: sp(8), paddingHorizontal: sp(12), paddingVertical: sp(8), borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border },
  grow: { flex: 1 },
  body: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: fs(15), fontWeight: '700', color: colors.muted },
  pressed: { backgroundColor: colors.info },
  heading: { fontSize: fs(15), fontWeight: '800', color: colors.muted, marginTop: sp(6) },
});
