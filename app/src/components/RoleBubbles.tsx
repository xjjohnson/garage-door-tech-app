import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { ROLE_CARDS, RoleKey } from '../lib/roles';
import { colors, fs, sp } from '../theme';

/** One round bubble in a role's own color. `ring` marks the role in use. */
export function RoleBubble({ role, size, ring, onPress }: { role: RoleKey; size: number; ring?: boolean; onPress: (r: RoleKey) => void }) {
  const card = ROLE_CARDS[role];
  return (
    <Pressable
      onPress={() => onPress(role)}
      accessibilityRole="button"
      accessibilityLabel={`${card.label}${ring ? ', current role' : ''}`}
      testID={`role-${role}`}
      style={({ pressed }) => [styles.bubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: card.color }, ring && styles.ring, pressed && styles.pressed]}
    >
      <Text style={{ fontSize: Math.round(size * 0.3) }}>{card.icon}</Text>
      <Text style={[styles.label, { fontSize: size > 110 ? fs(17) : fs(14) }]} numberOfLines={1} adjustsFontSizeToFit>
        {card.label}
      </Text>
    </Pressable>
  );
}

/** A wrapped row of bubbles. */
export function RoleBubbleRow({ roles, size, current, onPick }: { roles: RoleKey[]; size: number; current?: RoleKey | null; onPick: (r: RoleKey) => void }) {
  return (
    <View style={styles.row}>
      {roles.map((r) => (
        <RoleBubble key={r} role={r} size={size} ring={r === current} onPress={onPick} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: sp(14) },
  bubble: { alignItems: 'center', justifyContent: 'center', gap: sp(2), elevation: 3, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  ring: { borderWidth: 4, borderColor: colors.card, elevation: 6 },
  pressed: { opacity: 0.85 },
  label: { color: '#FFFFFF', fontWeight: '800' },
});
