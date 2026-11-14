import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { ChipOption, ChipRow, Field, MeasureField } from '../components/controls';
import { Card, Warnings } from '../components/results';
import { formatFeetInches, parseMeasurement } from '../lib/measure';
import { usePersistentForm } from '../lib/usePersistentForm';
import { DOOR_CONSTRUCTIONS, DoorConstruction, DoorWeightEstimate, estimateDoorWeight } from '../springCalc';
import { colors, type } from '../theme';

export interface DoorWeightForm {
  width: string;
  widthOther: string;
  height: string;
  heightOther: string;
  construction: DoorConstruction;
  windows: boolean;
}

export const DEFAULT_DOOR_WEIGHT_FORM: DoorWeightForm = { width: '192', widthOther: '', height: '84', heightOther: '', construction: 'steel-insulated', windows: false };
export const DOOR_WEIGHT_STORAGE_KEY = 'door-weight/form/v1';

const WIDTHS: ChipOption<string>[] = [
  { label: "8'", value: '96' },
  { label: "9'", value: '108' },
  { label: "10'", value: '120' },
  { label: "16'", value: '192' },
  { label: "18'", value: '216' },
  { label: 'Other', value: 'other' },
];
const HEIGHTS: ChipOption<string>[] = [
  { label: "7'", value: '84' },
  { label: "8'", value: '96' },
  { label: 'Other', value: 'other' },
];
const BUILDS: ChipOption<DoorConstruction>[] = DOOR_CONSTRUCTIONS.map((c) => ({ label: c.label, value: c.id, sub: c.detail }));
const WINDOWS: ChipOption<string>[] = [
  { label: 'No windows', value: 'no' },
  { label: 'Windows', value: 'yes' },
];

export function runDoorWeight(form: DoorWeightForm): { estimate?: DoorWeightEstimate; error?: string } {
  const widthIn = parseMeasurement(form.width === 'other' ? form.widthOther : form.width);
  const heightIn = parseMeasurement(form.height === 'other' ? form.heightOther : form.height);
  if (widthIn === undefined || heightIn === undefined) return { error: 'Enter the door width and height.' };
  try {
    return { estimate: estimateDoorWeight({ widthIn, heightIn, construction: form.construction, windows: form.windows }) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Check the size.' };
  }
}

/** A rough weight for quoting before the door is on the scale. It never fills the spring calculator. */
export function DoorWeightScreen() {
  const { form, update } = usePersistentForm<DoorWeightForm>(DOOR_WEIGHT_STORAGE_KEY, DEFAULT_DOOR_WEIGHT_FORM);
  const { estimate, error } = useMemo(() => runDoorWeight(form), [form]);
  const wOther = parseMeasurement(form.widthOther);
  const hOther = parseMeasurement(form.heightOther);

  return (
    <View style={styles.stack} testID="door-weight">
      <View style={styles.banner} accessibilityRole="alert">
        <Text style={styles.bannerTitle}>ESTIMATE</Text>
        <Text style={styles.bannerText}>For quoting only. Order springs from the door's weight on a scale.</Text>
      </View>
      <Field label="Width">
        <ChipRow options={WIDTHS} value={form.width} onChange={(width) => update({ width })} testID="dw-width" />
      </Field>
      {form.width === 'other' ? (
        <MeasureField label="Width in inches" value={form.widthOther} onChange={(widthOther) => update({ widthOther })} unit="in" below={wOther !== undefined ? `= ${formatFeetInches(wOther)}` : undefined} testID="field-dw-width" />
      ) : null}
      <Field label="Height">
        <ChipRow options={HEIGHTS} value={form.height} onChange={(height) => update({ height })} testID="dw-height" />
      </Field>
      {form.height === 'other' ? (
        <MeasureField label="Height in inches" value={form.heightOther} onChange={(heightOther) => update({ heightOther })} unit="in" below={hOther !== undefined ? `= ${formatFeetInches(hOther)}` : undefined} testID="field-dw-height" />
      ) : null}
      <Field label="How it's built">
        <ChipRow options={BUILDS} value={form.construction} onChange={(construction) => update({ construction })} testID="dw-build" />
      </Field>
      <Field label="Windows">
        <ChipRow options={WINDOWS} value={form.windows ? 'yes' : 'no'} onChange={(v) => update({ windows: v === 'yes' })} testID="dw-windows" />
      </Field>

      {error ? <Warnings warnings={[{ level: 'stop', message: error }]} /> : null}
      {estimate ? (
        <>
          <Card title="About" testID="dw-result">
            <Text style={styles.big}>{estimate.lowLb === estimate.highLb ? `${estimate.lowLb} lb` : `${estimate.lowLb}–${estimate.highLb} lb`}</Text>
            <Text style={styles.note}>Source: {estimate.construction.source}.</Text>
          </Card>
          <Warnings warnings={estimate.warnings} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  banner: { backgroundColor: colors.caution, borderWidth: 3, borderColor: colors.border, borderRadius: 10, padding: 12, gap: 4 },
  bannerTitle: { fontSize: type.body, fontWeight: '900', color: colors.text },
  bannerText: { fontSize: 17, fontWeight: '700', color: colors.text, lineHeight: 24 },
  big: { fontSize: type.big, fontWeight: '900', color: colors.text },
  note: { fontSize: 16, color: colors.muted, lineHeight: 22 },
});
