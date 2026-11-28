import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { RoleBubbleRow } from './RoleBubbles';
import { ROLE_CARDS, RoleKey } from '../lib/roles';
import { switchRole } from '../lib/roleSwitch';
import { colors, fs, rad, sp } from '../theme';

/**
 * The round chip at the top left that shows the role in use. Tap it for a sheet of the person's
 * other roles; picking one changes the app to that role's look and bar. Only shown to someone
 * with more than one role.
 */
export function RoleChip({ roles, current }: { roles: RoleKey[]; current: RoleKey | null }) {
  const [open, setOpen] = useState(false);
  if (roles.length < 2 || !current) return null;
  const card = ROLE_CARDS[current];
  const pick = async (r: RoleKey) => {
    setOpen(false);
    if (r === current) return;
    await switchRole(r);
    router.replace('/');
  };
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Role: ${card.label}. Switch role`} testID="role-chip" style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
        <View style={[styles.dot, { backgroundColor: card.color }]}>
          <Text style={styles.dotIcon}>{card.icon}</Text>
        </View>
        <Text style={styles.chipText} numberOfLines={1}>
          {card.label} ▾
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)} accessibilityLabel="Close" testID="role-sheet-scrim" />
        <View style={styles.sheet} testID="role-sheet">
          <Text style={styles.sheetTitle} accessibilityRole="header">
            Switch role
          </Text>
          <RoleBubbleRow roles={roles} size={96} current={current} onPick={pick} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: sp(6), borderRadius: 999, paddingVertical: sp(5), paddingLeft: sp(5), paddingRight: sp(12), backgroundColor: 'rgba(255,255,255,0.2)', minHeight: 44 },
  pressed: { opacity: 0.8 },
  dot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  dotIcon: { fontSize: 16 },
  chipText: { color: colors.onHead, fontSize: fs(16), fontWeight: '800' },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: rad(26), borderTopRightRadius: rad(26), padding: sp(20), paddingBottom: sp(32), gap: sp(16) },
  sheetTitle: { textAlign: 'center', color: colors.text, fontSize: fs(18), fontWeight: '800' },
});
