import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Action } from './Buttons';
import { Card, Message, Meta, Pill, TitleRow, useRun } from './Dept';
import { ChipRow } from './controls';
import { OdooClient } from '../lib/odoo';
import { handOver, Place, ReadyOrder } from '../lib/odooWarehouse';
import { sp } from '../theme';

const DAY = 86_400_000;

/** The truck that looks like this order's tech ("Truck - Mike" for Mike Smith), or none. */
export function truckForTech(tech: string, trucks: Place[]): Place | undefined {
  const words = tech.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return undefined;
  const hits = trucks.filter((t) => words.some((w) => t.name.toLowerCase().includes(w)));
  return hits.length === 1 ? hits[0] : undefined;
}

export function waitText(at: number | undefined, now: number): { text: string; late: boolean } {
  if (!at) return { text: 'Ready', late: false };
  const days = Math.floor((now - at) / DAY);
  return days >= 2 ? { text: `Waiting ${days} days`, late: true } : { text: 'Ready', late: false };
}

/**
 * One received job order waiting at the warehouse, with the button that moves
 * its parts onto the tech's truck (an Odoo transfer, noted on the order so the
 * tech's phone doesn't move them again). When Odoo names no tech, or no truck
 * matches, the manager picks the truck first.
 */
export function ReadyCard({ client, order, trucks, now, onDone }: { client: OdooClient; order: ReadyOrder; trucks: Place[]; now: number; onDone: () => void }) {
  const guess = useMemo(() => truckForTech(order.tech, trucks), [order.tech, trucks]);
  const [pick, setPick] = useState<number>(guess?.id ?? 0);
  const { busy, msg, run } = useRun();
  const truck = trucks.find((t) => t.id === pick);
  const wait = waitText(order.at, now);
  const go = () =>
    truck &&
    run('hand', async () => {
      const r = await handOver(client, order, truck);
      if (!r.done) return { text: `${r.name}: Odoo wants a person to finish it. Open it in Odoo.`, bad: true };
      onDone();
      return `Moved to ${truck.name}.`;
    });
  return (
    <Card edge={wait.late ? 'warn' : 'ok'} testID={`ready-${order.poId}`}>
      <TitleRow title={order.lines.map((l) => `${l.qty} × ${l.name}`).slice(0, 2).join(', ') + (order.lines.length > 2 ? `, +${order.lines.length - 2} more` : '')} pill={wait.text} tone={wait.late ? 'warn' : 'ok'} />
      <Meta>{[order.job ? `Job ${order.job}` : '', order.tech].filter(Boolean).join(' · ') || order.name}</Meta>
      <Meta>{`Came in on ${order.name}${order.vendor ? ` from ${order.vendor}` : ''}`}</Meta>
      {!guess && trucks.length > 0 ? <ChipRow scroll options={trucks.map((t) => ({ label: t.name, value: t.id }))} value={pick} onChange={setPick} testID={`ready-truck-${order.poId}`} compact /> : null}
      <Message msg={msg} testID={`ready-message-${order.poId}`} />
      <View style={styles.gap}>
        <Action primary label={busy === 'hand' ? 'Moving…' : truck ? `Hand to ${truck.name}` : 'Pick a truck'} disabled={!truck || busy !== null} onPress={go} testID={`ready-hand-${order.poId}`} />
        <Meta>Moves the parts onto that truck in Odoo.</Meta>
      </View>
    </Card>
  );
}

export { Pill };

const styles = StyleSheet.create({ gap: { gap: sp(4) } });
