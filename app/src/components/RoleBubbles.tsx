import { Pressable, View } from 'react-native';
import { Text } from './AppText';
import { ROLE_CARDS, RoleKey } from '../lib/roles';
import { roleBadge } from '../lib/deptBadges';
import { useBadges } from '../lib/useBadges';
import { colors, fs, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

/** One round bubble in a role's own color. `ring` marks the role in use. */
export function RoleBubble({ role, size, ring, badge, onPress }: { role: RoleKey; size: number; ring?: boolean; badge?: number; onPress: (r: RoleKey) => void }) {
  const styles = useStyles();
  const card = ROLE_CARDS[role];
  return (
    <Pressable
      onPress={() => onPress(role)}
      accessibilityRole="button"
      accessibilityLabel={`${card.label}${ring ? ', current role' : ''}${badge ? `, ${badge} need attention` : ''}`}
      testID={`role-${role}`}
      style={({ pressed }) => [styles.bubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: card.color }, ring && styles.ring, pressed && styles.pressed]}
    >
      <Text style={{ fontSize: Math.round(size * 0.3) }}>{card.icon}</Text>
      <Text style={[styles.label, { fontSize: size > 110 ? fs(17) : fs(14) }]} numberOfLines={1} adjustsFontSizeToFit>
        {card.label}
      </Text>
      <RoleBadge n={badge} testID={`role-${role}-badge`} />
    </Pressable>
  );
}

/** The red count on a bubble or the big button: what needs a look in that role. */
export function RoleBadge({ n, testID }: { n?: number; testID?: string }) {
  const styles = useStyles();
  if (!n || n <= 0) return null;
  return (
    <View style={styles.badge} testID={testID}>
      <Text style={styles.badgeText}>{n > 99 ? '99+' : n}</Text>
    </View>
  );
}

/** A wrapped row of bubbles. */
export function RoleBubbleRow({ roles, size, current, onPick }: { roles: RoleKey[]; size: number; current?: RoleKey | null; onPick: (r: RoleKey) => void }) {
  const styles = useStyles();
  const badges = useBadges();
  return (
    <View style={styles.row}>
      {roles.map((r) => (
        <RoleBubble key={r} role={r} size={size} ring={r === current} badge={roleBadge(badges, r)} onPress={onPick} />
      ))}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: sp(14) },
  bubble: { alignItems: 'center', justifyContent: 'center', gap: sp(2), elevation: 3, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  ring: { borderWidth: 4, borderColor: colors.card, elevation: 6 },
  pressed: { opacity: 0.85 },
  badge: { position: 'absolute', top: 0, right: 0, minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 7, backgroundColor: '#D32F2F', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  label: { color: '#FFFFFF', fontWeight: '800' },
}));
