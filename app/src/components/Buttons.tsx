import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, touch, type } from '../theme';

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
        <Text style={styles.buttonText}>{label}</Text>
        {detail ? <Text style={styles.meta}>{detail}</Text> : null}
      </View>
      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  button: { minHeight: touch.min, borderRadius: 12, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  primary: { backgroundColor: colors.brand, borderColor: colors.brand },
  primaryText: { color: colors.onSelected },
  off: { opacity: 0.5 },
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  row: { minHeight: touch.min, borderBottomWidth: 2, borderBottomColor: colors.info, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  rowText: { flex: 1, gap: 2 },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  badge: { fontSize: 15, fontWeight: '900', color: colors.text, backgroundColor: colors.safety, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  chevron: { fontSize: type.big, fontWeight: '900', color: colors.text },
});
