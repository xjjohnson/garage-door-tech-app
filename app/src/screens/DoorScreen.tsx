import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { BarSummary, CalcLayout, waitingSummary } from '../components/CalcLayout';
import { ChipOption, ChipRow, ClearButton, Field, MeasureField, MultiChipRow, SectionTitle } from '../components/controls';
import { Card, ErrorCard, lbRange, MissingCard, SafetyBanner, SpringDetails, UsesPerDay, Stat, Warnings } from '../components/results';
import { CYCLE_CHOICES, DEFAULT_DOOR_FORM, DoorForm, DRUM_CHOICES, HEIGHT_CHOICES, ID_CHOICES, Outcome, runDoor } from '../lib/forms';
import { formatFeetInches, formatInches, formatTurns, parseMeasurement } from '../lib/measure';
import { usePersistentForm } from '../lib/usePersistentForm';
import { OpenJobRequest } from '../lib/jobs';
import { EstimateWeightLink } from '../components/EstimateWeightLink';
import { SaveJobPanel } from '../components/SaveJobPanel';
import { TRACK_RADIUS_CHOICES, TRACK_RADIUS_HINT } from '../lib/forms';
import { DoorResult } from '../springCalc';
import { colors, type } from '../theme';

const COUNT_OPTIONS: ChipOption<1 | 2>[] = [
  { label: 'One spring', value: 1 },
  { label: 'Pair', value: 2 },
];

const CYCLE_OPTIONS: ChipOption<number>[] = CYCLE_CHOICES.map((c) => ({ label: `${c / 1000}k`, value: c }));
const ID_OPTIONS: ChipOption<number>[] = ID_CHOICES.map((c) => ({ label: c.label, value: c.value }));

export const DOOR_STORAGE_KEY = 'spring-calc/door-form/v1';

