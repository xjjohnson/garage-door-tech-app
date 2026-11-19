/**
 * What Odoo has on file for the house and the customer: a repeat-customer
 * badge ("12 visits · $4,800 spent"), and a House card on the job with the
 * doors and openers (with warranty dates) and the visits made there before.
 * Everything is read from Odoo; the last read is kept so it still shows with
 * no signal. Read-only.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './AppText';
import { formatJobDate } from '../lib/jobs';
import { log } from '../lib/log';
import { badgeText, CustomerBadge, fetchCustomerBadge, fetchCustomerEquipment, HouseEquipment, fetchHouseHistory, houseForJob, HouseHistory as House, isRepeat, warrantyStatus } from '../lib/odooHouse';
import { formatMoney } from '../lib/prices';
import { Invoice, invoiceNo } from '../lib/invoices';
import { useInvoices } from '../lib/useInvoices';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';
import { colors, radius, type, bw, fs, rad } from '../theme';

export const HOUSE_STORAGE_KEY = 'odoo-house/v2';
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
export function CustomerBadgeLine({ partnerId, testID = 'customer-badge', onDark }: { partnerId: number | undefined; testID?: string; onDark?: boolean }) {
  const badge = useCustomerBadge(partnerId);
  const text = badge ? badgeText(badge, formatMoney) : null;
  if (!badge || !text) return null;
  return (
    <View style={styles.badgeRow} testID={testID}>
      {isRepeat(badge) ? <Text style={[styles.repeat, onDark && styles.repeatDark]}>REPEAT CUSTOMER</Text> : null}
      <Text style={[styles.badge, onDark && styles.badgeDark]}>{text}</Text>
    </View>
  );
}

/** The house's doors, openers and past visits from Odoo; `orderId` is the Odoo job being opened. */
export function useHouseHistory(orderId: number | undefined, where?: { partnerId?: number; address?: string }): { house: House | null; error: string | null } {
  const { client } = useOdoo();
  const [house, setHouse] = useState<House | null>(null);
  const [error, setError] = useState<string | null>(null);
  const partnerId = where?.partnerId;
  const address = where?.address?.trim();
  const savedKey = `o${orderId}${address ? `@${address.toLowerCase()}` : ''}`;
  useEffect(() => {
    if (!orderId) return;
    let live = true;
    setHouse(null);
    readSaved<House>(HOUSE_STORAGE_KEY, savedKey).then((s) => live && s && setHouse((h) => h ?? s));
    if (client) {
      (async () => {
        // Only this job's own house: no match shows nothing, never the customer's other houses.
        const loc = await houseForJob(client, partnerId, address, orderId);
        if (!loc) {
          if (!live) return;
          setHouse(address ? { locationId: 0, equipment: [], visits: [], at: Date.now() } : null);
          return;
        }
        const h = await fetchHouseHistory(client, loc, orderId);
        if (!live) return;
        setHouse(h);
        setError(null);
        writeSaved(HOUSE_STORAGE_KEY, savedKey, h);
      })().catch((e) => {
        if (!live) return;
        setError(e instanceof Error ? e.message : String(e));
        log.warn('odoo', `house history: ${e instanceof Error ? e.message : String(e)}`);
      });
    }
    return () => {
      live = false;
    };
  }, [client, orderId, partnerId, address]);
  return { house, error };
}

/** The House card on a job: doors and openers with warranty, and the visits here before. */
export function HouseCard({ orderId, partnerId, address, now = Date.now }: { orderId: number | undefined; partnerId?: number; address?: string; now?: () => number }) {
  const { house, error } = useHouseHistory(orderId, { partnerId, address });
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
  repeatDark: { backgroundColor: colors.warnBg, color: colors.warn },
  badgeDark: { color: colors.onHead },
  repeat: { fontSize: fs(13), fontWeight: '800', color: colors.onSelected, backgroundColor: colors.selected, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  badge: { fontSize: fs(16), fontWeight: '800', color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: rad(12), padding: 12, gap: 6 },
  label: { fontSize: fs(15), fontWeight: '800', color: colors.muted },
  sub: { fontSize: fs(15), fontWeight: '800', color: colors.text, marginTop: 6 },
  item: { gap: 1 },
  body: { fontSize: type.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: fs(16), fontWeight: '600', color: colors.muted },
  ok: { color: colors.ok },
  ended: { color: colors.stop },
});

/** "Opener 2" and "Door 1" style chips for the house's equipment records; tap one for its history and warranty. */
export function EquipmentChips({ orderId, partnerId, address, now = Date.now, onDark }: { orderId: number | undefined; partnerId?: number; address?: string; now?: () => number; onDark?: boolean }) {
  const { house } = useHouseHistory(orderId, { partnerId, address });
  if (!orderId || !house) return null;
  return <ChipList equipment={house.equipment} now={now} onDark={onDark} />;
}

