import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { Icon, IconName } from './Icon';
import { colors, radius, shadow, touch, type, bw, fs, sp } from '../theme';

/** A big button. `primary` is the Johnsons green, for the one main action on a screen. */
export function Action({ label, onPress, primary, grow, disabled, testID, hint }: { label: string; onPress: () => void; primary?: boolean; grow?: boolean; disabled?: boolean; testID?: string; hint?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityHint={hint}
      testID={testID}
      style={({ pressed }) => [styles.button, grow && styles.grow, primary && styles.primary, disabled && styles.off, pressed && styles.pressed]}
    >
      {({ pressed }) => <Text style={[styles.buttonText, primary && !pressed && styles.primaryText]}>{label}</Text>}
    </Pressable>
  );
}

/** A row that opens another page: a label, a detail line and a chevron. */
export function NavRow({ label, detail, href, onPress, testID, badge }: { label: string; detail?: string; href?: Href; onPress?: () => void; testID?: string; badge?: string }) {
  return (
    <Pressable
      onPress={onPress ?? (() => href && router.push(href))}
      accessibilityRole="button"
      accessibilityHint={detail}
      testID={testID}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.buttonText, styles.left]}>{label}</Text>
        {detail ? <Text style={styles.meta}>{detail}</Text> : null}
      </View>
      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

/** A card tile with an icon and its name under it: Call, Text, ETA, Directions, Go. */
export function QuickAction({ icon, label, onPress, testID }: { icon: IconName; label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} style={({ pressed }) => [styles.quick, pressed && styles.pressed]}>
      <Icon name={icon} color={colors.selected} />
      <Text style={styles.quickText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  quick: { flex: 1, minHeight: touch.min, alignItems: 'center', justifyContent: 'center', gap: sp(4), paddingVertical: sp(10), borderRadius: radius.card, backgroundColor: colors.card, borderWidth: bw(1), borderColor: colors.line, ...shadow },
  quickText: { fontSize: fs(14), fontWeight: '800', color: colors.text },
  grow: { flex: 1 },
  button: { minHeight: touch.min, borderRadius: radius.field, borderWidth: bw(1.5), borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(14), backgroundColor: colors.card },
  primary: { backgroundColor: colors.selected, borderColor: colors.selected },
  primaryText: { color: colors.onSelected },
  off: { opacity: 0.5 },
  pressed: { backgroundColor: colors.info },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  row: { minHeight: touch.min, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', paddingVertical: sp(10), gap: sp(8) },
  rowText: { flex: 1, gap: sp(2) },
  left: { textAlign: 'left' },
  meta: { fontSize: fs(16), fontWeight: '600', color: colors.muted },
  badge: { fontSize: fs(14), fontWeight: '800', color: colors.warn, backgroundColor: colors.warnBg, paddingHorizontal: sp(10), paddingVertical: sp(3), borderRadius: 999, overflow: 'hidden' },
  chevron: { fontSize: type.big, fontWeight: '700', color: colors.muted },
});
