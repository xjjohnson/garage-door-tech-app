import { router } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable } from 'react-native';
import { Text } from '../components/AppText';
import { RoleBadge, RoleBubbleRow } from '../components/RoleBubbles';
import { roleBadge } from '../lib/deptBadges';
import { useBadges } from '../lib/useBadges';
import { ROLE_CARDS, RoleKey } from '../lib/roles';
import { switchRole } from '../lib/roleSwitch';
import { useRoles } from '../lib/useRoles';
import { colors, fs, rad, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

/** Which role to offer first when none was chosen yet: the broadest one a person holds. */
const FIRST: RoleKey[] = ['owner', 'dispatch', 'office', 'sales', 'warehouse', 'tech'];

export function greeting(hour: number): string {
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * The start screen: the role to continue as (your last one) as one big button, and a bubble for each
 * other role you have. Only roles you have are shown. Shown first, every time someone with more than one role
 * opens the app (the chip at the top brings it back).
 */
export function RolesScreen() {
  const styles = useStyles();
  const { roles, last } = useRoles();
  const badges = useBadges();
  const main = last ?? FIRST.find((r) => roles.includes(r)) ?? 'tech';
  const card = ROLE_CARDS[main];
  const go = async (r: RoleKey) => {
    await switchRole(r);
    router.replace('/');
  };
  return (
    <SafeAreaView style={styles.root} testID="roles-screen">
      <Text style={styles.hi}>{greeting(new Date().getHours())}</Text>
      <Text style={styles.title} accessibilityRole="header">
        {last ? 'Welcome back' : 'Where to today?'}
      </Text>
      <Pressable onPress={() => go(main)} accessibilityRole="button" testID="role-big" style={({ pressed }) => [styles.big, { backgroundColor: card.color }, pressed && styles.pressed]}>
        <Text style={styles.bigSmall}>{last ? 'Continue as' : 'Start as'}</Text>
        <Text style={styles.bigName}>
          {card.icon} {card.label}
        </Text>
        <RoleBadge n={roleBadge(badges, main)} testID="role-big-badge" />
      </Pressable>
      {roles.length > 1 ? (
        <View style={styles.others}>
          <Text style={styles.orLabel}>Or switch to</Text>
          <RoleBubbleRow roles={roles.filter((r) => r !== main)} size={108} onPick={go} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const useStyles = makeStyles(() => ({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: sp(22), paddingTop: sp(40), gap: sp(14) },
  hi: { color: colors.muted, fontSize: fs(16), fontWeight: '700' },
  title: { color: colors.text, fontSize: fs(30), fontWeight: '800' },
  big: { borderRadius: rad(26), padding: sp(24), gap: sp(4), elevation: 4, minHeight: 120, justifyContent: 'center' },
  bigSmall: { color: 'rgba(255,255,255,0.85)', fontSize: fs(15), fontWeight: '700' },
  bigName: { color: '#FFFFFF', fontSize: fs(32), fontWeight: '800' },
  pressed: { opacity: 0.88 },
  others: { gap: sp(12), marginTop: sp(8) },
  orLabel: { color: colors.muted, fontSize: fs(15), fontWeight: '800' },
}));