/** The same chips for every door and opener across a customer's houses. */
export function CustomerEquipmentChips({ partnerId, now = Date.now, onDark }: { partnerId: number | undefined; now?: () => number; onDark?: boolean }) {
  const { client } = useOdoo();
  const [equipment, setEquipment] = useState<HouseEquipment[]>([]);
  useEffect(() => {
    if (!client || !partnerId) return;
    let live = true;
    readSaved<HouseEquipment[]>(HOUSE_STORAGE_KEY, `c${partnerId}`).then((s) => live && s && setEquipment((e) => (e.length ? e : s)));
    fetchCustomerEquipment(client, partnerId)
      .then((list) => {
        if (!live) return;
        setEquipment(list);
        writeSaved(HOUSE_STORAGE_KEY, `c${partnerId}`, list);
      })
      .catch((e) => log.warn('odoo', `customer equipment: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      live = false;
    };
  }, [client, partnerId]);
  return <ChipList equipment={equipment} now={now} onDark={onDark} testID="customer-equipment-chips" />;
}

/** The invoice a "Sold: date (invoice X)" line points to, when it is on this phone. */
function soldInvoice(line: string, invoices: Invoice[]): Invoice | undefined {
  const m = /^Sold: .*\(invoice (.+)\)$/.exec(line);
  return m ? invoices.find((i) => invoiceNo(i) === m[1] || i.number === m[1]) : undefined;
}

function ChipList({ equipment, now, onDark, testID = 'equipment-chips' }: { equipment: HouseEquipment[]; now: () => number; onDark?: boolean; testID?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const { invoices } = useInvoices();
  const { jobs } = useJobs();
  if (equipment.length === 0) return null;
  const sel = equipment.find((e) => e.id === open);
  const w = sel ? warrantyStatus(sel, now()) : null;
  return (
    <View style={chipStyles.wrap} testID={testID}>
      <View style={chipStyles.row}>
        {equipment.map((e) => (
          <Pressable
            key={e.id}
            onPress={() => setOpen(open === e.id ? null : e.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: open === e.id }}
            testID={`equipment-chip-${e.id}`}
            style={[chipStyles.chip, onDark && chipStyles.chipDark, open === e.id && chipStyles.chipOn]}
          >
            <Icon name={/opener|operator/i.test(e.name) ? 'opener' : 'door'} size={16} color={open === e.id ? colors.onSelected : onDark ? colors.onHead : colors.selected} />
            <Text style={[chipStyles.chipText, onDark && chipStyles.chipTextDark, open === e.id && chipStyles.chipTextOn]} numberOfLines={1}>
              {e.name}
            </Text>
          </Pressable>
        ))}
      </View>
      {sel ? (
        <View style={chipStyles.detail} testID={`equipment-detail-${sel.id}`}>
          <Text style={chipStyles.detailTitle}>{sel.name}</Text>
          {w ? <Text style={[chipStyles.detailLine, w.active ? styles.ok : styles.ended]}>{w.text}</Text> : null}
          {sel.lines.filter((l) => !/^Warranty on /.test(l)).map((l, i) => {
            const inv = soldInvoice(l, invoices);
            return inv ? (
              <Pressable key={i} onPress={() => router.push(jobs.some((j) => j.id === inv.jobId) ? { pathname: '/job/[id]', params: { id: inv.jobId } } : { pathname: '/invoice/[id]', params: { id: inv.id } })} accessibilityRole="link" testID={`equipment-sold-${sel.id}`} style={chipStyles.soldLink}>
                <Text style={[chipStyles.detailLine, chipStyles.linkText]}>{l} ›</Text>
              </Pressable>
            ) : (
              <Text key={i} style={chipStyles.detailLine}>
                {l}
              </Text>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: bw(1), borderColor: colors.line },
  chipDark: { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.25)' },
  chipOn: { backgroundColor: colors.selected, borderColor: colors.selected },
  chipText: { fontSize: fs(14), fontWeight: '700', color: colors.selected, maxWidth: 180 },
  chipTextDark: { color: colors.onHead },
  chipTextOn: { color: colors.onSelected },
  detail: { backgroundColor: colors.card, borderRadius: radius.field, padding: 12, gap: 2, borderWidth: bw(1), borderColor: colors.line },
  detailTitle: { fontSize: fs(16), fontWeight: '800', color: colors.text },
  soldLink: { minHeight: 36, justifyContent: 'center' },
  linkText: { color: colors.selected, textDecorationLine: 'underline' },
  detailLine: { fontSize: fs(15), fontWeight: '600', color: colors.muted },
});
