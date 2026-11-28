import { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from './AppText';
import { Icon } from './Icon';
import type { RowStyle } from '../lib/themes';
import { colors, radius, shadow, bw, fs, sp, rad, touch } from '../theme';
import { makeStyles } from '../lib/makeStyles';

export type ChipTone = 'plain' | 'on' | 'warn';

/** The space between rows of a list: tight rows sit close, cards stay apart. */
export const rowGap = (v: RowStyle): number => (v === 'dense' || v === 'table' ? sp(4) : v === 'card' ? sp(12) : sp(8));

const toneColor = (tone: ChipTone) => (tone === 'on' ? colors.selected : tone === 'warn' ? colors.caution : colors.ok);

/** The head of a table of rows (Office Jobs). */
export function TableHead({ cols }: { cols: [string, string, string] }) {
  const styles = useStyles();
  return (
    <View style={styles.tHead}>
      <Text style={[styles.tHeadText, styles.tNo]}>{cols[0]}</Text>
      <Text style={[styles.tHeadText, styles.tMain]}>{cols[1]}</Text>
      <Text style={[styles.tHeadText, styles.tEnd]}>{cols[2]}</Text>
    </View>
  );
}

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
  variant = 'card',
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
  /** How the row is drawn; the theme picks it. Card is the original. */
  variant?: RowStyle;
}) {
  const styles = useStyles();
  const oneLine = [address, what, note].filter(Boolean).join(' · ');
  if (variant === 'dense') {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.dense, next && styles.next, muted && styles.muted, pressed && styles.pressed]}>
        <View style={[styles.dot, { backgroundColor: toneColor(tone) }]} />
        <View style={styles.denseText}>
          <Text style={styles.denseName} numberOfLines={1}>
            {top} · {name}
          </Text>
          {oneLine ? (
            <Text style={styles.denseSub} numberOfLines={1}>
              {oneLine}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.denseChip, tone === 'warn' && { color: colors.warn }]} numberOfLines={1}>
          {chip.toUpperCase()}
        </Text>
      </Pressable>
    );
  }
  if (variant === 'table') {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.tRow, pressed && styles.pressed]}>
        <Text style={[styles.tCell, styles.tNo, styles.tBold]} numberOfLines={1}>
          {top}
        </Text>
        <Text style={[styles.tCell, styles.tMain]} numberOfLines={1}>
          {address || name}
        </Text>
        <View style={[styles.dot, { backgroundColor: toneColor(tone) }]} />
        <Text style={[styles.tCell, styles.tEnd]} numberOfLines={1}>
          {note || chip}
        </Text>
      </Pressable>
    );
  }
  if (variant === 'edge' || variant === 'tile') {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        testID={testID}
        style={({ pressed }) => [variant === 'tile' ? styles.tile : styles.edge, variant === 'tile' ? { borderTopColor: toneColor(tone) } : { borderLeftColor: toneColor(tone) }, next && styles.next, muted && styles.muted, pressed && styles.pressed]}
      >
        <View style={styles.top}>
          <Text style={styles.edgeTop} numberOfLines={1}>
            {top}
          </Text>
          <Text style={[styles.edgeChip, tone === 'warn' && { color: colors.warn, backgroundColor: colors.warnBg }]}>{chip.toUpperCase()}</Text>
        </View>
        <Text style={styles.edgeName} numberOfLines={variant === 'tile' ? 3 : 1}>
          {name}
        </Text>
        {address ? (
          <Text style={styles.edgeSub} numberOfLines={variant === 'tile' ? 2 : 1}>
            {address}
          </Text>
        ) : null}
        {what || note || weather ? (
          <Text style={styles.edgeSub} numberOfLines={1}>
            {[what, note, weather].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {children}
      </Pressable>
    );
  }
  if (variant === 'big') {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={({ pressed }) => [styles.big, next && styles.next, muted && styles.muted, pressed && styles.pressed]}>
        <View style={styles.bigRow}>
          <View style={styles.denseText}>
            <Text style={styles.bigName}>{name}</Text>
            <Text style={styles.bigSub}>{[top, what, note].filter(Boolean).join(' · ')}</Text>
            {address ? <Text style={styles.bigSub}>{address}</Text> : null}
          </View>
          <Text style={styles.bigGo}>{chip === 'Done' ? 'Open' : next ? 'Go' : 'Open'}</Text>
        </View>
        {children}
      </Pressable>
    );
  }
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

const useStyles = makeStyles(() => ({
  dense: { flexDirection: 'row', alignItems: 'center', gap: sp(10), minHeight: touch.min + 6, paddingHorizontal: sp(12), paddingVertical: sp(6), borderRadius: rad(10), backgroundColor: colors.card, borderWidth: bw(1), borderColor: colors.line },
  dot: { width: 9, height: 9, borderRadius: 5 },
  denseText: { flex: 1, minWidth: 0 },
  denseName: { fontSize: fs(16), fontWeight: '800', color: colors.text },
  denseSub: { fontSize: fs(13), fontWeight: '600', color: colors.muted },
  denseChip: { fontSize: fs(12), fontWeight: '800', letterSpacing: 0.4, color: colors.muted, maxWidth: '34%', textAlign: 'right' },
  edge: { padding: sp(10), paddingLeft: sp(14), gap: sp(1), borderRadius: rad(12), borderLeftWidth: 4, backgroundColor: colors.card, borderWidth: bw(1), borderColor: colors.line },
  tile: { width: '48.5%', minHeight: sp(110), padding: sp(10), gap: sp(2), borderRadius: rad(12), borderTopWidth: 4, backgroundColor: colors.card, borderWidth: bw(1), borderColor: colors.line },
  edgeTop: { flex: 1, fontSize: fs(14), fontWeight: '800', color: colors.muted },
  edgeChip: { fontSize: fs(12), fontWeight: '800', letterSpacing: 0.4, color: colors.selected, backgroundColor: colors.info, paddingHorizontal: sp(8), paddingVertical: sp(3), borderRadius: radius.pill, overflow: 'hidden' },
  edgeName: { fontSize: fs(18), fontWeight: '800', color: colors.text },
  edgeSub: { fontSize: fs(14), fontWeight: '600', color: colors.muted },
  big: { minHeight: sp(92), padding: sp(14), borderRadius: rad(18), backgroundColor: colors.card, borderWidth: bw(1), borderColor: colors.line, ...shadow },
  bigRow: { flexDirection: 'row', alignItems: 'center', gap: sp(12) },
  bigName: { fontSize: fs(22), fontWeight: '800', color: colors.text },
  bigSub: { fontSize: fs(16), fontWeight: '600', color: colors.muted },
  bigGo: { minWidth: sp(76), textAlign: 'center', fontSize: fs(18), fontWeight: '800', color: colors.onSelected, backgroundColor: colors.selected, paddingVertical: sp(14), paddingHorizontal: sp(16), borderRadius: rad(16), overflow: 'hidden' },
  tHead: { flexDirection: 'row', alignItems: 'center', gap: sp(8), paddingHorizontal: sp(12), paddingVertical: sp(4) },
  tHeadText: { fontSize: fs(12), fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
  tRow: { flexDirection: 'row', alignItems: 'center', gap: sp(8), minHeight: touch.min, paddingHorizontal: sp(12), borderRadius: rad(6), backgroundColor: colors.card, borderWidth: bw(1), borderColor: colors.line },
  tCell: { fontSize: fs(14), fontWeight: '600', color: colors.text },
  tBold: { fontWeight: '800' },
  tNo: { width: '19%' },
  tMain: { flex: 1 },
  tEnd: { width: '26%', textAlign: 'right' },
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
}));
