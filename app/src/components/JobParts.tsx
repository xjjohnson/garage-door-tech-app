import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './AppText';
import { ChipRow } from './controls';
import { KeyboardBackdrop } from './KeyboardBackdrop';
import { createProduct, searchProducts, StockProduct } from '../lib/odooStock';
import { findByCode, openPurchases, StockItem } from '../lib/stock';
import { boughtParts, ticketParts, unaccountedParts } from '../lib/ticket';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';
import { useStock } from '../lib/useStock';
import { useTruckSync } from '../lib/useTruckSync';
import { colors, touch, type, bw, fs, rad, sp } from '../theme';
import { BarcodeScanner } from './BarcodeScanner';

/**
 * On the job hub: parts used on this job. Each one comes off the truck count
 * (and so off the truck in Odoo, which syncs a few seconds later). Scan the
 * box, or pick from the truck list. A part that isn't on the truck is ordered
 * from the supplier in Odoo, always a pickup, as a draft for the buyer, and goes on the
 * job once the warehouse has it and the tech picks it up.
 */
export function JobParts({ jobId }: { jobId: string }) {
  const { items, used, purchases, suppliers, takeParts, undoUse, orderForJob, jobOrderState, claimOrder } = useStock();
  const { client } = useOdoo();
  const { jobs, setTicket } = useJobs();
  const [scanning, setScanning] = useState(false);
  const [picking, setPicking] = useState(false);
  const [ordering, setOrdering] = useState<string | false>(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useTruckSync();
  const [where, setWhere] = useState<Record<string, 'buyer' | 'ordered' | 'ready' | 'gone'>>({});
  const mine = (used ?? []).filter((u) => u.jobId === jobId);
  const waiting = openPurchases(purchases).filter((p) => p.jobId === jobId);
  const job = jobs.find((j) => j.id === jobId);
  const waitingKey = waiting.map((p) => p.id).join(',');
  // Where each part order stands in Odoo: with the buyer, ordered, or received by the warehouse.
  useEffect(() => {
    if (!client || !waitingKey) return;
    let live = true;
    for (const id of waitingKey.split(',')) {
      jobOrderState(client, id).then((st) => live && setWhere((w) => ({ ...w, [id]: st })), () => undefined);
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, waitingKey]);
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
          <Text style={styles.note} testID={`job-po-status-${po.name}`}>
            {po.name} ·{' '}
            {where[po.id] === 'ready'
              ? `ready for you at the warehouse`
              : where[po.id] === 'ordered'
                ? `ordered from ${po.supplier}, waiting for the warehouse to receive it`
                : po.draft || where[po.id] === 'buyer'
                  ? 'with the buyer to review and send'
                  : `pick up at ${po.supplier} when it is in`}
          </Text>
          {where[po.id] === 'ready' ? (
            <Button
              label={busy === po.id ? 'Putting it on the job…' : 'Got it, put it on this job'}
              onPress={() =>
                !busy &&
                client &&
                run(po.id, async () => ((await claimOrder(client, po.id)) ? `${po.name} is on your truck and on this job.` : `Odoo wants ${po.name} finished there. Ask the warehouse.`))
              }
              testID={`job-po-received-${po.name}`}
            />
          ) : null}
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
          vendors={suppliers.filter((x) => x.odooId).map((x) => x.name).sort((a, b) => a.localeCompare(b))}
          search={(q) => searchProducts(client, q)}
          make={async (name) => ({ id: await createProduct(client, { name }), name, code: '', barcode: '', costCents: 0 })}
          onClose={() => setOrdering(false)}
          onSend={(o) => {
            setOrdering(false);
            run('order', async () => {
              const po = await orderForJob(client, { ...o, pickup: true, jobId, jobName: customer, ...(job?.odooJob?.model === 'fsm.order' ? { forOrderId: job.odooJob.id } : {}) });
              return `${po.name} is a draft for the buyer to review and send to ${po.supplier}${po.unpriced ? '. It has no price yet, so the buyer will add one' : ''}. When the warehouse has it, it shows here as ready for you.`;
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

/** Finds the part in Odoo (or makes it), then how many and who from. The last tap only makes a draft for the buyer; parts are always picked up. */
function OrderSheet({ initial = '', vendors = [], search, make, onSend, onClose }: { initial?: string; vendors?: string[]; search: (q: string) => Promise<StockProduct[]>; make: (name: string) => Promise<StockProduct>; onSend: (o: PartOrder) => void; onClose: () => void }) {
  const [q, setQ] = useState(initial);
  const [found, setFound] = useState<StockProduct[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [product, setProduct] = useState<StockProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [supplier, setSupplier] = useState('');

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
                    <View style={styles.grow}>
                      {p.variant && p.baseName ? <Text style={styles.note}>{p.baseName}</Text> : null}
                      <Text style={styles.body}>{p.variant ?? p.name}</Text>
                    </View>
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
                {vendors.length > 0 ? <ChipRow options={vendors.map((v) => ({ label: v, value: v }))} value={supplier} onChange={setSupplier} scroll testID="job-order-vendors" /> : null}
                <TextInput value={supplier} onChangeText={setSupplier} placeholder="Vendor (pick one above or type)" placeholderTextColor={colors.muted} accessibilityLabel="Supplier" testID="job-order-supplier" style={styles.input} />
                <Text style={styles.note}>Makes a draft purchase order in Odoo for this job. The buyer reviews it and sends it to {supplier.trim() || 'the supplier'}. You pick it up when the warehouse has it.</Text>
                <Pressable
                  onPress={() => supplier.trim() && onSend({ product, qty, supplier: supplier.trim(), pickup: true })}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !supplier.trim() }}
                  testID="job-order-send"
                  style={({ pressed }) => [styles.button, styles.primary, !supplier.trim() && styles.disabled, pressed && styles.pressed]}
                >
                  {({ pressed }) => <Text style={[styles.buttonText, !pressed && styles.primaryText]}>{supplier.trim() ? 'Order it for the buyer to review' : 'Add the supplier first'}</Text>}
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
  card: { backgroundColor: colors.card, borderRadius: rad(12), padding: sp(12), gap: sp(8) },
  label: { fontSize: fs(15), fontWeight: '800', color: colors.muted },
  body: { fontSize: type.body, fontWeight: '700', color: colors.text },
  note: { fontSize: fs(16), fontWeight: '700', color: colors.muted },
  line: { flexDirection: 'row', alignItems: 'center', gap: sp(8) },
  grow: { flex: 1 },
  row: { flexDirection: 'row', gap: sp(8) },
  undo: { minHeight: touch.min, paddingHorizontal: sp(12), justifyContent: 'center' },
  undoText: { fontSize: type.body, fontWeight: '800', color: colors.text, textDecorationLine: 'underline' },
  button: { flex: 1, minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(8), backgroundColor: colors.card },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  pressed: { backgroundColor: colors.info },
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: sp(16), gap: sp(10), maxHeight: '85%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: type.value, fontWeight: '800', color: colors.text },
  input: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, paddingHorizontal: sp(14), fontSize: type.body, fontWeight: '700', color: colors.text },
  list: { gap: sp(8), paddingBottom: sp(8) },
  pick: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: sp(8), paddingHorizontal: sp(12), borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border },
  count: { fontSize: type.value, fontWeight: '800', color: colors.text },
  qty: { minWidth: 48, textAlign: 'center' },
  waiting: { gap: sp(6), borderWidth: bw(1.5), borderColor: colors.border, borderRadius: rad(14), padding: sp(10) },
  primary: { backgroundColor: colors.selected, borderColor: colors.selected },
  primaryText: { color: colors.onSelected },
  disabled: { opacity: 0.5 },
  error: { fontSize: fs(16), fontWeight: '800', color: colors.stop },
});
