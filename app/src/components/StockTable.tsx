import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { BarcodeScanner } from './BarcodeScanner';
import { Action } from './Buttons';
import { Card, Meta, Note, Pill, TextBox, Tiles, Title, dateText } from './Dept';
import { ChipRow } from './controls';
import { OdooClient } from '../lib/odoo';
import { findProductByCode } from '../lib/odooStock';
import { JobUse, partOnOrder, PartOnOrder, Place, recentPartsUsed, stockTable, StockRow } from '../lib/odooWarehouse';
import { colors, fs, radius, sp } from '../theme';

type Filter = 'all' | 'low' | 'zero';

/** A short place name for a column head: "Truck - Mike" to "Mike", "WH/Stock" to "Shop". */
export function shortPlace(p: Place): string {
  if (!p.truck) return 'Shop';
  const n = p.name.replace(/^.*?truck\s*[-:]?\s*/i, '').replace(/['’]s truck$/i, '').trim();
  return (n || p.name).slice(0, 8);
}

/** The stock table: every part, with what each place holds side by side. Red is under minimum. Tap a part for its page. */
export function StockTable({ client, places, onCount, onMove, onOrder }: { client: OdooClient; places: Place[]; onCount: (placeId: number) => void; onMove: () => void; onOrder: () => void }) {
  const [rows, setRows] = useState<StockRow[] | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<StockRow | null>(null);
  const [scanning, setScanning] = useState(false);
  const cols = places.slice(0, 5);
  useEffect(() => {
    let alive = true;
    stockTable(client, places).then((r) => alive && setRows(r), () => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [client, places]);
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => (!k || r.name.toLowerCase().includes(k) || (r.code ?? '').toLowerCase().includes(k)) && (filter === 'all' || (filter === 'low' ? r.low : cols.some((c) => (r.qty[c.id] ?? 0) <= 0))));
  }, [rows, q, filter, cols]);
  if (open) return <PartPage client={client} row={open} places={places} onBack={() => setOpen(null)} onCount={onCount} onMove={onMove} onOrder={onOrder} />;
  const low = (rows ?? []).filter((r) => r.low).length;
  const scanned = (code: string) => {
    setScanning(false);
    findProductByCode(client, code).then((p) => {
      if (!p) return setQ(code);
      const hit = rows?.find((r) => r.productId === p.id);
      if (hit) setOpen(hit);
      else setQ(p.name);
    }, () => setQ(code));
  };
  return (
    <View style={styles.stack} testID="stock-table">
      <Tiles items={[{ value: rows?.length ?? 0, label: 'Parts' }, { value: low, label: 'Under minimum', tone: low > 0 ? 'bad' : 'plain' }]} />
      <View style={styles.search}>
        <View style={styles.grow}>
          <TextBox value={q} onChange={setQ} label="Search or scan a part" testID="stock-search" />
        </View>
        <Action label="Scan" onPress={() => setScanning(true)} testID="stock-scan" />
      </View>
      <ChipRow options={[{ label: 'All', value: 'all' as const }, { label: low ? `Low (${low})` : 'Low', value: 'low' as const }, { label: 'At zero', value: 'zero' as const }]} value={filter} onChange={setFilter} testID="stock-filter" compact />
      {!rows ? <Note>Reading every location…</Note> : null}
      {rows && shown.length === 0 ? <Note testID="stock-empty">No parts match.</Note> : null}
      {rows && shown.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tableWrap}>
          <View style={styles.table} testID="stock-rows">
            <View style={[styles.tr, styles.th]}>
              <Text style={[styles.cell, styles.partCol, styles.thText]}>PART</Text>
              {cols.map((c) => (
                <Text key={c.id} style={[styles.cell, styles.numCol, styles.thText]}>{shortPlace(c).toUpperCase()}</Text>
              ))}
              <Text style={[styles.cell, styles.numCol, styles.thText]}>MIN</Text>
            </View>
            {shown.map((r) => (
              <Pressable key={r.productId} onPress={() => setOpen(r)} accessibilityRole="button" accessibilityLabel={`${r.name}, open the part`} testID={`stock-row-${r.productId}`} style={styles.tr}>
                <Text style={[styles.cell, styles.partCol, styles.partText]} numberOfLines={2}>{r.name}</Text>
                {cols.map((c) => {
                  const n = r.qty[c.id] ?? 0;
                  const under = r.min > 0 && n < r.min;
                  return (
                    <Text key={c.id} style={[styles.cell, styles.numCol, styles.num, under && styles.under]}>{String(n)}</Text>
                  );
                })}
                <Text style={[styles.cell, styles.numCol, styles.num]}>{r.min > 0 ? String(r.min) : '–'}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : null}
      <Meta>Red is under the minimum. Tap a part for its stock, orders and what jobs used.</Meta>
      <BarcodeScanner visible={scanning} title="Scan a part" hint="Opens the part." onCode={scanned} onClose={() => setScanning(false)} />
    </View>
  );
}

/** One part: what each place has, what is on order, what jobs used in 30 days, and the buttons to count, move or order it. */
function PartPage({ client, row, places, onBack, onCount, onMove, onOrder }: { client: OdooClient; row: StockRow; places: Place[]; onBack: () => void; onCount: (placeId: number) => void; onMove: () => void; onOrder: () => void }) {
  const [onOrderRows, setOnOrder] = useState<PartOnOrder[] | null>(null);
  const [used, setUsed] = useState<JobUse[] | null>(null);
  useEffect(() => {
    let alive = true;
    partOnOrder(client, row.productId).then((r) => alive && setOnOrder(r));
    recentPartsUsed(client, Date.now() - 30 * 86_400_000).then((r) => alive && setUsed(r), () => alive && setUsed([]));
    return () => {
      alive = false;
    };
  }, [client, row.productId]);
  const total = Object.values(row.qty).reduce((a, b) => a + b, 0);
  const usedLines = (used ?? []).flatMap((u) => u.lines.filter((l) => l.productId === row.productId).map((l) => ({ job: u.job, qty: l.qty })));
  const usedQty = usedLines.reduce((n, l) => n + l.qty, 0);
  const shop = places.find((p) => !p.truck);
  return (
    <View style={styles.stack} testID="part-page">
      <Action label="Back to the stock table" onPress={onBack} testID="part-back" />
      <Title>{row.name}</Title>
      <Tiles items={places.slice(0, 4).map((p) => ({ value: row.qty[p.id] ?? 0, label: shortPlace(p), tone: row.min > 0 && (row.qty[p.id] ?? 0) < row.min ? ('bad' as const) : ('plain' as const) }))} />
      <Card>
        <Text style={styles.line}>{`${total} in total${row.min > 0 ? ` · minimum ${row.min}` : ''}`}</Text>
        {row.low ? <Pill text="Under minimum" tone="warn" /> : null}
      </Card>
      <Card>
        <Title>On order</Title>
        {!onOrderRows ? <Meta>Reading orders…</Meta> : null}
        {onOrderRows && onOrderRows.length === 0 ? <Meta>Nothing on order.</Meta> : null}
        {(onOrderRows ?? []).map((o, i) => (
          <Meta key={i}>{`${o.name}${o.vendor ? ` · ${o.vendor}` : ''} · ${o.qty} coming${o.expected ? ` ${dateText(o.expected)}` : ''}`}</Meta>
        ))}
      </Card>
      <Card>
        <Title>Used on jobs (30 days)</Title>
        {!used ? <Meta>Reading jobs…</Meta> : null}
        {used && usedLines.length === 0 ? <Meta>None recorded.</Meta> : null}
        {usedLines.length > 0 ? <Meta>{`${usedQty} on ${usedLines.length} job${usedLines.length === 1 ? '' : 's'}: ${usedLines.slice(0, 4).map((l) => l.job).join(', ')}`}</Meta> : null}
      </Card>
      <View style={styles.pair}>
        <Action label="Count" onPress={() => onCount(shop?.id ?? places[0]?.id ?? 0)} testID="part-count" grow />
        <Action label="Move" onPress={onMove} testID="part-move" grow />
        <Action primary label="Order" onPress={onOrder} testID="part-order" grow />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: sp(10) },
  grow: { flex: 1 },
  search: { flexDirection: 'row', gap: sp(8), alignItems: 'center' },
  pair: { flexDirection: 'row', gap: sp(8) },
  line: { fontSize: fs(16), fontWeight: '700', color: colors.text },
  tableWrap: { flexGrow: 1 },
  table: { flexGrow: 1, minWidth: '100%', backgroundColor: colors.card, borderRadius: radius.card, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: sp(8), paddingHorizontal: sp(6) },
  th: { backgroundColor: colors.info, borderTopWidth: 0 },
  cell: { fontSize: fs(14) },
  thText: { fontWeight: '800', color: colors.muted, fontSize: fs(11) },
  partCol: { flex: 1, minWidth: 130 },
  partText: { fontWeight: '700', color: colors.text },
  numCol: { width: 52, textAlign: 'right' },
  num: { fontWeight: '800', color: colors.text },
  under: { color: colors.stop, backgroundColor: colors.warnBg },
});