export function DoorScreen({ open }: { open?: OpenJobRequest }) {
  const { form, update, reset, replace } = usePersistentForm<DoorForm>(DOOR_STORAGE_KEY, DEFAULT_DOOR_FORM);
  const outcome = useMemo(() => runDoor(form), [form]);
  const summary = doorSummary(outcome, form.springCount);
  // The saved job these inputs came from, so changes can be saved back to it.
  const [linkedId, setLinkedId] = useState<string | undefined>();
  useEffect(() => {
    if (open?.job.mode !== 'door') return;
    replace(open.job.form);
    setLinkedId(open.job.id);
    // Only a new request loads; the nonce changes on every open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.nonce]);
  const heightOther = parseMeasurement(form.heightOther);

  const inputs = (
    <>
      <SectionTitle first>The door</SectionTitle>
      <MeasureField
        label="Door weight"
        hint="Weigh it with the springs unloaded: door down, scale under the bottom section."
        value={form.weight}
        onChange={(weight) => update({ weight })}
        unit="lb"
        allowFraction={false}
        testID="field-weight"
      />
      <EstimateWeightLink testID="door-estimate-weight" />
      <Field label="Door height">
        <ChipRow options={[...HEIGHT_CHOICES]} value={form.heightChoice} onChange={(heightChoice) => update({ heightChoice })} testID="door-height" />
      </Field>
      {form.heightChoice === 'other' ? (
        <MeasureField
          label="Door height in inches"
          value={form.heightOther}
          onChange={(h) => update({ heightOther: h })}
          unit="in"
          below={heightOther !== undefined ? `= ${formatFeetInches(heightOther)}` : "7' = 84, 8' = 96"}
          testID="field-door-height-other"
        />
      ) : null}
      <Field label="Drums (standard lift)">
        <ChipRow options={DRUM_CHOICES} value={form.drum} onChange={(drum) => update({ drum })} testID="door-drum" />
      </Field>
      <Field label="Track radius" hint={TRACK_RADIUS_HINT}>
        <ChipRow options={TRACK_RADIUS_CHOICES} value={form.trackRadius} onChange={(trackRadius) => update({ trackRadius })} testID="door-track" />
      </Field>

      <SectionTitle>The springs you want</SectionTitle>
      <Field label="Springs">
        <ChipRow options={COUNT_OPTIONS} value={form.springCount} onChange={(springCount) => update({ springCount })} testID="door-count" />
      </Field>
      <Field label="Cycle rating at least">
        <ChipRow options={CYCLE_OPTIONS} value={form.targetCycles} onChange={(targetCycles) => update({ targetCycles })} testID="door-cycles" />
      </Field>
      <Field label="Inside diameters to consider" hint="Pick one or more.">
        <MultiChipRow options={ID_OPTIONS} values={form.ids} onChange={(ids) => update({ ids })} testID="door-ids" />
      </Field>
      <MeasureField
        label="Free shaft beside each spring (optional)"
        hint="Leaves out springs that would be too long once wound."
        value={form.shaft}
        onChange={(shaft) => update({ shaft })}
        unit="in"
        testID="field-door-shaft"
      />
      <MeasureField
        label="Floor to shaft center (optional)"
        hint="Measure to the middle of the torsion shaft to get the cable length."
        value={form.shaftHeight}
        onChange={(shaftHeight) => update({ shaftHeight })}
        unit="in"
        testID="field-door-shaft-height"
      />
      <ClearButton
        onPress={() => {
          reset();
          setLinkedId(undefined);
        }} testID="clear-door" />
    </>
  );

  const results = (
    <>
      <SectionTitle>Results</SectionTitle>
      <UsesPerDay />
      {/* STOP and CHECK cards first, so the bar's jump lands on them, then the general safety banner. */}
      {outcome.status === 'error' ? <ErrorCard message={outcome.message} /> : null}
      {outcome.status === 'ok' ? <Warnings warnings={outcome.result.warnings} /> : null}
      <SafetyBanner />
      {outcome.status === 'incomplete' ? <MissingCard missing={outcome.missing} /> : null}
      {outcome.status === 'ok' ? <DoorResults result={outcome.result} springCount={form.springCount} /> : null}
      <SaveJobPanel
        inputs={{ mode: 'door', form }}
        summary={summary}
        ready={outcome.status !== 'incomplete'}
        linkedId={linkedId}
        onLink={setLinkedId}
        testID="door-save-job"
      />
    </>
  );

  return <CalcLayout inputs={inputs} results={results} summary={summary} testID="door-bar" />;
}

/** What the pinned bar says: what's missing, the stop, or how many springs fit and the turns. */
export function doorSummary(outcome: Outcome<DoorResult>, springCount: 1 | 2): BarSummary {
  if (outcome.status === 'incomplete') return waitingSummary(outcome.missing);
  if (outcome.status === 'error') return { tone: 'stop', title: 'STOP', detail: outcome.message };
  const r = outcome.result;
  const turns = `Wind ${formatTurns(r.turns)} turns · ${r.ipptPerSpring.toFixed(1)} IPPT`;
  const stop = r.warnings.find((w) => w.level === 'stop');
  if (stop) return { tone: 'stop', title: 'STOP', detail: stop.message };
  const n = r.options.length;
  const what = springCount === 2 ? 'pair' : 'spring';
  if (n === 0) return { tone: 'stop', title: `No ${what} fits`, detail: turns };
  return { tone: 'ok', title: `${n} ${what}${n === 1 ? '' : 's'} that fit`, detail: turns };
}

function DoorResults({ result, springCount }: { result: DoorResult; springCount: 1 | 2 }) {
  return (
    <View style={styles.stack} testID="door-results">
      <Card title="Wind" testID="card-turns">
        <Stat label="Turns to wind" value={formatTurns(result.turns)} />
        <Stat label="Rate needed per spring" value={`${result.ipptPerSpring.toFixed(1)} IPPT`} />
        {result.cableLengthIn !== undefined ? <Stat label="Cable length (each)" value={formatInches(result.cableLengthIn, 8)} /> : null}
      </Card>
      {result.options.length > 0 ? (
        <Card title={springCount === 2 ? 'Spring pairs that fit' : 'Springs that fit'} testID="card-options">
          <Text style={styles.note}>
            Lightest first. Each is rated a little above the rate needed so the door lands mid-range across maker charts.
            {springCount === 2 ? ' Order one left-wound and one right-wound of the size you pick.' : ''}
          </Text>
          {result.options.map((o, i) => (
            <View key={i} style={i > 0 ? styles.divider : undefined} testID="door-option">
              <Text style={styles.optionNumber}>Option {i + 1}</Text>
              <SpringDetails spec={o}>
                <Stat label={springCount === 2 ? 'Pair balances' : 'Balances'} value={lbRange(o.balancesDoorLb)} />
              </SpringDetails>
            </View>
          ))}
          {result.options.length === 8 ? <Text style={styles.note}>Showing the 8 lightest.</Text> : null}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  note: { fontSize: 17, color: colors.text, lineHeight: 24 },
  divider: { borderTopWidth: 2, borderTopColor: colors.border, paddingTop: 10 },
  optionNumber: { fontSize: 16, fontWeight: '900', color: colors.muted, letterSpacing: 1 },
});
