import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { findByCode, StockItem } from '../lib/stock';
import { useStock } from '../lib/useStock';
import { colors, touch, type } from '../theme';
import { BarcodeScanner } from './BarcodeScanner';

/**
 * On the job hub: parts used on this job. Each one comes off the truck count
 * (and so off the truck in Odoo at the next sync). Scan the box, or pick from
 * the truck list.
 */
export function JobParts({ jobId }: { jobId: string }) {
  const { items, used, takeParts, undoUse } = useStock();
  const [scanning, setScanning] = useState(false);
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const mine = (used ?? []).filter((u) => u.jobId === jobId);

  const take = (item: StockItem) => {
    takeParts(item.id, 1, jobId);
    setNote(item.onHand <= 0 ? `${item.name}: the truck count was already 0. Count the truck when you can.` : `${item.name} taken off the truck.`);
  };

  return (
    <View style={styles.card} testID="job-parts">
      <Text style={styles.label}>Parts used</Text>
      {mine.length === 0 ? <Text style={styles.body}>None yet. They come off the truck stock.</Text> : null}
      {mine.map((u) => (
        <View key={u.id} style={styles.line}>
          <Text style={[styles.body, styles.grow]}>
            {u.qty} x {u.name}
          </Text>
          <Pressable onPress={() => undoUse(u.id)} accessibilityRole="button" accessibilityLabel={`Put ${u.name} back on the truck`} testID={`job-part-undo-${u.id}`} style={styles.undo}>
            <Text style={styles.undoText}>Undo</Text>
          </Pressable>
        </View>
      ))}
      {note ? (
        <Text style={styles.note} testID="job-parts-note">
          {note}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button label="Scan a part" onPress={() => setScanning(true)} testID="job-parts-scan" />
        <Button label="Pick from truck" onPress={() => setPicking(true)} testID="job-parts-pick" />
      </View>
      <BarcodeScanner
        visible={scanning}
        title="Scan a part used"
        onCode={(code) => {
          setScanning(false);
          const item = findByCode(items, code);
          if (item) take(item);
          else setNote(`Nothing on the truck has the code ${code}. Add it in Truck stock first.`);
        }}
        onClose={() => setScanning(false)}
      />
      <TruckPicker visible={picking} items={items} onPick={(i) => { setPicking(false); take(i); }} onClose={() => setPicking(false)} />
    </View>
  );
}

function TruckPicker({ visible, items, onPick, onClose }: { visible: boolean; items: StockItem[]; onPick: (i: StockItem) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  if (!visible) return null;
  const k = q.trim().toLowerCase();
  const list = items.filter((i) => !k || i.name.toLowerCase().includes(k) || i.sku.toLowerCase().includes(k)).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="truck-picker">
          <View style={styles.titleRow}>
            <Text style={styles.title}>Which part?</Text>
            <Pressable onPress={onClose} style={styles.undo} accessibilityRole="button" testID="truck-picker-close">
              <Text style={styles.undoText}>Close</Text>
            </Pressable>
          </View>
          <TextInput value={q} onChangeText={setQ} placeholder="Search the truck" placeholderTextColor={colors.muted} accessibilityLabel="Search the truck" testID="truck-picker-search" style={styles.input} />
          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {list.length === 0 ? <Text style={styles.body}>{items.length === 0 ? 'Nothing in Truck stock yet.' : 'No match.'}</Text> : null}
            {list.map((i) => (
              <Pressable key={i.id} onPress={() => onPick(i)} accessibilityRole="button" testID={`truck-pick-${i.id}`} style={({ pressed }) => [styles.pick, pressed && styles.pressed]}>
                <Text style={[styles.body, styles.grow]}>{i.name}</Text>
                <Text style={styles.count}>{i.onHand}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Button({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 8 },
  label: { fontSize: 15, fontWeight: '900', color: colors.muted },
  body: { fontSize: type.body, fontWeight: '700', color: colors.text },
  note: { fontSize: 16, fontWeight: '700', color: colors.muted },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  row: { flexDirection: 'row', gap: 8 },
  undo: { minHeight: touch.min, paddingHorizontal: 12, justifyContent: 'center' },
  undoText: { fontSize: type.body, fontWeight: '800', color: colors.text, textDecorationLine: 'underline' },
  button: { flex: 1, minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, backgroundColor: colors.bg },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  pressed: { backgroundColor: colors.safety },
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 10, maxHeight: '85%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: type.value, fontWeight: '900', color: colors.text },
  input: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text },
  list: { gap: 8, paddingBottom: 8 },
  pick: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  count: { fontSize: type.value, fontWeight: '900', color: colors.text },
});
