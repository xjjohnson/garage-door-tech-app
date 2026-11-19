import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { Icon } from './Icon';
import { colors, radius, shadow, bw, fs, sp } from '../theme';

export type ChipTone = 'plain' | 'on' | 'warn';

/**
 * The one card of the 0.9 look, used for a visit on Today and a job on Jobs:
 * time (or job number) with a status chip, the customer, the address, then a
 * footer line with what the work is and a weather or money note.
 */
export function VisitCard({
  top,
  chip,
  tone = 'plain',
  name,
  address,
  what,
  note,
  weather,
  weatherTestID,
  warn,
  next,
  muted,
  onPress,
  testID,
  children,
}: {
  top: string;
  chip: string;
  tone?: ChipTone;
  name: string;
  address?: string;
  what?: string;
  /** Plain text on the right of the footer, e.g. "$612 quoted". */
  note?: string;
  /** A weather line, with the sun icon in front. */
  weather?: string;
  weatherTestID?: string;
  warn?: boolean;
  /** The next visit of the day gets an accent outline. */
  next?: boolean;
  /** Done visits are a little quieter. */
  muted?: boolean;
  onPress: () => void;
  testID?: string;
  children?: ReactNode;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.card, next && styles.next, muted && styles.muted, pressed && styles.pressed]}>
      <View style={styles.top}>
        <Text style={styles.time}>{top}</Text>
        <Text style={[styles.chip, tone === 'on' && styles.chipOn, tone === 'warn' && styles.chipWarn]}>{chip.toUpperCase()}</Text>
      </View>
      <Text style={styles.name}>{name}</Text>
      {address ? <Text style={styles.address}>{address}</Text> : null}
      {what || weather || note ? (
        <View style={styles.foot}>
          {what ? <Text style={styles.footText}>{what}</Text> : null}
          {weather ? (
            <View style={styles.wx}>
              <Icon name="sun" size={14} color={warn ? colors.stop : colors.muted} />
              <Text style={[styles.footText, warn && styles.warn]} testID={weatherTestID}>
                {weather}
              </Text>
            </View>
          ) : null}
          {note ? <Text style={styles.footText}>{note}</Text> : null}
        </View>
      ) : null}
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: bw(1), borderColor: colors.line, padding: sp(14), gap: sp(2), ...shadow },
  next: { borderColor: colors.selected, borderWidth: bw(1.5) },
  muted: { opacity: 0.8 },
  pressed: { backgroundColor: colors.info },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: sp(8) },
  time: { flex: 1, fontSize: fs(19), fontWeight: '800', color: colors.text },
  chip: { fontSize: fs(13), fontWeight: '800', letterSpacing: 0.5, color: colors.selected, backgroundColor: colors.info, paddingHorizontal: sp(11), paddingVertical: sp(5), borderRadius: radius.pill, overflow: 'hidden' },
  chipOn: { backgroundColor: colors.selected, color: colors.onSelected },
  chipWarn: { backgroundColor: colors.warnBg, color: colors.warn },
  name: { fontSize: fs(20), fontWeight: '800', color: colors.text, marginTop: sp(6) },
  address: { fontSize: fs(16), fontWeight: '600', color: colors.muted },
  foot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: sp(12), rowGap: sp(2), marginTop: sp(8) },
  footText: { fontSize: fs(15), fontWeight: '600', color: colors.muted },
  wx: { flexDirection: 'row', alignItems: 'center', gap: sp(4) },
  warn: { color: colors.stop, fontWeight: '800' },
});
