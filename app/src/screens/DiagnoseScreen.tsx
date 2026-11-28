import { useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Text } from '../components/AppText';
import { ChipOption, ChipRow, Segmented } from '../components/controls';
import { DIAG_BRANDS, DIAG_SAFETY, DiagSource, SYMPTOMS } from '../data/diagnostics';
import { familiesFor, familyById, findCode, hostOf } from '../lib/diagnose';
import { ProgramScreen } from './ProgramScreen';
import { colors, touch, type, bw, fs, rad, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

type Mode = 'symptom' | 'code' | 'program';

const MODE_OPTIONS: ChipOption<Mode>[] = [
  { label: 'By symptom', value: 'symptom' },
  { label: 'By code', value: 'code' },
  { label: 'Program', value: 'program' },
];

const BRAND_OPTIONS: ChipOption<string>[] = DIAG_BRANDS.map((b) => ({ label: b.name, value: b.id }));
const SYMPTOM_OPTIONS: ChipOption<string>[] = SYMPTOMS.map((s) => ({ label: s.title, value: s.id }));
const NONE = '';

interface Props {
  openUrl?: (url: string) => Promise<unknown>;
}

/**
 * Opener troubleshooting that works with no signal: pick what the door is
 * doing, or the maker and the blink or beep code, and get the checks in
 * order. Program has step-by-step guides for remotes, keypads, travel
 * limits and force. Only the maker links at the bottom need internet.
 */
export function DiagnoseScreen({ openUrl = (u) => Linking.openURL(u) }: Props) {
  const styles = useStyles();
  const [mode, setMode] = useState<Mode>('symptom');
  const [symptomId, setSymptomId] = useState<string>(NONE);
  const [brandId, setBrandId] = useState<string>(DIAG_BRANDS[0].id);
  const [familyId, setFamilyId] = useState<string>(familiesFor(DIAG_BRANDS[0].id)[0].id);
  const [code, setCode] = useState<string>(NONE);

  const families = useMemo(() => familiesFor(brandId), [brandId]);
  const family = familyById(familyId) ?? families[0];
  const familyOptions = useMemo<ChipOption<string>[]>(() => families.map((f) => ({ label: f.name, value: f.id })), [families]);
  const codeOptions = useMemo<ChipOption<string>[]>(() => family.codes.map((c) => ({ label: c.code, value: c.code })), [family]);
  const picked = code === NONE ? undefined : family.codes.find((c) => c.code === code);
  const symptom = SYMPTOMS.find((s) => s.id === symptomId);

  function pickBrand(id: string) {
    setBrandId(id);
    setFamilyId(familiesFor(id)[0].id);
    setCode(NONE);
  }

  function pickFamily(id: string) {
    setFamilyId(id);
    setCode(NONE);
  }

  function jumpTo(target: { family: string; code: string }) {
    const hit = findCode(target.family, target.code);
    if (!hit) return;
    setBrandId(hit.family.brand);
    setFamilyId(hit.family.id);
    setCode(hit.code.code);
    setMode('code');
  }

  return (
    <View style={styles.stack}>
      <View style={styles.safety} accessibilityRole="alert" testID="diagnose-safety">
        <Text style={styles.safetyTitle}>Safety first</Text>
        {DIAG_SAFETY.map((line) => (
          <Text key={line} style={styles.safetyLine}>
            • {line}
          </Text>
        ))}
      </View>

      {/* A mode, not an answer: the same joined switch as Springs and Manuals. */}
      <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} testID="diagnose-mode" />

      {mode === 'symptom' ? (
        <View style={styles.stack} testID="diagnose-by-symptom">
          <Text style={styles.label}>What is the door doing?</Text>
          <ChipRow options={SYMPTOM_OPTIONS} value={symptomId} onChange={setSymptomId} testID="diagnose-symptoms" />
          {symptom ? (
            <View style={styles.card} testID={`symptom-${symptom.id}`}>
              <Text style={styles.cardTitle}>{symptom.title}</Text>
              <Text style={styles.summary}>{symptom.summary}</Text>
              <Checks items={symptom.checks} />
              <Text style={styles.subhead}>Codes that point here</Text>
              <View style={styles.related}>
                {symptom.related.map((r) => {
                  const hit = findCode(r.family, r.code);
                  if (!hit) return null;
                  const brand = DIAG_BRANDS.find((b) => b.id === hit.family.brand)!;
                  return (
                    <Pressable
                      key={`${r.family}:${r.code}`}
                      onPress={() => jumpTo(r)}
                      accessibilityRole="button"
                      accessibilityLabel={`${brand.name}, ${hit.family.name}, code ${hit.code.code}. Show checks.`}
                      testID={`related-${r.family}-${r.code}`}
                      style={({ pressed }) => [styles.relatedItem, pressed && styles.pressed]}
                    >
                      <Text style={styles.relatedCode}>
                        {brand.name}: {hit.code.code}
                      </Text>
                      <Text style={styles.relatedMeaning}>{hit.code.meaning}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Sources sources={symptom.sources} openUrl={openUrl} />
            </View>
          ) : (
            <Text style={styles.hint}>Pick one to see what to check, in order.</Text>
          )}
        </View>
      ) : mode === 'program' ? (
        <ProgramScreen openUrl={openUrl} />
      ) : (
        <View style={styles.stack} testID="diagnose-by-code">
          <Text style={styles.label}>Brand</Text>
          <ChipRow options={BRAND_OPTIONS} value={brandId} onChange={pickBrand} testID="diagnose-brands" />
          {familyOptions.length > 1 ? (
            <>
              <Text style={styles.label}>Model family</Text>
              <ChipRow options={familyOptions} value={family.id} onChange={pickFamily} testID="diagnose-families" />
            </>
          ) : null}
          <View style={styles.read} testID="diagnose-how-to-read">
            <Text style={styles.readTitle}>{family.name}</Text>
            <Text style={styles.readBody}>{family.howToRead}</Text>
            {family.note ? <Text style={styles.readNote}>{family.note}</Text> : null}
            <Text style={styles.models}>{family.models.join(' · ')}</Text>
          </View>
          <Text style={styles.label}>Code you see</Text>
          <ChipRow options={codeOptions} value={code} onChange={setCode} testID="diagnose-codes" compact />
          {picked ? (
            <View style={styles.card} testID={`code-${family.id}-${picked.code}`}>
              <Text style={styles.codeBig}>{picked.code}</Text>
              <Text style={styles.cardTitle}>{picked.meaning}</Text>
              {picked.symptom ? <Text style={styles.summary}>{picked.symptom}</Text> : null}
              {picked.pro ? (
                <View style={styles.pro} accessibilityRole="alert" testID="diagnose-pro">
                  <Text style={styles.proText}>Springs or cables may be involved. Only a trained tech should adjust them.</Text>
                </View>
              ) : null}
              {picked.note ? <Text style={styles.readNote}>{picked.note}</Text> : null}
              <Checks items={picked.checks} />
              <Sources sources={family.sources} openUrl={openUrl} />
            </View>
          ) : (
            <Text style={styles.hint}>Pick the code you counted to see what to check, in order.</Text>
          )}
        </View>
      )}
    </View>
  );
}

function Checks({ items }: { items: string[] }) {
  const styles = useStyles();
  return (
    <View style={styles.checks}>
      {items.map((item, i) => (
        <View key={item} style={styles.checkRow}>
          <Text style={styles.checkNum}>{i + 1}.</Text>
          <Text style={styles.checkText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function Sources({ sources, openUrl }: { sources: DiagSource[]; openUrl: (url: string) => Promise<unknown> }) {
  const styles = useStyles();
  return (
    <View style={styles.sources}>
      <Text style={styles.subhead}>From the maker</Text>
      {sources.map((s) => (
        <Pressable
          key={s.url}
          onPress={() => openUrl(s.url).catch(() => undefined)}
          accessibilityRole="link"
          accessibilityLabel={`${s.title}. Opens ${hostOf(s.url)}, needs a signal.`}
          testID={`source-${s.url}`}
          style={({ pressed }) => [styles.source, pressed && styles.pressed]}
        >
          <Text style={styles.sourceTitle}>{s.title}</Text>
          <Text style={styles.sourceHost}>Opens {hostOf(s.url)}, needs a signal</Text>
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: sp(12) },
  safety: { padding: sp(12), borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, backgroundColor: colors.warnBg, gap: sp(6) },
  safetyTitle: { fontSize: type.value, fontWeight: '800', color: colors.text },
  safetyLine: { fontSize: fs(16), fontWeight: '600', color: colors.text, lineHeight: fs(22) },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  hint: { fontSize: fs(16), color: colors.muted },
  card: { padding: sp(12), borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, backgroundColor: colors.card, gap: sp(8) },
  cardTitle: { fontSize: type.value, fontWeight: '800', color: colors.text },
  codeBig: { fontSize: type.huge, fontWeight: '800', color: colors.text },
  summary: { fontSize: type.body, fontWeight: '600', color: colors.text, lineHeight: fs(24) },
  subhead: { fontSize: type.body, fontWeight: '800', color: colors.text, marginTop: sp(4) },
  checks: { gap: sp(8) },
  checkRow: { flexDirection: 'row', gap: sp(8) },
  checkNum: { fontSize: type.body, fontWeight: '800', color: colors.text, minWidth: 28 },
  checkText: { flex: 1, fontSize: type.body, color: colors.text, lineHeight: fs(24) },
  pro: { padding: sp(10), borderRadius: rad(8), backgroundColor: colors.stop },
  proText: { fontSize: type.body, fontWeight: '800', color: colors.onStop },
  read: { padding: sp(12), borderRadius: rad(14), backgroundColor: colors.card, gap: sp(6) },
  readTitle: { fontSize: type.body, fontWeight: '800', color: colors.text },
  readBody: { fontSize: type.body, color: colors.text, lineHeight: fs(24) },
  readNote: { fontSize: fs(16), fontWeight: '700', color: colors.muted },
  models: { fontSize: fs(15), color: colors.muted },
  related: { gap: sp(8) },
  relatedItem: { minHeight: touch.min, padding: sp(10), borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, justifyContent: 'center', gap: sp(2) },
  relatedCode: { fontSize: type.body, fontWeight: '800', color: colors.text },
  relatedMeaning: { fontSize: fs(16), color: colors.muted },
  sources: { gap: sp(8) },
  source: { minHeight: touch.min, padding: sp(10), borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, justifyContent: 'center', gap: sp(2) },
  sourceTitle: { fontSize: fs(16), fontWeight: '800', color: colors.text },
  sourceHost: { fontSize: fs(14), fontWeight: '600', color: colors.muted },
  pressed: { backgroundColor: colors.info },
}));
