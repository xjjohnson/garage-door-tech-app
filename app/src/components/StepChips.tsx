import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { colors, radius } from '../theme';

export const STATUS_STEPS = ['On my way', 'Arrived', 'Work done', 'Paid'] as const;

/**
 * The four status steps of a visit in a row: finished ones are grey, the one
 * to do now is solid green, later ones are a light tint. Display only; the
 * visit card around it opens the job where the steps are tapped.
 */
export function StepChips({ done, testID }: { done: boolean[]; testID?: string }) {
  const current = done.findIndex((d) => !d);
  return (
    <View style={styles.row} testID={testID}>
      {STATUS_STEPS.map((label, i) => {
        const finished = !!done[i];
        const cur = i === current;
        return (
          <View key={label} style={[styles.chip, finished && styles.done, cur && styles.cur]} accessible accessibilityLabel={`${label}, ${finished ? 'done' : cur ? 'next' : 'later'}`}>
            <Text style={[styles.text, finished && styles.doneText, cur && styles.curText]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, marginTop: 10 },
  chip: { flex: 1, minHeight: 44, borderRadius: radius.card - 6, backgroundColor: colors.info, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  done: { backgroundColor: colors.line },
  cur: { backgroundColor: colors.selected },
  text: { fontSize: 12.5, fontWeight: '800', textAlign: 'center', color: colors.selected },
  doneText: { color: colors.muted, fontWeight: '700' },
  curText: { color: colors.onSelected },
});
