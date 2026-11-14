import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BarSummary, CalcLayout, waitingSummary } from '../components/CalcLayout';
import { ChipOption, ChipRow, ClearButton, Field, MeasureField, SectionTitle } from '../components/controls';
import { Card, ErrorCard, lbRange, MissingCard, SafetyBanner, springName, SpringDetails, UsesPerDay, Stat, Warnings } from '../components/results';
import { DEFAULT_MATCH_FORM, DRUM_CHOICES, HEIGHT_CHOICES, ID_CHOICES, MatchForm, Outcome, runMatch, WireMethod } from '../lib/forms';
import { formatFeetInches, formatInches, formatNumber, formatTurns, parseMeasurement } from '../lib/measure';
import { usePersistentForm } from '../lib/usePersistentForm';
import { OpenJobRequest } from '../lib/jobs';
import { SaveJobPanel } from '../components/SaveJobPanel';
import { TRACK_RADIUS_CHOICES, TRACK_RADIUS_HINT } from '../lib/forms';
import { MatchResult, Wind, WIRES } from '../springCalc';
import { colors, type } from '../theme';

const WIRE_METHODS: ChipOption<WireMethod>[] = [
  { label: '20 coils', value: 'twenty' },
  { label: 'Caliper', value: 'caliper' },
  { label: 'Pick size', value: 'size' },
];

const WIRE_OPTIONS: ChipOption<string>[] = WIRES.map((w) => ({ label: w.nominal, value: w.nominal, sub: w.color }));

const ID_OPTIONS: ChipOption<string>[] = [...ID_CHOICES.map((c) => ({ label: c.label, value: String(c.value) })), { label: 'Other', value: 'other' }];

const WIND_OPTIONS: ChipOption<Wind>[] = [
  { label: 'Left', value: 'left' },
  { label: 'Right', value: 'right' },
  { label: 'Not sure', value: 'unknown' },
];

const COUNT_OPTIONS: ChipOption<1 | 2>[] = [
  { label: 'One spring', value: 1 },
  { label: 'Pair', value: 2 },
];

export const MATCH_STORAGE_KEY = 'spring-calc/match-form/v1';

