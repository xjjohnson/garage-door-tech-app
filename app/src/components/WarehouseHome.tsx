import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from './AppText';
import { Action } from './Buttons';
import { Card, dateText, Meta, Note, Tiles, TitleRow, money } from './Dept';
import { ReadyCard } from './ReadyForTech';
import { toOrder, VendorOrder } from '../lib/odooPurchasing';
import { listPlaces, openReceipts, OpenReceipt, Place, placeOverview, PlaceSummary, readyForTech, ReadyOrder } from '../lib/odooWarehouse';
import { useBadges } from '../lib/useBadges';
import { useDepartments } from '../lib/useDepartments';
import { useOdoo } from '../lib/useOdoo';
import { colors, fs, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

const DAY = 86_400_000;

const open = (tab: string) => router.push({ pathname: '/warehouse', params: { tab } });

/**
 * Home for the Warehouse theme: what needs doing at the shop, as cards that
 * each end in one button. Counts on top (receive, to order, ready for a tech),
 * then the late receipt, the job parts to hand over, the order to make and the
 * trucks due a count. All read from Odoo; nothing is kept on the phone.
 */
export function WarehouseHome({ now }: { now: () => number }) {
  const styles = useStyles();
  const { client } = useOdoo();
  const { access } = useDepartments();
  const badges = useBadges();
  const [data, setData] = useState<{ receipts: OpenReceipt[]; ready: ReadyOrder[]; orders: VendorOrder[]; overview: PlaceSummary[]; places: Place[] } | null>(null);
  const load = useCallback(async () => {
    if (!client) return;
    const places = await listPlaces(client).catch(() => [] as Place[]);
    const [receipts, ready, orders, overview] = await Promise.all([
      openReceipts(client, now()).catch(() => []),
      readyForTech(client, places).catch(() => []),
      access.purchasing ? toOrder(client).catch(() => []) : Promise.resolve([]),
      placeOverview(client, places.filter((p) => p.truck)).catch(() => []),
    ]);
    setData({ receipts, ready, orders, overview, places });
  }, [client, access.purchasing, now]);
  useEffect(() => {
    load();
  }, [load]);

  if (!client) return <Note testID="whome-signin">Sign in to Odoo to see the warehouse.</Note>;
  if (!access.warehouse) return <Note testID="whome-no-access">This home is for the warehouse manager. Ask the owner to add the role in Odoo.</Note>;
  const t = now();
  const lateReceipt = data?.receipts.find((r) => r.late) ?? data?.receipts[0];
  const orderLines = (data?.orders ?? []).reduce((n, v) => n + v.lines.length, 0);
  const orderTotal = (data?.orders ?? []).reduce((n, v) => n + v.totalCents, 0);
  const due = (data?.overview ?? []).filter((r) => !r.lastCountedAt || t - r.lastCountedAt >= 7 * DAY);
  const trucks = (data?.places ?? []).filter((p) => p.truck);
  const nothing = data && !lateReceipt && data.ready.length === 0 && orderLines === 0 && due.length === 0;
  return (
    <View style={styles.stack} testID="warehouse-home">
      <Tiles
        testID="whome-tiles"
        items={[
          { value: badges.warehouse.receive, label: 'To receive', tone: badges.warehouse.receive > 0 ? 'warn' : 'plain', onPress: () => open('receive'), testID: 'whome-tile-receive' },
          { value: badges.purchasing.toOrder, label: 'To order', tone: badges.purchasing.toOrder > 0 ? 'bad' : 'plain', onPress: () => open('orders'), testID: 'whome-tile-order' },
          { value: badges.warehouse.handOver, label: 'Ready for a tech', tone: badges.warehouse.handOver > 0 ? 'ok' : 'plain', onPress: () => open('ready'), testID: 'whome-tile-ready' },
        ]}
      />
      <Text style={styles.head}>DO NOW</Text>
      {!data ? <Note>Reading Odoo…</Note> : null}
      {nothing ? <Note testID="whome-clear">Nothing needs doing right now.</Note> : null}
      {lateReceipt ? (
        <Card edge={lateReceipt.late ? 'bad' : 'warn'} testID="whome-receive">
          <TitleRow title={`Receive ${lateReceipt.origin || lateReceipt.name}`} pill={lateReceipt.late ? 'Late' : `Due ${dateText(lateReceipt.scheduled)}`} tone={lateReceipt.late ? 'bad' : 'warn'} />
          <Meta>{`${lateReceipt.vendor || 'Vendor'} · ${lateReceipt.lines.slice(0, 2).map((l) => `${l.ordered} × ${l.name}`).join(', ')}`}</Meta>
          <Action primary label="Receive" onPress={() => open('receive')} testID="whome-receive-go" />
        </Card>
      ) : null}
      {(data?.ready ?? []).slice(0, 2).map((o) => (
        <ReadyCard key={o.poId} client={client} order={o} trucks={trucks} now={t} onDone={load} />
      ))}
      {orderLines > 0 ? (
        <Card edge="warn" testID="whome-order">
          <TitleRow title={`Order ${orderLines} part${orderLines === 1 ? '' : 's'} under minimum`} pill={money(orderTotal)} tone="plain" />
          <Meta>{(data?.orders ?? []).map((v) => `${v.vendor} · ${v.lines.length}`).join(', ')}</Meta>
          <Action label="Review and order" onPress={() => open('orders')} testID="whome-order-go" />
        </Card>
      ) : null}
      {due.map((r) => (
        <Card key={r.place.id} edge="bad" testID={`whome-count-${r.place.id}`}>
          <TitleRow title={`${r.place.name}: count due`} pill={r.lastCountedAt ? `${Math.floor((t - r.lastCountedAt) / DAY)} days` : 'Never'} tone="bad" />
          <Action label="Count it" onPress={() => open('count')} testID={`whome-count-go-${r.place.id}`} />
        </Card>
      ))}
      <Text style={styles.head}>SHORTCUTS</Text>
      <View style={styles.pair}>
        <Action label="Stock" onPress={() => open('stock')} testID="whome-stock" grow />
        <Action label="Count" onPress={() => open('count')} testID="whome-count" grow />
        <Action label="Move" onPress={() => open('move')} testID="whome-move" grow />
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: sp(10) },
  head: { fontSize: fs(12), fontWeight: '800', letterSpacing: 1, color: colors.muted },
  pair: { flexDirection: 'row', gap: sp(8) },
}));
