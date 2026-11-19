import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { Icon } from './Icon';
import { startOfDay } from '../lib/schedule';
import { colors, radius, shadow, bw, fs, rad } from '../theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The cells of the month shown: blanks before the 1st, then each day's start. */
export function monthCells(shown: number): (number | null)[] {
  const d = new Date(shown);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let n = 0; n < last; n++) cells.push(new Date(d.getFullYear(), d.getMonth(), 1 + n).getTime());
  return cells;
}

/**
 * A month with a dot under every day that has visits. Tap a day to pick it,
 * the arrows move a month. Used on the Schedule page.
 */
export function MonthCalendar({ shown, selected, today, counts, onSelect, onMonth, testID }: { shown: number; selected: number; today: number; counts: Record<number, number>; onSelect: (day: number) => void; onMonth: (delta: number) => void; testID?: string }) {
  const d = new Date(shown);
  const cells = monthCells(shown);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.head}>
        <Pressable onPress={() => onMonth(-1)} accessibilityRole="button" accessibilityLabel="Previous month" testID="month-prev" style={styles.arrow}>
          <View style={styles.flip}>
            <Icon name="chevron" size={20} color={colors.text} />
          </View>
        </Pressable>
        <Text style={styles.title} testID="month-title">
          {MONTHS[d.getMonth()]} {d.getFullYear()}
        </Text>
        <Pressable onPress={() => onMonth(1)} accessibilityRole="button" accessibilityLabel="Next month" testID="month-next" style={styles.arrow}>
          <Icon name="chevron" size={20} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.week}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
          <Text key={i} style={styles.dow}>
            {w}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={styles.week}>
          {Array.from({ length: 7 }, (_, i) => {
            const day = r[i] ?? null;
            if (day === null) return <View key={i} style={styles.cell} />;
            const on = day === selected;
            const n = counts[startOfDay(day)] ?? 0;
            return (
              <Pressable
                key={i}
                onPress={() => onSelect(day)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${MONTHS[new Date(day).getMonth()]} ${new Date(day).getDate()}, ${n === 0 ? 'no visits' : `${n} visit${n === 1 ? '' : 's'}`}`}
                testID={`cal-${new Date(day).getDate()}`}
                style={[styles.cell, on && styles.on, !on && day === today && styles.todayRing]}
              >
                <Text style={[styles.num, on && styles.onText]}>{new Date(day).getDate()}</Text>
                <View style={[styles.dot, n > 0 && (on ? styles.dotOn : styles.dotShown)]} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Day starts for a month's dot counts, from a list of visit times. */
export function visitCounts(starts: number[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const s of starts) {
    const k = startOfDay(s);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: bw(1), borderColor: colors.line, padding: 10, gap: 2, ...shadow },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4 },
  title: { fontSize: fs(17), fontWeight: '800', color: colors.text },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  flip: { transform: [{ scaleX: -1 }] },
  week: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center', fontSize: fs(12), fontWeight: '800', color: colors.muted, paddingBottom: 2 },
  cell: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: rad(12) },
  on: { backgroundColor: colors.selected },
  todayRing: { borderWidth: bw(1.5), borderColor: colors.selected },
  num: { fontSize: fs(16), fontWeight: '700', color: colors.text },
  onText: { color: colors.onSelected, fontWeight: '800' },
  dot: { width: 5, height: 5, borderRadius: rad(3), marginTop: 2, backgroundColor: 'transparent' },
  dotShown: { backgroundColor: colors.selected },
  dotOn: { backgroundColor: colors.onSelected },
});
