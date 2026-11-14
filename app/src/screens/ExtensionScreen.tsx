import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { BarSummary, CalcLayout, waitingSummary } from '../components/CalcLayout';
import { ChipOption, ChipRow, ClearButton, Field, MeasureField, SectionTitle } from '../components/controls';
import { Card, ErrorCard, EXTENSION_SAFETY_TEXT, MissingCard, SafetyBanner, Stat, Warnings } from '../components/results';
import { EstimateWeightLink } from '../components/EstimateWeightLink';
import { SaveJobPanel } from '../components/SaveJobPanel';
import { DEFAULT_EXTENSION_FORM, ExtensionForm, EXTENSION_HEIGHT_CHOICES, Outcome, runExtension } from '../lib/forms';
import { OpenJobRequest } from '../lib/jobs';
import { formatFeetInches, formatInches, parseMeasurement } from '../lib/measure';
import { usePersistentForm } from '../lib/usePersistentForm';
import { EXTENSION_COLORS, ExtensionResult } from '../springCalc';
import { colors, type } from '../theme';

const PER_SIDE_OPTIONS: ChipOption<1 | 2>[] = [
  { label: 'One a side (2)', value: 1 },
  { label: 'Two a side (4)', value: 2 },
];

const COLOR_OPTIONS: ChipOption<string>[] = [{ label: 'Not sure', value: '' }, ...EXTENSION_COLORS.map((c) => ({ label: c, value: c }))];

export const EXTENSION_STORAGE_KEY = 'spring-calc/extension-form/v1';

