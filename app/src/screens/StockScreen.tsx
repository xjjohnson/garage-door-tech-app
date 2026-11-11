import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChipRow, MeasureField, SectionTitle } from '../components/controls';
import { cents, formatMoney } from '../lib/prices';
import { CATEGORY_LABEL, findSupplier, isLow, orderLinks, orders, orderText, STOCK_CATEGORIES, StockItem, supplierNames } from '../lib/stock';
import { useInvoices } from '../lib/useInvoices';
import { NewStockItem, useStock } from '../lib/useStock';
import { colors, touch, type } from '../theme';

/** At the top of Jobs: how many items are low. */
export function StockButton() {
  const { items } = useStock();
  const low = items.filter(isLow).length;
  return (
    <Pressable onPress={() => router.push('/stock')} accessibilityRole="button" testID="open-stock" style={({ pressed }) => [styles.button, styles.grow, low > 0 && styles.lowButton, pressed && styles.pressed]}>
      <Text style={styles.buttonText}>{low > 0 ? `Truck stock: ${low} low` : 'Truck stock'}</Text>
    </Pressable>
  );
}

const blank = (): NewStockItem => ({ name: '', sku: '', category: 'parts', onHand: 0, min: 1, par: 2, supplier: '', costCents: 0 });

/**
 * What's on the truck, with + and - for each item, and an order for each
 * supplier when things run low, ready to text or email.
 */
export function StockScreen() {
  const store = useStock();
  const { items, suppliers, add, update, adjust, remove, addStarter, received, setSupplier } = store;
  const { business } = useInvoices();
  const [editing, setEditing] = useState<{ id?: string; item: NewStockItem } | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null);
  const due = orders(items);
  const names = supplierNames(store);

  return (
    <View style={styles.stack} testID="stock">
      {items.length === 0 ? (
        <View style={styles.empty} testID="stock-empty">
          <Text style={styles.emptyTitle}>Nothing on the truck yet</Text>
          <Text style={styles.emptyBody}>Start with a list of common springs and parts, then set how many you have, or add your own.</Text>
          <Action label="Add common items" primary onPress={addStarter} testID="stock-starter" />
        </View>
      ) : null}

      {due.length > 0 ? <SectionTitle first>To order</SectionTitle> : null}
      {due.map((o) => {
        const links = orderLinks(o, suppliers, business.name);
        const key = o.supplier || 'none';
        return (
          <View key={key} style={[styles.item, styles.order]} testID={`order-${key}`}>
            <Text style={styles.name}>{o.supplier || 'No supplier set'}</Text>
            {o.lines.map(({ item, qty }) => (
              <Text key={item.id} style={styles.detail}>
                {qty} x {item.name}
              </Text>
            ))}
            {o.costCents > 0 ? <Text style={styles.meta}>About {formatMoney(o.costCents)}</Text> : null}
            <View style={styles.row}>
              {links.sms ? <Action label="Text order" grow primary onPress={() => Linking.openURL(links.sms!).catch(() => undefined)} testID={`order-text-${key}`} /> : null}
              {links.email ? <Action label="Email order" grow onPress={() => Linking.openURL(links.email!).catch(() => undefined)} testID={`order-email-${key}`} /> : null}
              {!links.sms && !links.email ? <Action label="Share order" grow onPress={() => Share.share({ message: orderText(o, business.name) }).catch(() => undefined)} testID={`order-share-${key}`} /> : null}
            </View>
            <View style={styles.row}>
              <Action label="Got it, add to stock" grow onPress={() => received(o)} testID={`order-received-${key}`} />
              {o.supplier ? <Action label="Supplier contact" grow onPress={() => setEditingSupplier(o.supplier)} testID={`order-supplier-${key}`} /> : null}
            </View>
          </View>
        );
      })}

      {STOCK_CATEGORIES.map((cat) => {
        const list = items.filter((i) => i.category === cat).sort((a, b) => a.name.localeCompare(b.name));
        if (list.length === 0) return null;
        return (
          <View key={cat} style={styles.stack}>
            <SectionTitle>{CATEGORY_LABEL[cat]}</SectionTitle>
            {list.map((i) => (
              <Row key={i.id} i={i} onAdjust={(by) => adjust(i.id, by)} onEdit={() => setEditing({ id: i.id, item: { ...i } })} />
            ))}
          </View>
        );
      })}

      <Action label="Add an item" onPress={() => setEditing({ item: blank() })} testID="stock-add" />

      {names.length > 0 ? (
        <>
          <SectionTitle>Suppliers</SectionTitle>
          {names.map((n) => {
            const s = findSupplier(suppliers, n);
            return <Action key={n} label={`${n}${s?.phone || s?.email ? '' : ' (add phone or email)'}`} onPress={() => setEditingSupplier(n)} testID={`supplier-${n}`} />;
          })}
        </>
      ) : null}

      <ItemSheet
        value={editing?.item ?? null}
        isNew={!editing?.id}
        suppliers={names}
        onCancel={() => setEditing(null)}
        onSave={(item) => {
          if (editing?.id) update(editing.id, item);
          else add(item);
          setEditing(null);
        }}
        onDelete={() => {
          if (editing?.id) remove(editing.id);
          setEditing(null);
        }}
      />
      <SupplierSheet
        name={editingSupplier}
        initial={editingSupplier ? findSupplier(suppliers, editingSupplier) : undefined}
        onCancel={() => setEditingSupplier(null)}
        onSave={(s) => {
          setSupplier(s);
          setEditingSupplier(null);
        }}
      />
    </View>
  );
}

