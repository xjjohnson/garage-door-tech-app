import { useState } from 'react';
import { View } from 'react-native';
import { TextInput } from './AppText';
import { colors, touch, type, bw, rad, sp } from '../theme';
import { Action } from './Buttons';
import { makeStyles } from '../lib/makeStyles';

export const ETA_MINUTES = [10, 15, 30, 45, 60];

/** Whole minutes from what the tech typed, or undefined when it isn't a sensible number. */
export function parseMinutes(text: string): number | undefined {
  const n = Number.parseInt(text.trim(), 10);
  return Number.isFinite(n) && n > 0 && n <= 600 ? n : undefined;
}

/**
 * How many minutes away to say in a text: a few common choices plus Custom,
 * where the tech types any number. `testID` prefixes each button
 * (`<testID>-15`, `<testID>-custom`, `<testID>-custom-input`, `<testID>-custom-send`).
 */
export function EtaPicker({ onPick, testID, options = ETA_MINUTES }: { onPick: (minutes: number) => void; testID: string; options?: number[] }) {
  const styles = useStyles();
  const [custom, setCustom] = useState(false);
  const [text, setText] = useState('');
  const minutes = parseMinutes(text);
  return (
    <View style={styles.stack} testID={testID}>
      <View style={styles.row}>
        {options.map((m) => (
          <Action key={m} label={`${m} min`} grow onPress={() => onPick(m)} testID={`${testID}-${m}`} />
        ))}
        <Action label="Custom" grow onPress={() => setCustom((v) => !v)} testID={`${testID}-custom`} />
      </View>
      {custom ? (
        <View style={styles.row}>
          <TextInput value={text} onChangeText={setText} keyboardType="number-pad" placeholder="Minutes" placeholderTextColor={colors.muted} accessibilityLabel="Minutes away" style={styles.input} testID={`${testID}-custom-input`} />
          <Action label="Send" primary disabled={minutes === undefined} onPress={() => minutes !== undefined && onPick(minutes)} testID={`${testID}-custom-send`} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: sp(8) },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(8) },
  input: { flex: 1, minHeight: touch.min, borderRadius: rad(10), borderWidth: bw(1.5), borderColor: colors.border, paddingHorizontal: sp(14), fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.card },
}));