export function MatchScreen({ open }: { open?: OpenJobRequest }) {
  const { form, update, reset, replace } = usePersistentForm<MatchForm>(MATCH_STORAGE_KEY, DEFAULT_MATCH_FORM);
  const outcome = useMemo(() => runMatch(form), [form]);
  const summary = matchSummary(outcome);
  // The saved job these inputs came from, so changes can be saved back to it.
  const [linkedId, setLinkedId] = useState<string | undefined>();
  useEffect(() => {
    if (open?.job.mode !== 'match') return;
    replace(open.job.form);
    setLinkedId(open.job.id);
    // Only a new request loads; the nonce changes on every open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.nonce]);
  const heightOther = parseMeasurement(form.heightOther);

  const inputs = (
    <>
      <SectionTitle first>The old spring</SectionTitle>

      <Field label="Wire size, measured by">
        <ChipRow options={WIRE_METHODS} value={form.wireMethod} onChange={(wireMethod) => update({ wireMethod })} testID="wire-method" />
      </Field>
      {form.wireMethod === 'twenty' ? (
        <MeasureField
          label="Length of 20 coils"
          hint="Count 20 coils pushed tight together and measure across them with a tape."
          value={form.twentyCoil}
          onChange={(twentyCoil) => update({ twentyCoil })}
          unit="in"
          allowDecimal={false}
          testID="field-twenty"
        />
      ) : null}
      {form.wireMethod === 'caliper' ? (
        <MeasureField
          label="Wire diameter (caliper)"
          hint="Measure the wire itself, not the coil, e.g. .225"
          value={form.caliper}
          onChange={(caliper) => update({ caliper })}
          unit="in"
          allowFraction={false}
          testID="field-caliper"
        />
      ) : null}
      {form.wireMethod === 'size' ? (
        <Field label="Wire size" hint="From the cone stamp, the tag or the color code.">
          <ChipRow options={WIRE_OPTIONS} value={form.wireSize} onChange={(wireSize) => update({ wireSize })} compact testID="wire-size" />
        </Field>
      ) : null}

      <Field label="Inside diameter">
        <ChipRow options={ID_OPTIONS} value={form.idChoice} onChange={(idChoice) => update({ idChoice })} testID="id" />
      </Field>
      {form.idChoice === 'other' ? (
        <MeasureField label="Inside diameter" value={form.idOther} onChange={(idOther) => update({ idOther })} unit="in" testID="field-id-other" />
      ) : null}

      <MeasureField
        label="Spring length (relaxed)"
        hint="The coils only, unwound. Don't include the cones."
        value={form.length}
        onChange={(length) => update({ length })}
        unit="in"
        testID="field-length"
      />

      <Field label="Wind">
        <ChipRow options={WIND_OPTIONS} value={form.wind} onChange={(wind) => update({ wind })} testID="wind" />
      </Field>
      <Field label="Springs on the door">
        <ChipRow options={COUNT_OPTIONS} value={form.springCount} onChange={(springCount) => update({ springCount })} testID="count" />
      </Field>

      <SectionTitle>The door</SectionTitle>
      <Field label="Door height">
        <ChipRow options={[...HEIGHT_CHOICES]} value={form.heightChoice} onChange={(heightChoice) => update({ heightChoice })} testID="height" />
      </Field>
      {form.heightChoice === 'other' ? (
        <MeasureField
          label="Door height in inches"
          value={form.heightOther}
          onChange={(h) => update({ heightOther: h })}
          unit="in"
          below={heightOther !== undefined ? `= ${formatFeetInches(heightOther)}` : "7' = 84, 8' = 96"}
          testID="field-height-other"
        />
      ) : null}
      <Field label="Drums (standard lift)">
        <ChipRow options={DRUM_CHOICES} value={form.drum} onChange={(drum) => update({ drum })} testID="drum" />
      </Field>
      <Field label="Track radius" hint={TRACK_RADIUS_HINT}>
        <ChipRow options={TRACK_RADIUS_CHOICES} value={form.trackRadius} onChange={(trackRadius) => update({ trackRadius })} testID="track" />
      </Field>
      <MeasureField
        label="Free shaft beside the spring (optional)"
        hint="Leaves out springs that would be too long once wound."
        value={form.shaft}
        onChange={(shaft) => update({ shaft })}
        unit="in"
        testID="field-shaft"
      />
      <MeasureField
        label="Floor to shaft center (optional)"
        hint="Measure to the middle of the torsion shaft to get the cable length."
        value={form.shaftHeight}
        onChange={(shaftHeight) => update({ shaftHeight })}
        unit="in"
        testID="field-shaft-height"
      />
      <ClearButton
        onPress={() => {
          reset();
          setLinkedId(undefined);
        }} testID="clear-match" />
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
      {outcome.status === 'ok' ? <MatchResults result={outcome.result} /> : null}
      <SaveJobPanel
        inputs={{ mode: 'match', form }}
        summary={summary}
        ready={outcome.status !== 'incomplete'}
        linkedId={linkedId}
        onLink={setLinkedId}
        testID="match-save-job"
      />
    </>
  );

  return <CalcLayout inputs={inputs} results={results} summary={summary} testID="match-bar" />;
}

/** What the pinned bar says: what's missing, the stop, or the old spring and its turns. */
export function matchSummary(outcome: Outcome<MatchResult>): BarSummary {
  if (outcome.status === 'incomplete') return waitingSummary(outcome.missing);
  if (outcome.status === 'error') return { tone: 'stop', title: 'STOP', detail: outcome.message };
  const r = outcome.result;
  const stop = r.warnings.find((w) => w.level === 'stop');
  if (stop) return { tone: 'stop', title: 'STOP', detail: stop.message };
  const checks = r.warnings.filter((w) => w.level === 'caution').length;
  // The spring count leads, because "Pair" is the default and a skipped answer changes every figure.
  const count = r.springCount === 2 ? 'Pair' : 'One spring';
  const detail = [count, `Wind ${formatTurns(r.turns)} turns`, checks > 0 ? `${checks} caution${checks === 1 ? '' : 's'}` : 'see replacements'].join(' · ');
  return { tone: 'ok', title: springName(r.old), detail };
}

function orderNote(result: MatchResult): string {
  if (result.springCount === 2) return 'Order one left-wound and one right-wound spring.';
  if (result.old.wind === 'unknown') return 'Order the same wind as the old spring.';
  return `Order a ${result.old.wind}-wound spring.`;
}

function MatchResults({ result }: { result: MatchResult }) {
  const stopped = result.warnings.some((w) => w.level === 'stop');
  const each = result.springCount === 2 ? ' (pair)' : '';
  return (
    <View style={styles.stack} testID="match-results">

      <Card title="Old spring" testID="card-old">
        <SpringDetails spec={result.old} />
        <Stat label="Turns to wind" value={formatTurns(result.turns)} />
        <Stat label={`Balances a door of${each}`} value={lbRange(result.balancesDoorLb)} />
        <Stat label="Total rate" value={`${result.totalIppt.toFixed(1)} IPPT`} />
        {result.cableLengthIn !== undefined ? <Stat label="Cable length (each)" value={formatInches(result.cableLengthIn, 8)} /> : null}
      </Card>

      {stopped ? (
        <Text style={styles.stopNote} testID="stop-note">
          Replacement options are hidden until the STOP item above is fixed.
        </Text>
      ) : (
        <>
          <Card title="Equal replacement" testID="card-equal">
            <Text style={styles.note}>Same rate in other stocked sizes. {orderNote(result)}</Text>
            {result.equivalents.length === 0 ? (
              <Text style={styles.note}>No equal spring in the stocked sizes. Order the same size as the old one.</Text>
            ) : (
              result.equivalents.map((s, i) => (
                <View key={i} style={i > 0 ? styles.divider : undefined}>
                  <SpringDetails spec={s} />
                </View>
              ))
            )}
          </Card>

          <Card title="Longer life" testID="card-upgrade">
            {result.upgrades.length === 0 ? (
              <Text style={styles.note}>No heavier-wire upgrade fits. The old spring may already be rated past 50,000 cycles, or the shaft is too short.</Text>
            ) : (
              result.upgrades.map((u, i) => (
                <View key={u.targetCycles} style={i > 0 ? styles.divider : undefined}>
                  <Text style={styles.upgradeTarget}>For {formatNumber(u.targetCycles)}+ cycles</Text>
                  <SpringDetails spec={u.spring} />
                </View>
              ))
            )}
          </Card>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  note: { fontSize: 17, color: colors.text, lineHeight: 24 },
  stopNote: { fontSize: type.body, fontWeight: '800', color: colors.stop },
  divider: { borderTopWidth: 2, borderTopColor: colors.border, paddingTop: 10 },
  upgradeTarget: { fontSize: type.body, fontWeight: '900', color: colors.text },
});
