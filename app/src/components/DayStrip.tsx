import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { colors, radius, shadow, bw, fs, sz, sp } from '../theme';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/**
 * Seven day chips, each with its weekday, date and how many visits it has
 * (a dash when none). Tap one to pick the day. Used on Home > Week.
 */
export function DayStrip({ days, counts, selected, onSelect, testID }: { days: number[]; counts: number[]; selected: number; onSelect: (day: number) => void; testID?: string }) {
  return (
    <View style={styles.row} testID={testID} accessibilityRole="radiogroup">
      {days.map((d, i) => {
        const on = d === selected;
        const date = new Date(d);
        const n = counts[i] ?? 0;
        return (
          <Pressable
            key={d}
            onPress={() => onSelect(d)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${DAYS[date.getDay()]} ${date.getDate()}, ${n === 0 ? 'no visits' : `${n} visit${n === 1 ? '' : 's'}`}`}
            testID={`day-${i}`}
            style={({ pressed }) => [styles.chip, on && styles.on, pressed && !on && styles.pressed]}
          >
            <Text style={[styles.dow, on && styles.onText]}>{DAYS[date.getDay()]}</Text>
            <Text style={[styles.date, on && styles.onText]}>{date.getDate()}</Text>
            <Text style={[styles.count, on && styles.onText]}>{n === 0 ? '–' : n}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: sp(5) },
  chip: { flex: 1, alignItems: 'center', paddingVertical: sp(8), borderRadius: radius.card - 2, backgroundColor: colors.card, borderWidth: bw(1), borderColor: colors.line, minHeight: sz(72), ...shadow },
  on: { backgroundColor: colors.selected, borderColor: colors.selected },
  pressed: { backgroundColor: colors.info },
  dow: { fontSize: fs(11), fontWeight: '800', letterSpacing: 0.4, color: colors.muted },
  date: { fontSize: fs(18), fontWeight: '800', color: colors.text },
  count: { fontSize: fs(13), fontWeight: '800', color: colors.selected },
  onText: { color: colors.onSelected },
});
