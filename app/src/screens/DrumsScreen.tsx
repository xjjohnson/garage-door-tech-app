import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BarSummary, CalcLayout, waitingSummary } from '../components/CalcLayout';
import { ChipOption, ChipRow, ClearButton, Field, MeasureField, MultiChipRow, SectionTitle } from '../components/controls';
import { Card, ErrorCard, MissingCard, SafetyBanner, SpringDetails, Stat, Warnings } from '../components/results';
import { SaveJobPanel } from '../components/SaveJobPanel';
import { CYCLE_CHOICES, DEFAULT_DRUMS_FORM, DrumsForm, DrumsResult, HEIGHT_CHOICES, ID_CHOICES, LIFT_CHOICES, Outcome, runDrums } from '../lib/forms';
import { OpenJobRequest } from '../lib/jobs';
import { formatFeetInches, formatInches, formatTurns, parseMeasurement } from '../lib/measure';
import { usePersistentForm } from '../lib/usePersistentForm';
import { colors, type } from '../theme';

const COUNT_OPTIONS: ChipOption<1 | 2>[] = [
  { label: 'One spring', value: 1 },
  { label: 'Pair', value: 2 },
];
const CYCLE_OPTIONS: ChipOption<number>[] = CYCLE_CHOICES.map((c) => ({ label: `${c / 1000}k`, value: c }));
const ID_OPTIONS: ChipOption<number>[] = ID_CHOICES.map((c) => ({ label: c.label, value: c.value }));

export const DRUMS_STORAGE_KEY = 'spring-calc/drums-form/v1';

