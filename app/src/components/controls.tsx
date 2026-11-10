import { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
  testID?: string;
  compact?: boolean;
}) {
  return (
    <View style={styles.chips} testID={testID} accessibilityRole="radiogroup">
      {options.map((o) => (
        <Chip key={String(o.value)} option={o} selected={o.value === value} onPress={() => onChange(o.value)} role="radio" compact={compact} />
      ))}
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

function Chip<T>({ option, selected, onPress, role, compact }: { option: ChipOption<T>; selected: boolean; onPress: () => void; role: 'radio' | 'checkbox'; compact?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected } : { checked: selected }}
      accessibilityLabel={option.sub ? `${option.label}, ${option.sub}` : option.label}
      style={({ pressed }) => [styles.chip, compact && styles.chipCompact, selected && styles.chipOn, pressed && !selected && styles.chipPressed]}
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

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function TextButton({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.textButton, pressed && styles.chipPressed]}>
      <Text style={styles.textButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  hint: { fontSize: 16, color: colors.muted },
  section: { fontSize: type.value, fontWeight: '900', color: colors.text, marginTop: 8 },
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
  chipOn: { backgroundColor: colors.selected },
  chipPressed: { backgroundColor: colors.safety },
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
  textButtonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
});
