import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { useBadges } from '../lib/useBadges';
import { fs, sp } from '../theme';

/** Four counts across the top of the dispatcher's Today: red for not assigned and late, amber for no time and double booked. Tap one to open Needs you. */
export function DispatchChips() {
  const { dispatch: d } = useBadges();
  const chips = [
    { id: 'unassigned', label: 'Not assigned', n: d.unassigned, red: true },
    { id: 'late', label: 'Late', n: d.late, red: true },
    { id: 'notime', label: 'No time', n: d.noTime, red: false },
    { id: 'double', label: 'Double', n: d.double, red: false },
  ];
  return (
    <View style={styles.row} testID="dispatch-chips">
      {chips.map((c) => {
        const on = c.n > 0;
        return (
          <Pressable key={c.id} onPress={() => router.navigate('/needs')} accessibilityRole="button" accessibilityLabel={`${c.n} ${c.label}`} testID={`dispatch-chip-${c.id}`} style={[styles.chip, on && (c.red ? styles.red : styles.amber)]}>
            <Text style={[styles.n, on && (c.red ? styles.redText : styles.amberText)]}>{c.n}</Text>
            <Text style={[styles.label, on && (c.red ? styles.redText : styles.amberText)]} numberOfLines={1}>{c.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: sp(6), paddingHorizontal: sp(12), paddingTop: sp(6) },
  chip: { flex: 1, borderRadius: 10, paddingVertical: sp(6), alignItems: 'center', backgroundColor: 'rgba(128,128,128,0.12)' },
  red: { backgroundColor: '#FDE4E4' },
  amber: { backgroundColor: '#FDF0D6' },
  n: { fontSize: fs(22), fontWeight: '800', color: '#667' },
  label: { fontSize: fs(11), fontWeight: '700', color: '#667' },
  redText: { color: '#B3202A' },
  amberText: { color: '#8A5A00' },
});