/** Which drum fits, cable lengths, and turns and springs for high lift (Canimex D400-54). */
export function DrumsScreen({ open }: { open?: OpenJobRequest }) {
  const { form, update, reset, replace } = usePersistentForm<DrumsForm>(DRUMS_STORAGE_KEY, DEFAULT_DRUMS_FORM);
  const outcome = useMemo(() => runDrums(form), [form]);
  const summary = drumsSummary(outcome);
  const [linkedId, setLinkedId] = useState<string | undefined>();
  useEffect(() => {
    if (open?.job.mode !== 'drums') return;
    replace(open.job.form);
    setLinkedId(open.job.id);
    // Only a new request loads; the nonce changes on every open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.nonce]);
  const heightOther = parseMeasurement(form.heightOther);
  const high = form.lift === 'high';

  const inputs = (
    <>
      <SectionTitle first>The door</SectionTitle>
      <Field label="Lift">
        <ChipRow options={LIFT_CHOICES} value={form.lift} onChange={(lift) => update({ lift })} testID="drums-lift" />
      </Field>
      <Field label="Door height">
        <ChipRow options={[...HEIGHT_CHOICES]} value={form.heightChoice} onChange={(heightChoice) => update({ heightChoice })} testID="drums-height" />
      </Field>
      {form.heightChoice === 'other' ? (
        <MeasureField
          label="Door height in inches"
          value={form.heightOther}
          onChange={(h) => update({ heightOther: h })}
          unit="in"
          below={heightOther !== undefined ? `= ${formatFeetInches(heightOther)}` : "7' = 84, 8' = 96"}
          testID="field-drums-height-other"
        />
      ) : null}
      {high ? (
        <MeasureField
          label="High lift"
          hint="How far the vertical track runs straight up past the top of the door opening before it curves."
          value={form.highLift}
          onChange={(highLift) => update({ highLift })}
          unit="in"
          testID="field-drums-high-lift"
        />
      ) : null}
      <MeasureField
        label={high ? 'Door weight' : 'Door weight (optional)'}
        hint={high ? 'Weigh it with the springs unloaded.' : 'Checks the load each drum is rated for.'}
        value={form.weight}
        onChange={(weight) => update({ weight })}
        unit="lb"
        allowFraction={false}
        testID="field-drums-weight"
      />
      <MeasureField
        label="Floor to shaft center (optional)"
        hint="Measure to the middle of the torsion shaft to get the cable length."
        value={form.shaftHeight}
        onChange={(shaftHeight) => update({ shaftHeight })}
        unit="in"
        testID="field-drums-shaft-height"
      />
      {high ? (
        <>
          <SectionTitle>The springs you want</SectionTitle>
          <Field label="Springs">
            <ChipRow options={COUNT_OPTIONS} value={form.springCount} onChange={(springCount) => update({ springCount })} testID="drums-count" />
          </Field>
          <Field label="Cycle rating at least">
            <ChipRow options={CYCLE_OPTIONS} value={form.targetCycles} onChange={(targetCycles) => update({ targetCycles })} testID="drums-cycles" />
          </Field>
          <Field label="Inside diameters to consider" hint="Pick one or more.">
            <MultiChipRow options={ID_OPTIONS} values={form.ids} onChange={(ids) => update({ ids })} testID="drums-ids" />
          </Field>
        </>
      ) : null}
      <ClearButton
        onPress={() => {
          reset();
          setLinkedId(undefined);
        }}
        testID="clear-drums"
      />
    </>
  );

  const results = (
    <>
      <SectionTitle>Results</SectionTitle>
      {outcome.status === 'error' ? <ErrorCard message={outcome.message} /> : null}
      {outcome.status === 'ok' && outcome.result.highLift ? <Warnings warnings={outcome.result.highLift.warnings} /> : null}
      {outcome.status === 'ok' && outcome.result.noTurns ? <Warnings warnings={[{ level: 'info', message: outcome.result.noTurns }]} /> : null}
      <SafetyBanner />
      {outcome.status === 'incomplete' ? <MissingCard missing={outcome.missing} /> : null}
      {outcome.status === 'ok' ? <DrumsResults result={outcome.result} springCount={form.springCount} /> : null}
      <SaveJobPanel inputs={{ mode: 'drums', form }} summary={summary} ready={outcome.status !== 'incomplete'} linkedId={linkedId} onLink={setLinkedId} testID="drums-save-job" />
    </>
  );

  return <CalcLayout inputs={inputs} results={results} summary={summary} testID="drums-bar" />;
}

export function drumsSummary(outcome: Outcome<DrumsResult>): BarSummary {
  if (outcome.status === 'incomplete') return waitingSummary(outcome.missing);
  if (outcome.status === 'error') return { tone: 'stop', title: 'STOP', detail: outcome.message };
  const r = outcome.result;
  const fitting = r.fits.filter((f) => f.fits).map((f) => f.drum.model);
  const drums = fitting.length > 0 ? `Drums: ${fitting.slice(0, 3).join(', ')}` : 'No drum on file fits';
  const hl = r.highLift;
  if (hl) {
    const stop = hl.warnings.find((w) => w.level === 'stop');
    if (stop) return { tone: 'stop', title: 'STOP', detail: stop.message };
    return { tone: 'ok', title: `Wind ${formatTurns(hl.turns)} turns · ${hl.ipptPerSpring.toFixed(1)} IPPT`, detail: `D400-54 · ${hl.options.length} spring${hl.options.length === 1 ? '' : 's'} that fit` };
  }
  return { tone: fitting.length > 0 ? 'ok' : 'stop', title: drums, detail: r.noTurns };
}

function DrumsResults({ result, springCount }: { result: DrumsResult; springCount: 1 | 2 }) {
  const hl = result.highLift;
  return (
    <View style={styles.stack} testID="drums-results">
      {hl ? (
        <Card title="Wind (D400-54)" testID="card-high-lift">
          <Stat label="Turns to wind" value={formatTurns(hl.turns)} sub={`Canimex: ${hl.exactTurns.toFixed(1)}`} />
          <Stat label="Rate needed per spring" value={`${hl.ipptPerSpring.toFixed(1)} IPPT`} />
          {hl.cableLengthIn !== undefined ? <Stat label="Cable length (each)" value={formatInches(hl.cableLengthIn, 8)} /> : null}
        </Card>
      ) : null}
      {hl && hl.options.length > 0 ? (
        <Card title={springCount === 2 ? 'Spring pairs that fit' : 'Springs that fit'} testID="card-high-lift-options">
          <Text style={styles.note}>Lightest first, sized on Canimex's chart.{springCount === 2 ? ' Order one left-wound and one right-wound.' : ''}</Text>
          {hl.options.map((o, i) => (
            <View key={i} style={i > 0 ? styles.divider : undefined}>
              <Text style={styles.optionNumber}>Option {i + 1}</Text>
              <SpringDetails spec={o} />
            </View>
          ))}
        </Card>
      ) : null}
      <Card title="Drums" testID="card-drums">
        {result.fits.map((f) => (
          <View key={f.drum.model} style={styles.drum} testID={`drum-${f.drum.model}`}>
            <Text style={[styles.drumName, !f.fits && styles.off]}>
              {f.fits ? '✓ ' : '✗ '}
              {f.drum.model}
              {f.drum.aka ? ` (${f.drum.aka})` : ''}
            </Text>
            <Text style={styles.drumDetail}>
              {f.fits ? `Up to ${f.drum.maxLoadLb} lb a drum, cable to ${f.drum.maxCable}` : f.reason}
              {f.fits && f.cableLengthIn !== undefined ? ` · cable ${formatInches(f.cableLengthIn, 8)} each` : ''}
            </Text>
          </View>
        ))}
        <Text style={styles.note}>Canimex drums. Cable lengths are for cable with buttons; an adjustable anchor takes a little more.</Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
  divider: { borderTopWidth: 2, borderTopColor: colors.border, paddingTop: 10 },
  optionNumber: { fontSize: 16, fontWeight: '900', color: colors.muted, letterSpacing: 1 },
  drum: { gap: 2 },
  drumName: { fontSize: type.body, fontWeight: '900', color: colors.text },
  drumDetail: { fontSize: 16, color: colors.text },
  off: { color: colors.muted },
});
