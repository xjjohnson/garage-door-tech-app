import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { ChipRow, MeasureField, SectionTitle } from '../components/controls';
import { findProductByCode, listTrucks, NoTruckError, SyncResult } from '../lib/odooStock';
import { pickList } from '../lib/pickList';
import { cents, formatMoney } from '../lib/prices';
import { startOfDay } from '../lib/schedule';
import { CATEGORY_LABEL, findByCode, findSupplier, guessCategory, isLow, onOrder, openPurchases, orderLinks, orders, orderText, STOCK_CATEGORIES, StockItem, SupplierOrder, supplierNames, TruckLink, unsyncedItems, usedTotals } from '../lib/stock';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';
import { usePriceSheet } from '../lib/usePriceSheet';
import { useSchedule } from '../lib/useSchedule';
import { NewStockItem, useStock } from '../lib/useStock';
import { useTruckSync } from '../lib/useTruckSync';
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

const ago = (ms: number, now: number) => {
  const m = Math.round((now - ms) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

/**
 * What's on the truck, with + and - for each item, and an order for each
 * supplier when things run low: a purchase order in Odoo, or a text or email.
 * Signed in to Odoo, the truck is its "Truck 1" Inventory location, synced
 * both ways. A barcode scan counts an item or adds a new one.
 */
export function StockScreen() {
  const store = useStock();
  const { items, suppliers, add, update, adjust, remove, addStarter, received, setSupplier, addToOdoo } = store;
  const { business } = useInvoices();
  const { client } = useOdoo();
  const { appointments } = useSchedule();
  const { jobs } = useJobs();
  const { sheet } = usePriceSheet();
  const [editing, setEditing] = useState<{ id?: string; item: NewStockItem } | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [counting, setCounting] = useState<StockItem | null>(null);
  const [confirming, setConfirming] = useState<SupplierOrder | null>(null);
  const [trucks, setTrucks] = useState<TruckLink[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const ordered = onOrder(store.purchases);
  const due = orders(items, ordered);
  const open = openPurchases(store.purchases);
  const names = supplierNames(store);
  const now = Date.now();
  const today = startOfDay(now);
  const usedToday = usedTotals(store.used, { from: today });
  const pick = pickList(appointments, jobs, items, sheet, now);
  const unsynced = unsyncedItems(store).length;
  // Signed in, Odoo is the record of the truck: it syncs on open and after each change.
  const auto = useTruckSync({
    onDone: (r) => (r.removed.length || r.created.length ? setMessage({ text: syncDone(r) }) : undefined),
    onError: (e) => {
      setMessage({ text: e instanceof Error ? e.message : String(e), bad: true });
      if (e instanceof NoTruckError && client) listTrucks(client).then(setTrucks, () => undefined);
    },
  });

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    setMessage(null);
    try {
      setMessage({ text: await fn() });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), bad: true });
    } finally {
      setBusy(null);
    }
  };

  const openTrucks = () =>
    client &&
    run('trucks', async () => {
      const list = await listTrucks(client);
      setTrucks(list);
      return list.length ? 'Pick the Odoo location that is your truck.' : 'Odoo has no Inventory locations to pick. Make one in Inventory › Configuration › Locations.';
    });

  function syncDone(r: SyncResult) {
    const bits = [r.sent ? `${r.sent} count${r.sent === 1 ? '' : 's'} sent` : '', r.added ? `${r.added} new from Odoo` : '', r.linked ? `${r.linked} linked` : '', r.created.length ? `${r.created.length} new in Odoo` : ''].filter(Boolean);
    const left = r.removed.length ? ` Taken off the list: ${r.removed.slice(0, 3).join(', ')}${r.removed.length > 3 ? '…' : ''}.` : '';
    return `${r.store.truck?.name ?? 'Truck'} synced${bits.length ? `: ${bits.join(', ')}` : ''}.${left}`;
  }

  const syncNow = () =>
    client &&
    run('sync', async () => {
      try {
        return syncDone(await store.sync(client));
      } catch (e) {
        // No truck is named for this tech: let them pick one.
        if (e instanceof NoTruckError) setTrucks(await listTrucks(client).catch(() => []));
        throw e;
      }
    });

  const scanned = (code: string) => {
    setScanning(false);
    const found = findByCode(items, code);
    if (found) {
      setCounting(found);
      return;
    }
    if (!client) {
      setEditing({ item: { ...blank(), barcode: code } });
      return;
    }
    run('scan', async () => {
      const p = await findProductByCode(client, code);
      if (!p) {
        setEditing({ item: { ...blank(), barcode: code } });
        return `No Odoo product has the code ${code}. Add it here, and set the barcode on the product in Odoo too.`;
      }
      setEditing({ item: { ...blank(), name: p.name, sku: p.code, barcode: p.barcode || code, odooId: p.id, category: guessCategory(p.name), supplier: p.vendor?.name ?? '', costCents: p.costCents || p.vendor?.priceCents || 0 } });
      return `Found ${p.name} in Odoo.`;
    });
  };

  return (
    <View style={styles.stack} testID="stock">
      {client ? (
        <View style={styles.syncCard} testID="stock-odoo">
          <Text style={styles.name}>{store.truck ? store.truck.name : 'Your truck in Odoo'}</Text>
          <Text style={styles.meta}>
            {auto.syncing || busy === 'sync' ? 'Syncing…' : store.truck ? `Synced ${ago(store.truck.syncedAt, now)}` : 'Not synced yet'}
            {unsynced ? ` · ${unsynced} change${unsynced === 1 ? '' : 's'} not sent yet` : ''}
          </Text>
          <View style={styles.row}>
            <Action label={busy === 'sync' ? 'Syncing…' : 'Sync with Odoo'} grow primary onPress={() => !busy && syncNow()} testID="stock-sync" />
            <Action label="Change truck" grow onPress={() => !busy && openTrucks()} testID="stock-change-truck" />
          </View>
        </View>
      ) : null}
      {message ? (
        <Text style={[styles.message, message.bad && styles.bad]} testID="stock-message">
          {message.text}
        </Text>
      ) : null}

      <Action label="Scan a barcode" onPress={() => setScanning(true)} testID="stock-scan" />

      {items.length === 0 ? (
        <View style={styles.empty} testID="stock-empty">
          <Text style={styles.emptyTitle}>Nothing on the truck yet</Text>
          {client ? (
            <Text style={styles.emptyBody}>Odoo has nothing on {store.truck?.name ?? 'your truck'}. Put stock on that location in Odoo (a receipt or an inventory count), or add an item here and its count goes to Odoo.</Text>
          ) : (
            <>
              <Text style={styles.emptyBody}>Start with a list of common springs and parts, then set how many you have, or add your own.</Text>
              <Action label="Add common items" primary onPress={addStarter} testID="stock-starter" />
            </>
          )}
        </View>
      ) : null}

      {usedToday.length > 0 ? (
        <View style={styles.stack} testID="stock-used-today">
          <SectionTitle first>Used today</SectionTitle>
          {usedToday.map((u) => (
            <View key={u.itemId} style={styles.line}>
              <Text style={styles.detail}>{u.name}</Text>
              <Text style={styles.detail}>{u.qty}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {pick.visits > 0 ? (
        <View style={styles.pick} testID="stock-tomorrow">
          <Text style={styles.label}>TOMORROW NEEDS</Text>
          <Text style={styles.meta}>
            {pick.visits} visit{pick.visits === 1 ? '' : 's'} booked{pick.unknown.length ? ` · ${pick.unknown.length} with no quote picked yet` : ''}
          </Text>
          {pick.short.map((n) => (
            <Text key={n.label} style={styles.detail} testID="stock-short">
              {n.qty} x {n.label} for {n.forWho.join(', ')} · {n.item ? `only ${n.have} on the truck` : 'not on the truck'}
            </Text>
          ))}
          {pick.onTruck.map((n) => (
            <Text key={n.label} style={styles.meta}>
              {n.qty} x {n.label}: on the truck ({n.item?.onHand})
            </Text>
          ))}
          {pick.short.length ? <Text style={styles.meta}>Grab these from the shop before you head out.</Text> : pick.onTruck.length ? <Text style={styles.meta}>Everything picked is on the truck.</Text> : null}
        </View>
      ) : null}

      {open.length > 0 ? <SectionTitle first={usedToday.length === 0 && pick.visits === 0}>On order</SectionTitle> : null}
      {open.map((po) => (
        <View key={po.id} style={styles.item} testID={`po-${po.name}`}>
          <Text style={styles.name}>
            {po.name} · {po.supplier}
          </Text>
          {po.jobId ? (
            <Text style={styles.meta} testID={`po-job-${po.name}`}>
              {po.pickup ? 'Pickup' : 'Delivery'} for {jobs.find((j) => j.id === po.jobId)?.customer || 'a job'} · goes on the job when it's in
            </Text>
          ) : null}
          {po.lines.map((l) => (
            <Text key={l.itemId} style={styles.detail}>
              {l.qty} x {items.find((i) => i.id === l.itemId)?.name ?? 'Removed item'}
            </Text>
          ))}
          <Text style={styles.meta}>{po.emailed ? 'Emailed to the supplier from Odoo' : "Made in Odoo, not emailed: text or email it below"}</Text>
          <Action
            label={busy === po.id ? 'Receiving…' : 'Parts are in, add to the truck'}
            onPress={() =>
              !busy &&
              (client
                ? run(po.id, async () => ((await store.receiveOrder(client, po.id)) ? `${po.name} received in Odoo and the truck synced.` : `Odoo wants ${po.name} finished there (a backorder or a missing quantity). Validate the receipt in Odoo, then sync.`))
                : setMessage({ text: 'Sign in to Odoo (Team) to receive a purchase order.', bad: true }))
            }
            testID={`po-received-${po.name}`}
          />
        </View>
      ))}

      {due.length > 0 ? <SectionTitle first={usedToday.length === 0 && pick.visits === 0 && open.length === 0}>To order</SectionTitle> : null}
      {due.map((o) => {
        const links = orderLinks(o, suppliers, business.name);
        const key = o.supplier || 'none';
        const linked = o.lines.filter((l) => l.item.odooId !== undefined).length;
        return (
          <View key={key} style={[styles.item, styles.order]} testID={`order-${key}`}>
            <Text style={styles.name}>{o.supplier || 'No supplier set'}</Text>
            {o.lines.map(({ item, qty }) => (
              <Text key={item.id} style={styles.detail}>
                {qty} x {item.name}
              </Text>
            ))}
            {o.costCents > 0 ? <Text style={styles.meta}>About {formatMoney(o.costCents)}</Text> : null}
            {client && o.supplier && linked > 0 ? (
              <>
                <Action
                  label={busy === `po-${key}` ? 'Sending…' : `Send PO to supplier · ${linked} item${linked === 1 ? '' : 's'}`}
                  primary
                  onPress={() => !busy && setConfirming(o)}
                  testID={`order-po-${key}`}
                />
                <Text style={styles.meta}>Makes a purchase order in Odoo and emails it to the vendor</Text>
              </>
            ) : null}
            <View style={styles.row}>
              {links.sms ? <Action label="Text order" grow primary={!client} onPress={() => Linking.openURL(links.sms!).catch(() => undefined)} testID={`order-text-${key}`} /> : null}
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
              <Row key={i.id} i={i} unsent={!!store.truck && i.odooId !== undefined && i.onHand !== i.syncedOnHand} onAdjust={(by) => adjust(i.id, by)} onEdit={() => setEditing({ id: i.id, item: { ...i } })} />
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

      <BarcodeScanner visible={scanning} title="Scan a part" hint="Point at the barcode on the box or label. A part on the truck opens its count; a new one is looked up in Odoo." onCode={scanned} onClose={() => setScanning(false)} />
      <TruckSheet
        trucks={trucks}
        current={store.truck?.locationId}
        onCancel={() => setTrucks(null)}
        onPick={(t) => {
          setTrucks(null);
          if (client) run('sync', async () => syncDone(await store.chooseTruck(client, t)));
        }}
      />
      <ConfirmOrderSheet
        order={confirming}
        email={confirming ? findSupplier(suppliers, confirming.supplier)?.email : undefined}
        onCancel={() => setConfirming(null)}
        onSend={(o) => {
          setConfirming(null);
          if (!client) return;
          const key = o.supplier || 'none';
          const linked = o.lines.filter((l) => l.item.odooId !== undefined).length;
          run(`po-${key}`, async () => {
            const po = await store.sendOrder(client, o);
            const skipped = o.lines.length - linked;
            return `${po.name} made in Odoo${po.emailed ? ' and emailed to the supplier' : '. Odoo could not email it, so text or email it'}.${skipped ? ` ${skipped} item${skipped === 1 ? ' is' : 's are'} not in Odoo and left off.` : ''}`;
          });
        }}
      />
      <CountSheet
        item={counting}
        onCancel={() => setCounting(null)}
        onSave={(n) => {
          if (counting) update(counting.id, { onHand: n });
          setCounting(null);
        }}
      />
      <ItemSheet
        value={editing?.item ?? null}
        isNew={!editing?.id}
        suppliers={names}
        onCancel={() => setEditing(null)}
        onSave={(item) => {
          setEditing(null);
          if (editing?.id) update(editing.id, item);
          else if (client)
            run('add', async () => {
              await addToOdoo(client, item);
              return `${item.name} added${item.odooId === undefined ? ' to Odoo as a new product' : ''}. Its count goes to ${store.truck?.name ?? 'the truck'} in Odoo next.`;
            });
          else add(item);
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

/** Picks which Odoo location is this tech's truck. */
function TruckSheet({ trucks, current, onPick, onCancel }: { trucks: TruckLink[] | null; current?: number; onPick: (t: TruckLink) => void; onCancel: () => void }) {
  if (!trucks || trucks.length === 0) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="truck-sheet">
          <View style={styles.titleRow}>
            <Text style={styles.sheetTitle}>Which truck is yours?</Text>
            <Pressable onPress={onCancel} style={styles.cancel} accessibilityRole="button" testID="truck-sheet-cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
          <Text style={styles.meta}>Each tech has their own Inventory location in Odoo. Switching brings in that truck's counts from Odoo.</Text>
          <ScrollView contentContainerStyle={styles.fields}>
            {trucks.map((t) => (
              <Action key={t.locationId} label={`${t.name}${t.locationId === current ? ' (now)' : ''}`} primary={t.locationId === current} onPress={() => onPick(t)} testID={`truck-${t.locationId}`} />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** A purchase order is a real order to a supplier, so it's checked once before it goes. */
function ConfirmOrderSheet({ order, email, onSend, onCancel }: { order: SupplierOrder | null; email?: string; onSend: (o: SupplierOrder) => void; onCancel: () => void }) {
  if (!order) return null;
  const lines = order.lines.filter((l) => l.item.odooId !== undefined);
  const left = order.lines.length - lines.length;
  const total = lines.reduce((n, l) => n + l.qty * l.item.costCents, 0);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="po-confirm">
          <View style={styles.titleRow}>
            <Text style={styles.sheetTitle}>Order from {order.supplier}?</Text>
            <Pressable onPress={onCancel} style={styles.cancel} accessibilityRole="button" testID="po-confirm-cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
          {lines.map((l) => (
            <Text key={l.item.id} style={styles.detail}>
              {l.qty} x {l.item.name}
              {l.item.costCents > 0 ? ` · ${formatMoney(l.qty * l.item.costCents)}` : ''}
            </Text>
          ))}
          {total > 0 ? <Text style={styles.name}>About {formatMoney(total)}</Text> : null}
          {left ? <Text style={styles.meta}>{left} item{left === 1 ? ' is' : 's are'} not in Odoo and won't be on it.</Text> : null}
          <Text style={styles.meta}>Odoo makes and confirms the purchase order, then emails it to {email || 'the vendor on file in Odoo'}.</Text>
          <Pressable onPress={() => onSend(order)} accessibilityRole="button" testID="po-confirm-send" style={({ pressed }) => [styles.save, pressed && styles.pressed]}>
            <Text style={styles.saveText}>Send the order</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Sets an item's count after a scan: type it, or step it with - and +. */
function CountSheet({ item, onSave, onCancel }: { item: StockItem | null; onSave: (n: number) => void; onCancel: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (item) setN(item.onHand);
  }, [item]);
  if (!item) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="count-sheet">
          <View style={styles.titleRow}>
            <Text style={styles.sheetTitle}>{item.name}</Text>
            <Pressable onPress={onCancel} style={styles.cancel} accessibilityRole="button" testID="count-cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
          <Text style={styles.meta}>How many are on the truck? The app had {item.onHand}.</Text>
          <View style={styles.row}>
            <Action label="−" grow onPress={() => setN((x) => Math.max(0, x - 1))} testID="count-minus" accessibilityLabel="One less" />
            <Text style={styles.count} testID="count-value">
              {n}
            </Text>
            <Action label="+" grow onPress={() => setN((x) => x + 1)} testID="count-plus" accessibilityLabel="One more" />
          </View>
          <Pressable onPress={() => onSave(n)} accessibilityRole="button" testID="count-save" style={({ pressed }) => [styles.save, pressed && styles.pressed]}>
            <Text style={styles.saveText}>Save count</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Row({ i, unsent, onAdjust, onEdit }: { i: StockItem; unsent?: boolean; onAdjust: (by: number) => void; onEdit: () => void }) {
  const low = isLow(i);
  return (
    <View style={[styles.item, low && styles.low]} testID={`stock-${i.id}`}>
      <Pressable onPress={onEdit} accessibilityRole="button" accessibilityHint="Edit this item" testID={`stock-edit-${i.id}`}>
        <Text style={styles.name}>{i.name}</Text>
        <Text style={styles.meta}>
          {low ? 'LOW · ' : ''}reorder at {i.min}, fill to {i.par}
          {i.supplier ? ` · ${i.supplier}` : ''}
        </Text>
        {unsent ? (
          <Text style={styles.unsent} testID={`stock-unsent-${i.id}`}>
            Odoo has {i.syncedOnHand ?? 0}: not sent yet
          </Text>
        ) : null}
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
            <TextField label="Barcode" value={f.barcode ?? ''} onChange={(barcode) => set({ barcode })} placeholder="Optional, for scanning" testID="stock-field-barcode" />
            {f.odooId ? <Text style={styles.meta}>Linked to an Odoo product</Text> : null}
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
  syncCard: { padding: 12, gap: 6, borderRadius: 12, backgroundColor: colors.card },
  message: { fontSize: 16, fontWeight: '800', color: colors.text },
  bad: { color: colors.stop },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, borderBottomWidth: 2, borderBottomColor: colors.info },
  pick: { padding: 12, gap: 4, borderRadius: 14, backgroundColor: colors.card },
  empty: { padding: 12, borderRadius: 10, backgroundColor: colors.card, gap: 8 },
  emptyTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: 16, color: colors.text, lineHeight: 22 },
  item: { padding: 12, gap: 8, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  low: { borderWidth: 4, borderColor: colors.caution },
  order: { borderWidth: 4, borderColor: colors.selected },
  name: { fontSize: type.body, fontWeight: '900', color: colors.text },
  detail: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  unsent: { fontSize: 15, fontWeight: '800', color: colors.stop },
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