/** Extension springs: size from the door weight, or match the old springs by tag or color. */
export function ExtensionScreen({ open }: { open?: OpenJobRequest }) {
  const { form, update, reset, replace } = usePersistentForm<ExtensionForm>(EXTENSION_STORAGE_KEY, DEFAULT_EXTENSION_FORM);
  const outcome = useMemo(() => runExtension(form), [form]);
  const summary = extensionSummary(outcome);
  const [linkedId, setLinkedId] = useState<string | undefined>();
  useEffect(() => {
    if (open?.job.mode !== 'extension') return;
    replace(open.job.form);
    setLinkedId(open.job.id);
    // Only a new request loads; the nonce changes on every open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.nonce]);
  const heightOther = parseMeasurement(form.heightOther);

  const inputs = (
    <>
      <SectionTitle first>The door</SectionTitle>
      <Field label="Door height">
        <ChipRow options={[...EXTENSION_HEIGHT_CHOICES]} value={form.heightChoice} onChange={(heightChoice) => update({ heightChoice })} testID="ext-height" />
      </Field>
      {form.heightChoice === 'other' ? (
        <MeasureField
          label="Door height in inches"
          value={form.heightOther}
          onChange={(h) => update({ heightOther: h })}
          unit="in"
          below={heightOther !== undefined ? `= ${formatFeetInches(heightOther)}` : "7' = 84, 8' = 96"}
          testID="field-ext-height-other"
        />
      ) : null}
      <Field label="Springs on the door">
        <ChipRow options={PER_SIDE_OPTIONS} value={form.springsPerSide} onChange={(springsPerSide) => update({ springsPerSide })} testID="ext-per-side" />
      </Field>
      <MeasureField
        label="Door weight"
        hint="Best answer. Door down, springs off, analog scale under the middle of the bottom section."
        value={form.weight}
        onChange={(weight) => update({ weight })}
        unit="lb"
        allowFraction={false}
        placeholder="Tap to enter, or use the old springs"
        testID="field-ext-weight"
      />
      <EstimateWeightLink testID="ext-estimate-weight" />

      <SectionTitle>The old springs</SectionTitle>
      <MeasureField
        label="Pull on the tag (optional)"
        hint="The pounds printed on the old spring's tag or sticker."
        value={form.oldRating}
        onChange={(oldRating) => update({ oldRating })}
        unit="lb"
        allowFraction={false}
        allowDecimal={false}
        testID="field-ext-rating"
      />
      <Field label="Color (optional)" hint="The paint on the end coils. A color repeats every 100 lb, so it can't size a spring alone.">
        <ChipRow options={COLOR_OPTIONS} value={form.oldColor} onChange={(oldColor) => update({ oldColor })} compact testID="ext-color" />
      </Field>
      <MeasureField
        label="Old spring length (optional)"
        hint="Relaxed, coils only, without the loops or clips."
        value={form.oldLength}
        onChange={(oldLength) => update({ oldLength })}
        unit="in"
        testID="field-ext-length"
      />
      <ClearButton
        onPress={() => {
          reset();
          setLinkedId(undefined);
        }}
        testID="clear-ext"
      />
    </>
  );

  const results = (
    <>
      <SectionTitle>Results</SectionTitle>
      {outcome.status === 'error' ? <ErrorCard message={outcome.message} /> : null}
      {outcome.status === 'ok' ? <Warnings warnings={outcome.result.warnings} /> : null}
      <SafetyBanner text={EXTENSION_SAFETY_TEXT} />
      {outcome.status === 'incomplete' ? <MissingCard missing={outcome.missing} /> : null}
      {outcome.status === 'ok' ? <ExtensionResults result={outcome.result} /> : null}
      <SaveJobPanel
        inputs={{ mode: 'extension', form }}
        summary={summary}
        ready={outcome.status !== 'incomplete'}
        linkedId={linkedId}
        onLink={setLinkedId}
        testID="ext-save-job"
      />
    </>
  );

  return <CalcLayout inputs={inputs} results={results} summary={summary} testID="ext-bar" />;
}

/** "140 lb Blue" for a side whose springs match, "110 + 100 lb" when they don't. */
export function perSideName(perSide: { ratingLb: number; color: string }[]): string {
  const [first] = perSide;
  if (first && perSide.every((s) => s.ratingLb === first.ratingLb)) return `${first.ratingLb} lb ${first.color}`;
  return `${perSide.map((s) => s.ratingLb).join(' + ')} lb`;
}

function sizeLine(r: ExtensionResult): string {
  return r.lengthIn !== undefined ? `${r.lengthIn}" × ${r.stretchIn}"` : `${formatInches(r.stretchIn)} stretch`;
}

export function extensionSummary(outcome: Outcome<ExtensionResult>): BarSummary {
  if (outcome.status === 'incomplete') return waitingSummary(outcome.missing);
  if (outcome.status === 'error') return { tone: 'stop', title: 'STOP', detail: outcome.message };
  const r = outcome.result;
  const stop = r.warnings.find((w) => w.level === 'stop');
  if (stop || !r.perSide) return { tone: 'stop', title: 'STOP', detail: stop?.message ?? 'No size yet.' };
  return { tone: 'ok', title: `${r.springCount} × ${perSideName(r.perSide)}`, detail: `${sizeLine(r)} · from the ${r.basis}` };
}

function ExtensionResults({ result }: { result: ExtensionResult }) {
  return (
    <View style={styles.stack} testID="ext-results">
      {result.perSide ? (
        <Card title={result.springCount === 4 ? 'Order 4 springs' : 'Order 2 springs'} testID="card-ext">
          <Text style={styles.big}>{perSideName(result.perSide)}</Text>
          {result.springCount === 4 && result.perSide.some((s) => s.ratingLb !== result.perSide![0]!.ratingLb) ? (
            <Text style={styles.note}>
              Each side gets one {result.perSide.map((s) => `${s.ratingLb} lb (${s.color})`).join(' and one ')}.
            </Text>
          ) : null}
          <Stat label="Each side lifts" value={`${result.liftsLb} lb`} />
          {result.lengthIn !== undefined ? <Stat label="Length × stretch" value={`${result.lengthIn}" × ${result.stretchIn}"`} sub={result.otherLengthsIn ? `also stocked: ${result.otherLengthsIn.map((l) => `${l}"`).join(', ')} long` : undefined} /> : <Stat label="Stretch" value={formatInches(result.stretchIn)} />}
          <Stat label="Sized from" value={result.basis} />
        </Card>
      ) : null}
      {result.colorCandidatesLb ? (
        <Card title="The old color could be" testID="card-ext-candidates">
          <Text style={styles.big}>{result.colorCandidatesLb.map((lb) => `${lb} lb`).join(' · ')}</Text>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  big: { fontSize: type.big, fontWeight: '900', color: colors.text },
  note: { fontSize: 17, color: colors.text, lineHeight: 24 },
});
