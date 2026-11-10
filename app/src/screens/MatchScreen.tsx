import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChipOption, ChipRow, Field, MeasureField, SectionTitle, TextButton } from '../components/controls';
import { Card, ErrorCard, lbRange, MissingCard, SafetyBanner, SpringDetails, Stat, Warnings } from '../components/results';
import { DEFAULT_MATCH_FORM, DRUM_CHOICES, HEIGHT_CHOICES, ID_CHOICES, MatchForm, runMatch, WireMethod } from '../lib/forms';
import { formatFeetInches, formatNumber, formatTurns, parseMeasurement } from '../lib/measure';
import { usePersistentForm } from '../lib/usePersistentForm';
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

export function MatchScreen() {
  const { form, update, reset } = usePersistentForm<MatchForm>(MATCH_STORAGE_KEY, DEFAULT_MATCH_FORM);
  const outcome = useMemo(() => runMatch(form), [form]);
  const heightOther = parseMeasurement(form.heightOther);

  return (
    <View style={styles.stack}>
      <SectionTitle>The old spring</SectionTitle>

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
      <MeasureField
        label="Free shaft beside the spring (optional)"
        hint="Leaves out springs that would be too long once wound."
        value={form.shaft}
        onChange={(shaft) => update({ shaft })}
        unit="in"
        testID="field-shaft"
      />
      <TextButton label="Clear all inputs" onPress={reset} testID="clear-match" />

      <SectionTitle>Results</SectionTitle>
      <SafetyBanner />
      {outcome.status === 'incomplete' ? <MissingCard missing={outcome.missing} /> : null}
      {outcome.status === 'error' ? <ErrorCard message={outcome.message} /> : null}
      {outcome.status === 'ok' ? <MatchResults result={outcome.result} /> : null}
    </View>
  );
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
      <Warnings warnings={result.warnings} />

      <Card title="Old spring" testID="card-old">
        <SpringDetails spec={result.old} />
        <Stat label="Turns to wind" value={formatTurns(result.turns)} />
        <Stat label={`Balances a door of${each}`} value={lbRange(result.balancesDoorLb)} />
        <Stat label="Total rate" value={`${result.totalIppt.toFixed(1)} IPPT`} />
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
