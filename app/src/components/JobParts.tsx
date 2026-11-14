import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './AppText';
import { KeyboardBackdrop } from './KeyboardBackdrop';
import { createProduct, searchProducts, StockProduct } from '../lib/odooStock';
import { findByCode, openPurchases, StockItem } from '../lib/stock';
import { boughtParts, ticketParts, unaccountedParts } from '../lib/ticket';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';
import { useStock } from '../lib/useStock';
import { useTruckSync } from '../lib/useTruckSync';
import { colors, touch, type } from '../theme';
import { BarcodeScanner } from './BarcodeScanner';

/**
 * On the job hub: parts used on this job. Each one comes off the truck count
 * (and so off the truck in Odoo, which syncs a few seconds later). Scan the
 * box, or pick from the truck list. A part that isn't on the truck is ordered
 * from the supplier in Odoo, to pick up or have delivered, and goes on the
 * job when it's in.
 */
export function JobParts({ jobId }: { jobId: string }) {
  const { items, used, purchases, takeParts, undoUse, orderForJob, receiveOrder } = useStock();
  const { client } = useOdoo();
  const { jobs, setTicket } = useJobs();
  const [scanning, setScanning] = useState(false);
  const [picking, setPicking] = useState(false);
  const [ordering, setOrdering] = useState<string | false>(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useTruckSync();
  const mine = (used ?? []).filter((u) => u.jobId === jobId);
  const waiting = openPurchases(purchases).filter((p) => p.jobId === jobId);
  const job = jobs.find((j) => j.id === jobId);
  const customer = job?.customer ?? '';
  const fromTicket = ticketParts(job?.ticket, items, used ?? [], jobId, purchases);
  const missing = unaccountedParts(job?.ticket, items, jobId, purchases).filter((p) => p.why === 'not-on-truck');
  const bought = boughtParts(job?.ticket);
  const markBought = (lineId: string, on: boolean) => setTicket(jobId, (t) => ({ ...t, bought: on ? [...(t.bought ?? []), lineId] : (t.bought ?? []).filter((x) => x !== lineId) }));

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    setNote(null);
    try {
      setNote(await fn());
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const take = (item: StockItem) => {
    takeParts(item.id, 1, jobId);
    setNote(item.onHand <= 0 ? `${item.name}: the truck count was already 0. Count the truck when you can.` : `${item.name} taken off the truck.`);
  };

  return (
    <View style={styles.card} testID="job-parts">
      <Text style={styles.label}>Parts used</Text>
      {missing.map((p) => (
        <View key={`m-${p.lineId}`} style={styles.waiting} testID={`job-part-missing-${p.lineId}`}>
          <Text style={styles.body}>
            {p.qty} x {p.name}
          </Text>
          <Text style={styles.note}>On the ticket but not on the truck. Order it, or say you bought it for this job, before Create invoice.</Text>
          <View style={styles.row}>
            <Button label="Order it" onPress={() => (client ? setOrdering(p.name) : setNote('Sign in to Odoo (Team) to order a part for this job.'))} testID={`job-part-missing-order-${p.lineId}`} />
            <Button label="Bought it" onPress={() => markBought(p.lineId, true)} testID={`job-part-missing-bought-${p.lineId}`} />
          </View>
        </View>
      ))}
      {bought.map((l) => (
        <View key={`b-${l.id}`} style={styles.line} testID={`job-part-bought-${l.id}`}>
          <Text style={[styles.body, styles.grow]}>
            {l.qty} x {l.name}
          </Text>
          <Text style={styles.note}>Bought for this job</Text>
          <Pressable onPress={() => markBought(l.id, false)} accessibilityRole="button" accessibilityLabel={`${l.name} wasn't bought for this job`} testID={`job-part-bought-undo-${l.id}`} style={styles.undo}>
            <Text style={styles.undoText}>Undo</Text>
          </Pressable>
        </View>
      ))}
      {mine.length === 0 && fromTicket.length === 0 && missing.length === 0 && bought.length === 0 ? <Text style={styles.body}>None yet. Materials on the ticket show here and come off the truck stock.</Text> : null}
      {fromTicket.map((p) => (
        <View key={`t-${p.itemId}`} style={styles.line} testID={`job-part-ticket-${p.itemId}`}>
          <Text style={[styles.body, styles.grow]}>
            {p.qty} x {p.name}
          </Text>
          <Text style={styles.note}>On the ticket; off the truck at Create invoice</Text>
        </View>
      ))}
      {mine.map((u) => (
        <View key={u.id} style={styles.line}>
          <Text style={[styles.body, styles.grow]}>
            {u.qty} x {u.name}
          </Text>
          {u.move && u.sentAt ? (
            <Text style={styles.note} testID={`job-part-moved-${u.id}`}>
              In Odoo
            </Text>
          ) : (
            <Pressable onPress={() => undoUse(u.id)} accessibilityRole="button" accessibilityLabel={`Put ${u.name} back on the truck`} testID={`job-part-undo-${u.id}`} style={styles.undo}>
              <Text style={styles.undoText}>Undo</Text>
            </Pressable>
          )}
        </View>
      ))}
      {waiting.map((po) => (
        <View key={po.id} style={styles.waiting} testID={`job-po-${po.name}`}>
          <Text style={styles.body}>
            {po.lines.map((l) => `${l.qty} x ${items.find((i) => i.id === l.itemId)?.name ?? 'part'}`).join(', ')}
          </Text>
          <Text style={styles.note}>
            {po.name} · {po.pickup ? `pick up at ${po.supplier}` : `${po.supplier} delivers`}
            {po.emailed ? ' · emailed' : ' · not emailed, call or text them'}
          </Text>
          <Button
            label={busy === po.id ? 'Receiving…' : 'Got it, put it on this job'}
            onPress={() =>
              !busy &&
              client &&
              run(po.id, async () => ((await receiveOrder(client, po.id)) ? `${po.name} received in Odoo and put on this job.` : `Odoo wants ${po.name} finished there (a backorder or a missing quantity). Validate the receipt in Odoo.`))
            }
            testID={`job-po-received-${po.name}`}
          />
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
      <Button
        label="Part not on the truck"
        onPress={() => (client ? setOrdering('') : setNote('Sign in to Odoo (Team) to order a part for this job.'))}
        testID="job-parts-order"
      />
      <BarcodeScanner
        visible={scanning}
        title="Scan a part used"
        onCode={(code) => {
          setScanning(false);
          const item = findByCode(items, code);
          if (item) take(item);
          else setNote(`Nothing on the truck has the code ${code}. Tap "Part not on the truck" to order it.`);
        }}
        onClose={() => setScanning(false)}
      />
      <TruckPicker visible={picking} items={items} onPick={(i) => { setPicking(false); take(i); }} onClose={() => setPicking(false)} />
      {ordering !== false && client ? (
        <OrderSheet
          initial={ordering}
          search={(q) => searchProducts(client, q)}
          make={async (name) => ({ id: await createProduct(client, { name }), name, code: '', barcode: '', costCents: 0 })}
          onClose={() => setOrdering(false)}
          onSend={(o) => {
            setOrdering(false);
            run('order', async () => {
              const po = await orderForJob(client, { ...o, jobId, jobName: customer });
              return `${po.name} sent to ${po.supplier}${po.emailed ? ' by email' : ". Odoo couldn't email it, so call or text them"}. ${o.pickup ? 'Pick it up' : "It's coming"}, then tap "Got it" to put it on this job.`;
            });
          }}
        />
      ) : null}
    </View>
  );
}

interface PartOrder {
  product: StockProduct;
  qty: number;
  supplier: string;
  pickup: boolean;
}

/** Finds the part in Odoo (or makes it), then how many, who from, and pickup or delivery. Sending is the last tap. */
function OrderSheet({ initial = '', search, make, onSend, onClose }: { initial?: string; search: (q: string) => Promise<StockProduct[]>; make: (name: string) => Promise<StockProduct>; onSend: (o: PartOrder) => void; onClose: () => void }) {
  const [q, setQ] = useState(initial);
  const [found, setFound] = useState<StockProduct[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [product, setProduct] = useState<StockProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [supplier, setSupplier] = useState('');
  const [pickup, setPickup] = useState(true);

  const look = async (fn: () => Promise<void>) => {
    setLooking(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLooking(false);
    }
  };
  const choose = (p: StockProduct) => {
    setProduct(p);
    setSupplier(p.vendor?.name ?? '');
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardBackdrop style={styles.backdrop}>
        <View style={styles.sheet} testID="job-order-sheet">
          <View style={styles.titleRow}>
            <Text style={styles.title}>{product ? 'Order it' : 'Which part?'}</Text>
            <Pressable onPress={onClose} style={styles.undo} accessibilityRole="button" testID="job-order-close">
              <Text style={styles.undoText}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {!product ? (
              <>
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  onSubmitEditing={() => q.trim() && look(async () => setFound(await search(q)))}
                  placeholder="Name, part number or barcode"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Search Odoo products"
                  returnKeyType="search"
                  testID="job-order-search"
                  style={styles.input}
                />
                <Button label={looking ? 'Looking…' : 'Search Odoo'} onPress={() => !looking && q.trim() && look(async () => setFound(await search(q)))} testID="job-order-go" />
                {found?.map((p) => (
                  <Pressable key={p.id} onPress={() => choose(p)} accessibilityRole="button" testID={`job-order-pick-${p.id}`} style={({ pressed }) => [styles.pick, pressed && styles.pressed]}>
                    <Text style={[styles.body, styles.grow]}>{p.name}</Text>
                    {p.code ? <Text style={styles.note}>{p.code}</Text> : null}
                  </Pressable>
                ))}
                {found && found.length === 0 ? (
                  <>
                    <Text style={styles.body}>No product in Odoo matches.</Text>
                    <Button label={looking ? 'Making…' : `Make "${q.trim()}" in Odoo`} onPress={() => !looking && look(async () => choose(await make(q.trim())))} testID="job-order-make" />
                  </>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.body}>{product.name}</Text>
                <View style={styles.line}>
                  <Button label="−" onPress={() => setQty((n) => Math.max(1, n - 1))} testID="job-order-minus" />
                  <Text style={[styles.count, styles.qty]} testID="job-order-qty">
                    {qty}
                  </Text>
                  <Button label="+" onPress={() => setQty((n) => n + 1)} testID="job-order-plus" />
                </View>
                <TextInput value={supplier} onChangeText={setSupplier} placeholder="Supplier" placeholderTextColor={colors.muted} accessibilityLabel="Supplier" testID="job-order-supplier" style={styles.input} />
                <View style={styles.row}>
                  <Choice label="I'll pick it up" on={pickup} onPress={() => setPickup(true)} testID="job-order-pickup" />
                  <Choice label="Have it delivered" on={!pickup} onPress={() => setPickup(false)} testID="job-order-delivery" />
                </View>
                <Text style={styles.note}>Makes a purchase order in Odoo for this job and emails it to {supplier.trim() || 'the supplier'}. It comes in on your truck.</Text>
                <Pressable
                  onPress={() => supplier.trim() && onSend({ product, qty, supplier: supplier.trim(), pickup })}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !supplier.trim() }}
                  testID="job-order-send"
                  style={({ pressed }) => [styles.button, styles.primary, !supplier.trim() && styles.disabled, pressed && styles.pressed]}
                >
                  {({ pressed }) => <Text style={[styles.buttonText, !pressed && styles.primaryText]}>{supplier.trim() ? `Send PO to ${supplier.trim()}` : 'Add the supplier first'}</Text>}
                </Pressable>
                <Button label="Different part" onPress={() => setProduct(null)} testID="job-order-back" />
              </>
            )}
            {err ? <Text style={styles.error}>{err}</Text> : null}
          </ScrollView>
        </View>
      </KeyboardBackdrop>
    </Modal>
  );
}

function Choice({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} testID={testID} style={({ pressed }) => [styles.button, on && styles.primary, pressed && styles.pressed]}>
      {({ pressed }) => <Text style={[styles.buttonText, on && !pressed && styles.primaryText]}>{label}</Text>}
    </Pressable>
  );
}

function TruckPicker({ visible, items, onPick, onClose }: { visible: boolean; items: StockItem[]; onPick: (i: StockItem) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  if (!visible) return null;
  const k = q.trim().toLowerCase();
  const list = items.filter((i) => !k || i.name.toLowerCase().includes(k) || i.sku.toLowerCase().includes(k)).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardBackdrop style={styles.backdrop}>
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
      </KeyboardBackdrop>
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
  pressed: { backgroundColor: colors.info },
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 10, maxHeight: '85%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: type.value, fontWeight: '900', color: colors.text },
  input: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text },
  list: { gap: 8, paddingBottom: 8 },
  pick: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  count: { fontSize: type.value, fontWeight: '900', color: colors.text },
  qty: { minWidth: 48, textAlign: 'center' },
  waiting: { gap: 6, borderWidth: 2, borderColor: colors.border, borderRadius: 10, padding: 10 },
  primary: { backgroundColor: colors.selected, borderColor: colors.selected },
  primaryText: { color: colors.onSelected },
  disabled: { opacity: 0.5 },
  error: { fontSize: 16, fontWeight: '800', color: colors.stop },
});