function Row({ i, onAdjust, onEdit }: { i: StockItem; onAdjust: (by: number) => void; onEdit: () => void }) {
  const low = isLow(i);
  return (
    <View style={[styles.item, low && styles.low]} testID={`stock-${i.id}`}>
      <Pressable onPress={onEdit} accessibilityRole="button" accessibilityHint="Edit this item" testID={`stock-edit-${i.id}`}>
        <Text style={styles.name}>{i.name}</Text>
        <Text style={styles.meta}>
          {low ? 'LOW · ' : ''}reorder at {i.min}, fill to {i.par}
          {i.supplier ? ` · ${i.supplier}` : ''}
        </Text>
      </Pressable>
      <View style={styles.row}>
        <Action label="−" grow onPress={() => onAdjust(-1)} testID={`stock-minus-${i.id}`} accessibilityLabel={`One less ${i.name}`} />
        <Text style={styles.count} testID={`stock-count-${i.id}`}>
          {i.onHand}
        </Text>
        <Action label="+" grow onPress={() => onAdjust(1)} testID={`stock-plus-${i.id}`} accessibilityLabel={`One more ${i.name}`} />
      </View>
    </View>
  );
}

function ItemSheet({
  value,
  isNew,
  suppliers,
  onSave,
  onCancel,
  onDelete,
}: {
  value: NewStockItem | null;
  isNew: boolean;
  suppliers: string[];
  onSave: (i: NewStockItem) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [f, setF] = useState<NewStockItem | null>(value);
  const [cost, setCost] = useState('');
  useEffect(() => {
    setF(value);
    setCost(value && value.costCents > 0 ? (value.costCents / 100).toFixed(2) : '');
  }, [value]);
  if (!f) return null;
  const set = (patch: Partial<NewStockItem>) => setF((p) => (p ? { ...p, ...patch } : p));
  const whole = (v: string) => Math.max(0, Math.round(Number.parseFloat(v) || 0));
  const canSave = f.name.trim() !== '';
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet} testID="stock-sheet">
          <View style={styles.titleRow}>
            <Text style={styles.sheetTitle}>{isNew ? 'Add an item' : 'Edit item'}</Text>
            <Pressable onPress={onCancel} style={styles.cancel} accessibilityRole="button" testID="stock-sheet-cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.fields}>
            <TextField label="Name" value={f.name} onChange={(name) => set({ name })} placeholder=".250 x 2 x 30 spring, rollers..." testID="stock-field-name" />
            <ChipRow options={STOCK_CATEGORIES.map((c) => ({ label: CATEGORY_LABEL[c], value: c }))} value={f.category} onChange={(category) => set({ category })} scroll testID="stock-field-category" />
            <MeasureField label="On the truck" value={String(f.onHand)} onChange={(v) => set({ onHand: whole(v) })} unit="" allowFraction={false} allowDecimal={false} testID="stock-field-onhand" />
            <MeasureField label="Reorder at" hint="Order when you're down to this many." value={String(f.min)} onChange={(v) => set({ min: whole(v) })} unit="" allowFraction={false} allowDecimal={false} testID="stock-field-min" />
            <MeasureField label="Fill to" hint="How many to have after an order. 0 never orders it." value={String(f.par)} onChange={(v) => set({ par: whole(v) })} unit="" allowFraction={false} allowDecimal={false} testID="stock-field-par" />
            <TextField label="Supplier" value={f.supplier} onChange={(supplier) => set({ supplier })} placeholder="Who you buy it from" testID="stock-field-supplier" />
            {suppliers.length > 0 ? <ChipRow options={suppliers.map((s) => ({ label: s, value: s }))} value={f.supplier} onChange={(supplier) => set({ supplier })} scroll testID="stock-field-suppliers" /> : null}
            <TextField label="Part number" value={f.sku} onChange={(sku) => set({ sku })} placeholder="Optional, goes on the order" testID="stock-field-sku" />
            <MeasureField label="Cost each" value={cost} onChange={setCost} unit="$" allowFraction={false} testID="stock-field-cost" />
            {!isNew ? <Action label="Delete this item" onPress={onDelete} testID="stock-delete" /> : null}
          </ScrollView>
          <Pressable
            onPress={() => canSave && onSave({ ...f, costCents: cents(cost) })}
            disabled={!canSave}
            accessibilityRole="button"
            testID="stock-sheet-save"
            style={({ pressed }) => [styles.save, !canSave && styles.saveOff, pressed && styles.pressed]}
          >
            <Text style={styles.saveText}>{isNew ? 'Add item' : 'Save item'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SupplierSheet({ name, initial, onSave, onCancel }: { name: string | null; initial?: { phone: string; email: string }; onSave: (s: { name: string; phone: string; email: string }) => void; onCancel: () => void }) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  useEffect(() => {
    setPhone(initial?.phone ?? '');
    setEmail(initial?.email ?? '');
  }, [name, initial]);
  if (name === null) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet} testID="supplier-sheet">
          <View style={styles.titleRow}>
            <Text style={styles.sheetTitle}>{name}</Text>
            <Pressable onPress={onCancel} style={styles.cancel} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
          <TextField label="Phone for texting orders" value={phone} onChange={setPhone} placeholder="The counter or your rep" keyboard="phone-pad" testID="supplier-phone" />
          <TextField label="Email for orders" value={email} onChange={setEmail} placeholder="orders@..." keyboard="email-address" testID="supplier-email" />
          <Pressable onPress={() => onSave({ name, phone: phone.trim(), email: email.trim() })} accessibilityRole="button" testID="supplier-save" style={({ pressed }) => [styles.save, pressed && styles.pressed]}>
            <Text style={styles.saveText}>Save supplier</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TextField({ label, value, onChange, placeholder, keyboard, testID }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; keyboard?: 'phone-pad' | 'email-address'; testID: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboard ?? 'default'}
        autoCapitalize={keyboard ? 'none' : 'sentences'}
        autoCorrect={false}
        accessibilityLabel={label}
        testID={testID}
        style={styles.input}
      />
    </View>
  );
}

