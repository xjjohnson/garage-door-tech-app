import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChipOption, ChipRow } from '../components/controls';
import { DIAG_BRANDS } from '../data/diagnostics';
import { PROG_SAFETY, PROG_TASK_LABEL, PROG_TASK_ORDER, ProgTaskKind } from '../data/programming';
import { hostOf } from '../lib/diagnose';
import { manualsFor, progBrands, progFamiliesFor, progFamilyById, taskFor } from '../lib/programming';
import { colors, touch, type } from '../theme';

interface Props {
  openUrl: (url: string) => Promise<unknown>;
}

/**
 * Step-by-step opener programming: pick the maker, the kind of opener on the
 * ladder, and the job (remotes, keypad, travel limits, force, erase all).
 * Bundled, so it works with no signal; only the manual links need one.
 */
export function ProgramScreen({ openUrl }: Props) {
  const brands = useMemo(() => progBrands(), []);
  const [brandId, setBrandId] = useState<string>(brands[0]);
  const families = useMemo(() => progFamiliesFor(brandId), [brandId]);
  const [familyId, setFamilyId] = useState<string>(families[0].id);
  const [kind, setKind] = useState<ProgTaskKind>('remote');

  const family = progFamilyById(familyId) ?? families[0];
  const task = taskFor(family, kind);
  const manuals = manualsFor(family);

  const brandOptions: ChipOption<string>[] = brands.map((id) => ({ label: DIAG_BRANDS.find((b) => b.id === id)?.name ?? id, value: id }));
  const familyOptions: ChipOption<string>[] = families.map((f) => ({ label: f.name, value: f.id }));
  const taskOptions: ChipOption<ProgTaskKind>[] = PROG_TASK_ORDER.filter((k) => taskFor(family, k)).map((k) => ({ label: PROG_TASK_LABEL[k], value: k }));

  function pickBrand(id: string) {
    setBrandId(id);
    setFamilyId(progFamiliesFor(id)[0].id);
  }

  return (
    <View style={styles.stack} testID="diagnose-program">
      <Text style={styles.label}>Brand</Text>
      <ChipRow options={brandOptions} value={brandId} onChange={pickBrand} testID="program-brands" />
      <Text style={styles.label}>Which opener is on the ladder?</Text>
      <ChipRow options={familyOptions} value={family.id} onChange={setFamilyId} testID="program-families" />
      <View style={styles.read} testID="program-identify">
        <Text style={styles.readBody}>{family.identify}</Text>
        <Text style={styles.models}>{family.models.join(' · ')}</Text>
      </View>

      <Text style={styles.label}>What are you setting?</Text>
      <ChipRow options={taskOptions} value={kind} onChange={setKind} testID="program-tasks" compact />

      {task ? (
        <View style={styles.card} testID={`program-${family.id}-${task.kind}`}>
          <Text style={styles.cardTitle}>{PROG_TASK_LABEL[task.kind]}</Text>
          {task.kind === 'limits' || task.kind === 'force' ? (
            <View style={styles.safety} accessibilityRole="alert" testID="program-safety">
              {PROG_SAFETY.map((line) => (
                <Text key={line} style={styles.safetyLine}>
                  • {line}
                </Text>
              ))}
            </View>
          ) : null}
          {task.before ? <Text style={styles.before}>{task.before}</Text> : null}
          <View style={styles.steps}>
            {task.steps.map((step, i) => (
              <View key={step} style={styles.stepRow}>
                <Text style={styles.stepNum}>{i + 1}.</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
          {task.note ? <Text style={styles.note}>{task.note}</Text> : null}
          {task.checked ? null : (
            <View style={styles.unchecked} testID="program-unchecked">
              <Text style={styles.uncheckedTitle}>Not checked against the maker's manual yet</Text>
              {(task.toCheck ?? []).map((line) => (
                <Text key={line} style={styles.uncheckedLine}>
                  • {line}
                </Text>
              ))}
            </View>
          )}
        </View>
      ) : null}

      <View style={styles.sources}>
        <Text style={styles.subhead}>Check in the maker's manual</Text>
        <Text style={styles.hint}>Star these in Manuals to keep them on the phone.</Text>
        {manuals.map((m) => {
          const url = m.docs?.[0]?.url ?? m.url;
          return (
            <Pressable
              key={m.id}
              onPress={() => openUrl(url).catch(() => undefined)}
              accessibilityRole="link"
              accessibilityLabel={`${m.title}. Opens ${hostOf(url)}, needs a signal.`}
              testID={`program-manual-${m.id}`}
              style={({ pressed }) => [styles.source, pressed && styles.pressed]}
            >
              <Text style={styles.sourceTitle}>{m.title}</Text>
              <Text style={styles.sourceHost}>Opens {hostOf(url)}, needs a signal</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  hint: { fontSize: 16, color: colors.muted },
  read: { padding: 12, borderRadius: 10, backgroundColor: colors.card, gap: 6 },
  readBody: { fontSize: type.body, color: colors.text, lineHeight: 24 },
  models: { fontSize: 15, color: colors.muted },
  card: { padding: 12, borderRadius: 10, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.bg, gap: 10 },
  cardTitle: { fontSize: type.value, fontWeight: '900', color: colors.text },
  safety: { padding: 10, borderRadius: 8, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.safety, gap: 4 },
  safetyLine: { fontSize: 16, fontWeight: '700', color: colors.text, lineHeight: 22 },
  before: { fontSize: type.body, fontWeight: '700', color: colors.text, lineHeight: 24 },
  steps: { gap: 10 },
  stepRow: { flexDirection: 'row', gap: 8 },
  stepNum: { fontSize: type.body, fontWeight: '900', color: colors.text, minWidth: 28 },
  stepText: { flex: 1, fontSize: type.body, color: colors.text, lineHeight: 24 },
  note: { fontSize: 16, fontWeight: '700', color: colors.muted, lineHeight: 22 },
  unchecked: { padding: 10, borderRadius: 8, backgroundColor: colors.info, gap: 4 },
  uncheckedTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  uncheckedLine: { fontSize: 15, color: colors.text, lineHeight: 21 },
  subhead: { fontSize: type.body, fontWeight: '900', color: colors.text, marginTop: 4 },
  sources: { gap: 8 },
  source: { minHeight: touch.min, padding: 10, borderRadius: 10, borderWidth: 2, borderColor: colors.border, justifyContent: 'center', gap: 2 },
  sourceTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  sourceHost: { fontSize: 14, fontWeight: '600', color: colors.muted },
  pressed: { backgroundColor: colors.safety },
});
