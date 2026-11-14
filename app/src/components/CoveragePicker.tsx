import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChipOption, ChipRow } from './controls';
import { FollowUpSettings, warrantyFor } from '../lib/followups';
import { DAY } from '../lib/followups';
import { Invoice, trackKey } from '../lib/invoices';
import { formatMoney } from '../lib/prices';
import { colors, type } from '../theme';

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
  const tracked = invoice.warranty?.tracked ?? [];
  const toggle = (key: string) => onChange({ warranty: { tracked: tracked.includes(key) ? tracked.filter((k) => k !== key) : [...tracked, key] } });
  const lines = invoice.lines.filter((l) => l.cents > 0);
  return (
    <View style={styles.box} testID="invoice-coverage">
      <Text style={styles.title}>Warranty on this job</Text>
      <Text style={styles.label}>Parts</Text>
      <ChipRow options={chips(MONTHS, parts, yearsLabel)} value={parts} onChange={(m) => onChange({ warranty: { partsMonths: m } })} scroll testID="coverage-parts" />
      <Text style={styles.label}>Labor</Text>
      <ChipRow options={chips(DAYS, labor, daysLabel)} value={labor} onChange={(d) => onChange({ warranty: { laborDays: d } })} scroll testID="coverage-labor" />
      {covered && lines.length > 0 ? (
        <View style={styles.track} testID="coverage-track">
          <Text style={styles.label}>Track as equipment in Odoo</Text>
          <Text style={styles.hint}>Tap the parts sold that should be kept on the house&apos;s equipment record, with this warranty.</Text>
          {lines.map((l, i) => {
            const key = trackKey(l);
            const on = tracked.includes(key);
            return (
              <Pressable key={`${key}-${i}`} onPress={() => toggle(key)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} testID={`track-${i}`} style={[styles.line, on && styles.lineOn]}>
                <Text style={[styles.lineText, on && styles.lineTextOn]} numberOfLines={2}>
                  {on ? '✓ ' : ''}
                  {l.label}
                </Text>
                <Text style={[styles.lineText, on && styles.lineTextOn]}>{formatMoney(l.cents)}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6, padding: 12, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  title: { fontSize: type.body, fontWeight: '800', color: colors.text },
  label: { fontSize: 16, fontWeight: '700', color: colors.muted },
  hint: { fontSize: 15, color: colors.muted },
  track: { gap: 6, marginTop: 6 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, padding: 10, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  lineOn: { backgroundColor: colors.selected, borderColor: colors.selected },
  lineText: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  lineTextOn: { color: colors.onSelected },
});