function Action({ label, onPress, primary, grow, testID, accessibilityLabel }: { label: string; onPress: () => void; primary?: boolean; grow?: boolean; testID?: string; accessibilityLabel?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} testID={testID} style={({ pressed }) => [styles.button, grow && styles.grow, primary && styles.primary, pressed && styles.pressed]}>
      {({ pressed }) => <Text style={[styles.buttonText, primary && !pressed && styles.primaryText]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  empty: { padding: 12, borderRadius: 10, backgroundColor: colors.card, gap: 8 },
  emptyTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: 16, color: colors.text, lineHeight: 22 },
  item: { padding: 12, gap: 8, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  low: { borderWidth: 4, borderColor: colors.caution },
  order: { borderWidth: 4, borderColor: colors.selected },
  name: { fontSize: type.body, fontWeight: '900', color: colors.text },
  detail: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  count: { minWidth: 72, fontSize: type.big, fontWeight: '900', color: colors.text, textAlign: 'center', textAlignVertical: 'center' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  grow: { flex: 1 },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  lowButton: { borderWidth: 4, borderColor: colors.caution },
  primary: { backgroundColor: colors.selected },
  primaryText: { color: colors.onSelected },
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 10, maxHeight: '90%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sheetTitle: { flex: 1, fontSize: type.value, fontWeight: '900', color: colors.text },
  cancel: { minHeight: touch.min, paddingHorizontal: 12, justifyContent: 'center' },
  cancelText: { fontSize: type.body, fontWeight: '800', color: colors.text, textDecorationLine: 'underline' },
  fields: { gap: 12, paddingBottom: 4 },
  field: { gap: 4 },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  input: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.bg },
  save: { minHeight: touch.bar, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selected },
  saveOff: { backgroundColor: colors.muted },
  saveText: { fontSize: type.value, fontWeight: '900', color: colors.onSelected },
});
