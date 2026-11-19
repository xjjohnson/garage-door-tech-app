import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { ChipOption, ChipRow } from './controls';
import { FollowUpSettings, partWarranties, warrantyFor } from '../lib/followups';
import { DAY } from '../lib/followups';
import { Invoice, trackKey } from '../lib/invoices';
import { trackedKeys } from '../lib/odooEquipment';
import { formatMoney } from '../lib/prices';
import { colors, type, bw, fs, rad, sp } from '../theme';

/** Parts are covered by the year, labor by the day. */
const MONTHS: number[] = [0, 12, 24, 36, 60, 120];
const DAYS: number[] = [0, 30, 60, 90, 180, 365];
const yearsLabel = (m: number) => (m === 0 ? 'None' : m % 12 === 0 ? `${m / 12} yr` : `${Math.round((m / 12) * 10) / 10} yr`);
const daysLabel = (d: number) => (d === 0 ? 'None' : `${d} days`);
const chips = (list: number[], current: number, label: (n: number) => string): ChipOption<number>[] => (list.includes(current) ? list : [...list, current].sort((a, b) => a - b)).map((v) => ({ label: label(v), value: v }));

/** The years of parts warranty a chip row shows as chosen: the job's own pick, else what the settings give. */
function partsMonths(invoice: Invoice, settings: FollowUpSettings): number {
  const until = warrantyFor(invoice, settings).partsUntil;
  if (!until) return 0;
  const a = new Date(invoice.createdAt);
  const b = new Date(until);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function laborDays(invoice: Invoice, settings: FollowUpSettings): number {
  const until = warrantyFor(invoice, settings).laborUntil;
  return until ? Math.round((until - invoice.createdAt) / DAY) : 0;
}

/**
 * What this job is covered by, picked per job: the warranty on parts and on
 * labor (either, both or neither).
 */
export function CoveragePicker({ invoice, settings, onChange }: { invoice: Invoice; settings: FollowUpSettings; onChange: (patch: Partial<Pick<Invoice, 'warranty'>>) => void }) {
  const parts = partsMonths(invoice, settings);
  const labor = laborDays(invoice, settings);
  const covered = parts > 0 || labor > 0;
  const tracked = trackedKeys(invoice);
  const toggle = (key: string) => onChange({ warranty: { tracked: tracked.includes(key) ? tracked.filter((k) => k !== key) : [...tracked, key] } });
  const lines = partWarranties(invoice, settings, trackKey);
  const same = { label: 'Same as job', value: -1 };
  const setPart = (key: string, months: number) => onChange({ warranty: { partMonths: { ...(invoice.warranty?.partMonths ?? {}), ...(months < 0 ? {} : { [key]: months }) } } });
  const clearPart = (key: string) => {
    const { [key]: _gone, ...rest } = invoice.warranty?.partMonths ?? {};
    onChange({ warranty: { partMonths: rest } });
  };
  return (
    <View style={styles.box} testID="invoice-coverage">
      <Text style={styles.title}>Warranty on this job</Text>
      <Text style={styles.label}>Parts</Text>
      <ChipRow options={chips(MONTHS, parts, yearsLabel)} value={parts} onChange={(m) => onChange({ warranty: { partsMonths: m } })} scroll testID="coverage-parts" />
      <Text style={styles.label}>Labor</Text>
      <ChipRow options={chips(DAYS, labor, daysLabel)} value={labor} onChange={(d) => onChange({ warranty: { laborDays: d } })} scroll testID="coverage-labor" />
      {lines.length > 0 ? (
        <View style={styles.track} testID="coverage-lines">
          <Text style={styles.label}>What is covered</Text>
          <Text style={styles.hint}>Every line sold is listed, marked Part or Labor. Tap a line to turn its warranty on or off, or pick a different length for it.</Text>
          {lines.map((l, i) => {
            const on = l.until !== null;
            const own = invoice.warranty?.partMonths?.[l.key] !== undefined;
            const key = l.key;
            return (
              <View key={`${key}-${i}`} style={styles.lineBox}>
                <Pressable onPress={() => (on ? setPart(key, 0) : own || !l.part ? clearPart(key) : setPart(key, parts > 0 ? parts : 12))} accessibilityRole="checkbox" accessibilityState={{ checked: on }} testID={`cover-${i}`} style={[styles.line, on && styles.lineOn]}>
                  <View style={styles.lineName}>
                    <View style={[styles.badge, l.part ? styles.badgePart : styles.badgeLabor]} testID={`cover-kind-${i}`}>
                      <Text style={[styles.badgeText, l.part ? styles.badgePartText : styles.badgeLaborText]}>{l.part ? 'Part' : 'Labor'}</Text>
                    </View>
                    <Text style={[styles.lineText, on && styles.lineTextOn]} numberOfLines={2}>
                      {on ? '✓ ' : ''}
                      {l.label}
                    </Text>
                  </View>
                  <Text style={[styles.lineText, on && styles.lineTextOn]}>{on ? (l.part ? yearsLabel(l.months) : daysLabel(labor)) : 'Not covered'}</Text>
                </Pressable>
                {on && l.part ? <ChipRow options={[same, ...MONTHS.filter((m) => m > 0).map((m) => ({ label: yearsLabel(m), value: m }))]} value={own ? l.months : -1} onChange={(m) => (m < 0 ? clearPart(key) : setPart(key, m))} scroll testID={`cover-length-${i}`} /> : null}
                {on && l.part ? (
                  <Pressable onPress={() => toggle(key)} accessibilityRole="checkbox" accessibilityState={{ checked: tracked.includes(key) }} testID={`track-${i}`} style={styles.trackRow}>
                    <Text style={styles.hint}>{tracked.includes(key) ? '✓ ' : ''}Keep on the house's equipment in Odoo</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: sp(6), padding: sp(12), borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border },
  title: { fontSize: type.body, fontWeight: '800', color: colors.text },
  label: { fontSize: fs(16), fontWeight: '700', color: colors.muted },
  hint: { fontSize: fs(15), color: colors.muted },
  track: { gap: sp(6), marginTop: sp(6) },
  lineBox: { gap: sp(6) },
  trackRow: { minHeight: 36, justifyContent: 'center' },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: sp(8), padding: sp(10), borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border },
  lineOn: { backgroundColor: colors.selected, borderColor: colors.selected },
  lineName: { flex: 1, flexShrink: 1, gap: sp(4), alignItems: 'flex-start' },
  badge: { paddingHorizontal: sp(8), paddingVertical: sp(2), borderRadius: 999 },
  badgePart: { backgroundColor: colors.info },
  badgeLabor: { backgroundColor: colors.warnBg },
  badgeText: { fontSize: fs(13), fontWeight: '800' },
  badgePartText: { color: colors.selected },
  badgeLaborText: { color: colors.warn },
  lineText: { flexShrink: 1, fontSize: fs(16), fontWeight: '700', color: colors.text },
  lineTextOn: { color: colors.onSelected },
});
