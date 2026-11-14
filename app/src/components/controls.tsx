import { ReactNode, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { colors, touch, type } from '../theme';
import { Keypad } from './Keypad';

/** A labelled group of inputs. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

export interface ChipOption<T> {
  label: string;
  value: T;
  /** Extra line under the label, e.g. a wire's color code. */
  sub?: string;
}

/** One choice out of a few, as big buttons. */
export function ChipRow<T extends string | number>({
  options,
  value,
  onChange,
  testID,
  compact,
  scroll,
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
  testID?: string;
  compact?: boolean;
  /** One row that scrolls sideways, for long lists like makers. The cut-off chip at the edge shows there's more. */
  scroll?: boolean;
}) {
  const chips = options.map((o) => (
    <Chip key={String(o.value)} option={o} selected={o.value === value} onPress={() => onChange(o.value)} role="radio" compact={compact} inline={scroll} />
  ));
  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.chipScroll}
        contentContainerStyle={styles.chipScrollContent}
        testID={testID}
        accessibilityRole="radiogroup"
      >
        {chips}
      </ScrollView>
    );
  }
  return (
    <View style={styles.chips} testID={testID} accessibilityRole="radiogroup">
      {chips}
    </View>
  );
}

/** A few choices joined into one bar, for a filter or a mode rather than a measurement. */
export function Segmented<T extends string | number>({ options, value, onChange, testID }: { options: ChipOption<T>[]; value: T; onChange: (v: T) => void; testID?: string }) {
  return (
    <View style={styles.segments} testID={testID} accessibilityRole="radiogroup">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [styles.segment, i > 0 && styles.segmentDivider, on && styles.chipOn, pressed && !on && styles.chipPressed]}
          >
            <Text style={[styles.segmentText, on && styles.chipTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Any number of choices, as big toggle buttons. */
export function MultiChipRow<T extends string | number>({
  options,
  values,
  onChange,
  testID,
}: {
  options: ChipOption<T>[];
  values: T[];
  onChange: (v: T[]) => void;
  testID?: string;
}) {
  return (
    <View style={styles.chips} testID={testID}>
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <Chip
            key={String(o.value)}
            option={o}
            selected={on}
            role="checkbox"
            onPress={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])}
          />
        );
      })}
    </View>
  );
}

function Chip<T>({
  option,
  selected,
  onPress,
  role,
  compact,
  inline,
}: {
  option: ChipOption<T>;
  selected: boolean;
  onPress: () => void;
  role: 'radio' | 'checkbox';
  compact?: boolean;
  inline?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected } : { checked: selected }}
      accessibilityLabel={option.sub ? `${option.label}, ${option.sub}` : option.label}
      style={({ pressed }) => [styles.chip, compact && styles.chipCompact, inline && styles.chipInline, selected && styles.chipOn, pressed && !selected && styles.chipPressed]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{option.label}</Text>
      {option.sub ? <Text style={[styles.chipSub, selected && styles.chipTextOn]}>{option.sub}</Text> : null}
    </Pressable>
  );
}

/**
 * A number the tech enters on the big keypad. Shows what was typed, or a
 * prompt to tap when empty.
 */
export function MeasureField({
  label,
  value,
  onChange,
  unit,
  hint,
  keypadHint,
  allowFraction = true,
  allowDecimal = true,
  placeholder = 'Tap to enter',
  testID,
  below,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  hint?: string;
  keypadHint?: string;
  allowFraction?: boolean;
  allowDecimal?: boolean;
  placeholder?: string;
  testID?: string;
  /** Small text under the box, e.g. the entry converted to feet. */
  below?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value === '' ? 'not entered' : `${value} ${unit}`}`}
        testID={testID}
        style={({ pressed }) => [styles.measure, pressed && styles.chipPressed]}
      >
        <Text style={[styles.measureText, value === '' && styles.placeholder]}>{value === '' ? placeholder : value}</Text>
        {value !== '' ? <Text style={styles.measureUnit}>{unit}</Text> : null}
      </Pressable>
      {below ? <Text style={styles.hint}>{below}</Text> : null}
      <Keypad
        visible={open}
        title={label}
        initial={value}
        unit={unit}
        hint={keypadHint ?? hint}
        allowFraction={allowFraction}
        allowDecimal={allowDecimal}
        onCancel={() => setOpen(false)}
        onDone={(v) => {
          setOpen(false);
          onChange(v);
        }}
      />
    </Field>
  );
}

/** Starts a group of fields. A heavy rule above it splits the long form into parts. */
export function SectionTitle({ children, first }: { children: ReactNode; first?: boolean }) {
  return (
    <Text style={[styles.section, first && styles.sectionFirst]} accessibilityRole="header">
      {children}
    </Text>
  );
}

const CONFIRM_MS = 4000;

/**
 * Clears every input, but only on a second tap within a few seconds, so a
 * gloved bump doesn't wipe a job's measurements.
 */
export function ClearButton({ onPress, testID }: { onPress: () => void; testID?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Pressable
      onPress={() => {
        if (armed) {
          setArmed(false);
          onPress();
        } else {
          setArmed(true);
        }
      }}
      accessibilityRole="button"
      accessibilityHint={armed ? 'Clears every input on this tab.' : 'Tap twice to clear every input on this tab.'}
      testID={testID}
      style={({ pressed }) => [styles.textButton, armed && styles.textButtonArmed, pressed && styles.chipPressed]}
    >
      {({ pressed }) => (
        <Text style={[styles.textButtonText, armed && !pressed && styles.textButtonTextArmed]}>{armed ? 'Tap again to clear all' : 'Clear all inputs'}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  hint: { fontSize: 16, color: colors.muted },
  section: { fontSize: type.value, fontWeight: '900', color: colors.text, marginTop: 14, paddingTop: 16, borderTopWidth: 3, borderTopColor: colors.border },
  sectionFirst: { marginTop: 0, paddingTop: 0, borderTopWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: touch.min,
    minWidth: 72,
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCompact: { minWidth: 76, flexBasis: '22%' },
  chipInline: { flexGrow: 0 },
  // Runs to the screen edges (the screen has 16 px padding) so the row visibly continues.
  chipScroll: { marginHorizontal: -16, flexGrow: 0 },
  chipScrollContent: { gap: 8, paddingHorizontal: 16 },
  segments: { flexDirection: 'row', borderWidth: 3, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' },
  segment: { flex: 1, minHeight: touch.min, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 4, backgroundColor: colors.bg },
  segmentDivider: { borderLeftWidth: 3, borderLeftColor: colors.border },
  segmentText: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'center' },
  chipOn: { backgroundColor: colors.selected },
  chipPressed: { backgroundColor: colors.info },
  chipText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  chipSub: { fontSize: 14, fontWeight: '600', color: colors.muted },
  chipTextOn: { color: colors.onSelected },
  measure: {
    minHeight: 64,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.border,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bg,
  },
  measureText: { fontSize: type.big, fontWeight: '800', color: colors.text },
  measureUnit: { fontSize: type.value, fontWeight: '700', color: colors.muted },
  placeholder: { fontSize: type.body, fontWeight: '600', color: colors.muted },
  textButton: { minHeight: touch.min, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  textButtonArmed: { backgroundColor: colors.stop, borderColor: colors.stop },
  textButtonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  textButtonTextArmed: { color: colors.onStop },
});
