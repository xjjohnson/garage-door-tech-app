/**
 * What Odoo has on file for the house and the customer: a repeat-customer
 * badge ("12 visits · $4,800 spent"), and a House card on the job with the
 * doors and openers (with warranty dates) and the visits made there before.
 * Everything is read from Odoo; the last read is kept so it still shows with
 * no signal. Read-only.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatJobDate } from '../lib/jobs';
import { log } from '../lib/log';
import { badgeText, CustomerBadge, fetchCustomerBadge, fetchHouseHistory, houseOfOrder, HouseHistory as House, isRepeat, warrantyStatus } from '../lib/odooHouse';
import { formatMoney } from '../lib/prices';
import { useOdoo } from '../lib/useOdoo';
import { colors, type } from '../theme';

export const HOUSE_STORAGE_KEY = 'odoo-house/v1';
export const BADGE_STORAGE_KEY = 'odoo-badge/v1';

async function readSaved<T>(key: string, id: string): Promise<T | undefined> {
  try {
    const all = JSON.parse((await AsyncStorage.getItem(key)) ?? '{}') as Record<string, T>;
    return all && typeof all === 'object' ? all[id] : undefined;
  } catch {
    return undefined;
  }
}
async function writeSaved<T>(key: string, id: string, value: T): Promise<void> {
  try {
    const all = JSON.parse((await AsyncStorage.getItem(key)) ?? '{}') as Record<string, T>;
    await AsyncStorage.setItem(key, JSON.stringify({ ...(all && typeof all === 'object' ? all : {}), [id]: value }));
  } catch {
    // Not saved; the next read just asks Odoo again.
  }
}

/** A customer's visits and spend from Odoo, null until read (or with no Odoo). */
export function useCustomerBadge(partnerId: number | undefined): CustomerBadge | null {
  const { client } = useOdoo();
  const [badge, setBadge] = useState<CustomerBadge | null>(null);
  useEffect(() => {
    if (!partnerId) return;
    let live = true;
    readSaved<CustomerBadge>(BADGE_STORAGE_KEY, String(partnerId)).then((s) => live && s && setBadge((b) => b ?? s));
    if (client) {
      fetchCustomerBadge(client, partnerId)
        .then((b) => {
          if (!live) return;
          setBadge(b);
          writeSaved(BADGE_STORAGE_KEY, String(partnerId), b);
        })
        .catch((e) => log.warn('odoo', `customer badge: ${e instanceof Error ? e.message : String(e)}`));
    }
    return () => {
      live = false;
    };
  }, [client, partnerId]);
  return badge;
}

/** The badge as a pill; nothing for a customer with no history. */
export function CustomerBadgeLine({ partnerId, testID = 'customer-badge' }: { partnerId: number | undefined; testID?: string }) {
  const badge = useCustomerBadge(partnerId);
  const text = badge ? badgeText(badge, formatMoney) : null;
  if (!badge || !text) return null;
  return (
    <View style={styles.badgeRow} testID={testID}>
      {isRepeat(badge) ? <Text style={styles.repeat}>REPEAT CUSTOMER</Text> : null}
      <Text style={styles.badge}>{text}</Text>
    </View>
  );
}

/** The house's doors, openers and past visits from Odoo; `orderId` is the Odoo job being opened. */
export function useHouseHistory(orderId: number | undefined): { house: House | null; error: string | null } {
  const { client } = useOdoo();
  const [house, setHouse] = useState<House | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!orderId) return;
    let live = true;
    readSaved<House>(HOUSE_STORAGE_KEY, `o${orderId}`).then((s) => live && s && setHouse((h) => h ?? s));
    if (client) {
      (async () => {
        const loc = await houseOfOrder(client, orderId);
        if (!loc) return;
        const h = await fetchHouseHistory(client, loc, orderId);
        if (!live) return;
        setHouse(h);
        setError(null);
        writeSaved(HOUSE_STORAGE_KEY, `o${orderId}`, h);
      })().catch((e) => {
        if (!live) return;
        setError(e instanceof Error ? e.message : String(e));
        log.warn('odoo', `house history: ${e instanceof Error ? e.message : String(e)}`);
      });
    }
    return () => {
      live = false;
    };
  }, [client, orderId]);
  return { house, error };
}

/** The House card on a job: doors and openers with warranty, and the visits here before. */
export function HouseCard({ orderId, now = Date.now }: { orderId: number | undefined; now?: () => number }) {
  const { house, error } = useHouseHistory(orderId);
  if (!orderId) return null;
  if (!house) return error ? <Text style={styles.meta}>Couldn&apos;t read this house from Odoo: {error}</Text> : null;
  const t = now();
  return (
    <View style={styles.card} testID="house-card">
      <Text style={styles.label}>House history</Text>
      {house.lastVisit ? <Text style={styles.body}>Last visit {formatJobDate(house.lastVisit)}</Text> : null}
      <Text style={styles.sub}>Doors and openers</Text>
      {house.equipment.length === 0 ? <Text style={styles.meta}>None on file in Odoo for this house.</Text> : null}
      {house.equipment.map((e) => {
        const w = warrantyStatus(e, t);
        return (
          <View key={e.id} style={styles.item} testID={`house-equipment-${e.id}`}>
            <Text style={styles.body}>{e.name}</Text>
            {w ? <Text style={[styles.meta, w.active ? styles.ok : styles.ended]}>{w.text}</Text> : null}
            {e.lines.filter((l) => !/^Warranty on /.test(l)).map((l, i) => (
              <Text key={i} style={styles.meta}>
                {l}
              </Text>
            ))}
          </View>
        );
      })}
      <Text style={styles.sub}>Past visits</Text>
      {house.visits.length === 0 ? <Text style={styles.meta}>No other visits at this house.</Text> : null}
      {house.visits.map((v) => (
        <View key={v.id} style={styles.item} testID={`house-visit-${v.id}`}>
          <Text style={styles.body}>
            {v.name}
            {v.what ? ` · ${v.what}` : ''}
          </Text>
          <Text style={styles.meta}>{[v.when !== undefined ? formatJobDate(v.when) : '', v.stage].filter(Boolean).join(' · ')}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  repeat: { fontSize: 13, fontWeight: '900', color: colors.onSelected, backgroundColor: colors.selected, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  badge: { fontSize: 16, fontWeight: '800', color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 12, gap: 6 },
  label: { fontSize: 15, fontWeight: '900', color: colors.muted },
  sub: { fontSize: 15, fontWeight: '900', color: colors.text, marginTop: 6 },
  item: { gap: 1 },
  body: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  ok: { color: colors.ok },
  ended: { color: colors.stop },
});
