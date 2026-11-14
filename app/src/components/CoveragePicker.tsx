import { StyleSheet, Text, View } from 'react-native';
import { ChipOption, ChipRow } from './controls';
import { FollowUpSettings, warrantyFor } from '../lib/followups';
import type { Invoice } from '../lib/invoices';
import { colors, type } from '../theme';

const MONTHS: number[] = [0, 6, 12, 24, 36, 60];
const label = (m: number) => (m === 0 ? 'None' : m % 12 === 0 ? `${m / 12} yr` : `${m} mo`);
const OPTIONS: ChipOption<number>[] = MONTHS.map((m) => ({ label: label(m), value: m }));

/** The months a chip row shows as chosen: the job's own pick, else what the settings give. */
function monthsFor(invoice: Invoice, settings: FollowUpSettings, kind: 'parts' | 'labor'): number {
  const w = warrantyFor(invoice, settings);
  const until = kind === 'parts' ? w.partsUntil : w.laborUntil;
  if (!until) return 0;
  const a = new Date(invoice.createdAt);
  const b = new Date(until);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/**
 * What this job is covered by, picked per job: the warranty on parts and on
 * labor (either, both or neither).
 */
export function CoveragePicker({ invoice, settings, onChange }: { invoice: Invoice; settings: FollowUpSettings; onChange: (patch: Partial<Pick<Invoice, 'warranty'>>) => void }) {
  const parts = monthsFor(invoice, settings, 'parts');
  const labor = monthsFor(invoice, settings, 'labor');
  // A length the chips don't offer (from the settings) is still shown.
  const withCurrent = (m: number) => (MONTHS.includes(m) ? OPTIONS : [...OPTIONS, { label: label(m), value: m }].sort((a, b) => a.value - b.value));
  return (
    <View style={styles.box} testID="invoice-coverage">
      <Text style={styles.title}>Warranty on this job</Text>
      <Text style={styles.label}>Parts</Text>
      <ChipRow options={withCurrent(parts)} value={parts} onChange={(m) => onChange({ warranty: { partsMonths: m } })} scroll testID="coverage-parts" />
      <Text style={styles.label}>Labor</Text>
      <ChipRow options={withCurrent(labor)} value={labor} onChange={(m) => onChange({ warranty: { laborMonths: m } })} scroll testID="coverage-labor" />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6, padding: 12, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  title: { fontSize: type.body, fontWeight: '800', color: colors.text },
  label: { fontSize: 16, fontWeight: '700', color: colors.muted },
});
