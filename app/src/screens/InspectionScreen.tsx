import { router } from 'expo-router';
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChipRow, MeasureField, SectionTitle } from '../components/controls';
import { CHECK_ITEMS, CHECK_LABEL, checkCounts, CheckStatus, EMPTY_INSPECTION, Inspection, inspectionText, Repair } from '../lib/inspection';
import { Job, jobName } from '../lib/jobs';
import { useJobs } from '../lib/useJobs';
import { colors, touch, type } from '../theme';

const STATUSES: CheckStatus[] = ['ok', 'fix', 'na'];
const TAX_OPTIONS = [
  { label: 'Taxed (parts)', value: 'yes' as const },
  { label: 'No tax (labor)', value: 'no' as const },
];

/**
 * The safety check for one job: each part of the door and opener marked OK,
 * Needs work or N/A, with a note. Repairs it turns up are priced here and go
 * onto every option of the job's quote.
 */
export function InspectionScreen({ job }: { job: Job }) {
  const { setInspection } = useJobs();
  const insp: Inspection = job.inspection ?? EMPTY_INSPECTION(job.savedAt);
  const save = (fn: (i: Inspection) => Inspection) => setInspection(job.id, { ...fn(insp), at: Date.now() });
  const setResult = (id: string, patch: Partial<{ status: CheckStatus; note: string }>) =>
    save((i) => {
      const cur = i.results[id] ?? { status: 'ok' as CheckStatus, note: '' };
      return { ...i, results: { ...i.results, [id]: { ...cur, ...patch } } };
    });
  const setRepair = (id: string, patch: Partial<Repair>) => save((i) => ({ ...i, repairs: i.repairs.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const addRepair = (label: string) =>
    save((i) => ({ ...i, repairs: [...i.repairs, { id: `r-${Date.now().toString(36)}-${i.repairs.length}`, label, price: '', taxable: true }] }));
  const counts = checkCounts(insp);
  const unchecked = CHECK_ITEMS.filter((i) => !insp.results[i.id]);

  return (
    <View style={styles.stack} testID="inspection">
      <Text style={styles.for}>{jobName(job)}</Text>
      <Text style={styles.summary} testID="inspection-summary">
        {counts.done} of {counts.total} checked{counts.fix > 0 ? `, ${counts.fix} need${counts.fix === 1 ? 's' : ''} work` : ''}
      </Text>
      <Text style={styles.note}>Items marked PRO are under spring tension. Only a trained tech should adjust or replace them.</Text>

      {CHECK_ITEMS.map((item) => {
        const r = insp.results[item.id];
        const already = insp.repairs.some((x) => x.label.startsWith(item.label));
        return (
          <View key={item.id} style={[styles.item, r?.status === 'fix' && styles.itemFix]} testID={`check-${item.id}`}>
            <Text style={styles.itemTitle}>
              {item.label}
              {item.pro ? '  · PRO' : ''}
            </Text>
            <Text style={styles.note}>{item.look}</Text>
            <View style={styles.row}>
              {STATUSES.map((s) => {
                const on = r?.status === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setResult(item.id, { status: s })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${item.label}: ${CHECK_LABEL[s]}`}
                    testID={`check-${item.id}-${s}`}
                    style={({ pressed }) => [styles.choice, on && (s === 'fix' ? styles.choiceFix : styles.choiceOn), pressed && !on && styles.pressed]}
                  >
                    <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{CHECK_LABEL[s]}</Text>
                  </Pressable>
                );
              })}
            </View>
            {r?.status === 'fix' ? (
              <>
                <TextInput
                  value={r.note}
                  onChangeText={(note) => setResult(item.id, { note })}
                  placeholder="What's wrong"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel={`${item.label} note`}
                  testID={`check-${item.id}-note`}
                  style={styles.input}
                />
                {!already ? <Action label="Add a repair for this" onPress={() => addRepair(`${item.label}: repair`)} testID={`check-${item.id}-repair`} /> : null}
              </>
            ) : null}
          </View>
        );
      })}
      {unchecked.length > 0 && counts.done > 0 ? (
        <Action
          label={`Mark the other ${unchecked.length} OK`}
          onPress={() => save((i) => ({ ...i, results: { ...i.results, ...Object.fromEntries(unchecked.map((u) => [u.id, { status: 'ok' as CheckStatus, note: '' }])) } }))}
          testID="inspection-rest-ok"
        />
      ) : null}

      <SectionTitle>Repairs</SectionTitle>
      <Text style={styles.note}>Each repair with a price is added to every option on the quote.</Text>
      {insp.repairs.map((r) => (
        <View key={r.id} style={styles.repair} testID={`repair-${r.id}`}>
          <TextInput
            value={r.label}
            onChangeText={(label) => setRepair(r.id, { label })}
            placeholder="Part or repair"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Repair name"
            testID={`repair-name-${r.id}`}
            style={styles.input}
          />
          <MeasureField label="Price" value={r.price} onChange={(price) => setRepair(r.id, { price })} unit="dollars" allowFraction={false} placeholder="Tap to set" testID={`repair-price-${r.id}`} />
          <ChipRow options={TAX_OPTIONS} value={r.taxable ? 'yes' : 'no'} onChange={(v) => setRepair(r.id, { taxable: v === 'yes' })} testID={`repair-tax-${r.id}`} />
          <Action label="Remove" onPress={() => save((i) => ({ ...i, repairs: i.repairs.filter((x) => x.id !== r.id) }))} testID={`repair-remove-${r.id}`} />
        </View>
      ))}
      <Action label="Add a repair" onPress={() => addRepair('')} testID="repair-add" />

      <SectionTitle>Done</SectionTitle>
      <Action label="Quote with repairs" primary onPress={() => router.push({ pathname: '/quote/[id]', params: { id: job.id } })} testID="inspection-quote" />
      <Action label="Send report to customer" onPress={() => Share.share({ message: inspectionText(insp, job.customer) }).catch(() => undefined)} testID="inspection-share" />
    </View>
  );
}

function Action({ label, onPress, primary, testID }: { label: string; onPress: () => void; primary?: boolean; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.button, primary && styles.primary, pressed && styles.pressed]}>
      {({ pressed }) => <Text style={[styles.buttonText, primary && !pressed && styles.primaryText]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  for: { fontSize: type.value, fontWeight: '900', color: colors.text },
  summary: { fontSize: type.body, fontWeight: '800', color: colors.text },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  item: { padding: 12, gap: 8, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg },
  itemFix: { borderWidth: 4, borderColor: colors.stop },
  itemTitle: { fontSize: type.body, fontWeight: '900', color: colors.text },
  row: { flexDirection: 'row', gap: 8 },
  choice: { flex: 1, minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  choiceOn: { backgroundColor: colors.selected },
  choiceFix: { backgroundColor: colors.stop, borderColor: colors.stop },
  choiceText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  choiceTextOn: { color: colors.onSelected },
  repair: { padding: 12, gap: 8, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card },
  input: {
    minHeight: touch.min,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: type.body,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected },
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  primaryText: { color: colors.onSelected },
});
