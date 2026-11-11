import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { applyKey, EIGHTHS, KeypadKey, SIXTEENTHS } from '../lib/measure';
import { colors, touch, type } from '../theme';

interface Props {
  visible: boolean;
  title: string;
  initial: string;
  unit: string;
  hint?: string;
  allowFraction: boolean;
  allowDecimal: boolean;
  onDone: (value: string) => void;
  onCancel: () => void;
}

const DIGIT_ROWS: KeypadKey[][] = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['.', '0', 'back'],
];

/**
 * Big-button number pad with fraction keys. Used instead of the phone's own
 * keyboard because that one has no fractions and its keys are too small for
 * gloves.
 */
export function Keypad({ visible, title, initial, unit, hint, allowFraction, allowDecimal, onDone, onCancel }: Props) {
  const [entry, setEntry] = useState(initial);
  const [sixteenths, setSixteenths] = useState(false);
  useEffect(() => {
    if (visible) {
      setEntry(initial);
      setSixteenths(false);
    }
  }, [visible, initial]);
  const fractions: readonly string[] = sixteenths ? SIXTEENTHS : EIGHTHS;

  const press = (key: KeypadKey) => setEntry((e) => applyKey(e, key, { allowFraction, allowDecimal }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onCancel} accessibilityLabel="Cancel" />
        <View style={styles.sheet} testID="keypad">
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onCancel} style={styles.cancel} accessibilityRole="button" testID="keypad-cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
          <View style={styles.display}>
            <Text style={styles.displayText} testID="keypad-display">
              {entry === '' ? ' ' : entry}
            </Text>
            <Text style={styles.unit}>{unit}</Text>
          </View>

          {allowFraction ? (
            <View style={styles.fractions}>
              {fractions.map((f) => (
                <Key key={f} label={f} onPress={() => press(f as KeypadKey)} small testID={`key-${f}`} />
              ))}
              {fractions.length % 4 !== 0 ? <View style={styles.fractionBlank} /> : null}
            </View>
          ) : null}

          {DIGIT_ROWS.map((row, i) => (
            <View style={styles.row} key={i}>
              {row.map((k) =>
                k === '.' && !allowDecimal ? (
                  <View key={k} style={styles.blank} />
                ) : (
                  <Key key={k} label={k === 'back' ? '⌫' : k} onPress={() => press(k)} testID={`key-${k}`} a11y={k === 'back' ? 'Delete' : k} />
                ),
              )}
            </View>
          ))}

          <View style={styles.row}>
            <Key label="Clear" onPress={() => press('clear')} testID="key-clear" word />
            {allowFraction ? (
              <Key
                label={sixteenths ? '8ths' : '16ths'}
                a11y={sixteenths ? 'Show eighths' : 'Show sixteenths'}
                onPress={() => setSixteenths((v) => !v)}
                testID="key-toggle-16ths"
                word
              />
            ) : null}
            <Pressable
              style={({ pressed }) => [styles.key, styles.done, pressed && styles.pressed]}
              onPress={() => onDone(entry)}
              accessibilityRole="button"
              testID="keypad-done"
            >
              <Text style={[styles.keyText, styles.doneText]}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** small: a fraction key. word: a key labelled with a word, set smaller so it fits a narrow phone. */
function Key({ label, onPress, small, word, testID, a11y }: { label: string; onPress: () => void; small?: boolean; word?: boolean; testID?: string; a11y?: string }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.key, small && styles.fractionKey, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      testID={testID}
    >
      <Text style={[styles.keyText, (small || word) && styles.fractionText]} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
  sheet: { backgroundColor: colors.bg, padding: 12, paddingBottom: 28, borderTopLeftRadius: 16, borderTopRightRadius: 16, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: type.value, fontWeight: '800', color: colors.text, flex: 1 },
  cancel: { minHeight: touch.min, minWidth: 96, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: type.body, fontWeight: '700', color: colors.text, textDecorationLine: 'underline' },
  hint: { fontSize: 16, color: colors.muted },
  display: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    borderWidth: 3,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 72,
    gap: 8,
  },
  displayText: { fontSize: type.huge, fontWeight: '800', color: colors.text },
  unit: { fontSize: type.value, fontWeight: '700', color: colors.muted },
  fractions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  key: {
    flex: 1,
    flexBasis: 0,
    minHeight: 60,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fractionKey: { flexBasis: '22%', flexGrow: 1, minHeight: touch.min },
  blank: { flex: 1 },
  fractionBlank: { flexBasis: '22%', flexGrow: 1 },
  pressed: { backgroundColor: colors.safety },
  keyText: { fontSize: type.big, fontWeight: '800', color: colors.text },
  fractionText: { fontSize: type.value },
  done: { backgroundColor: colors.selected, flex: 2 },
  doneText: { color: colors.onSelected },
});
