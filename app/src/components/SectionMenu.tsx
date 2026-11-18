import { ReactNode, useEffect } from 'react';
import { useBackStep } from '../lib/backStep';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { colors, radius, shadow } from '../theme';

export interface MenuItem<T extends string> {
  id: T;
  label: string;
  detail?: string;
  /** A count that needs attention; shown as a red number, nothing at 0. */
  badge?: number;
}
export interface MenuGroup<T extends string> {
  title: string;
  items: MenuItem<T>[];
}

/** A red number for something that needs a look. Draws nothing at 0. */
export function CountBadge({ n, testID }: { n?: number; testID?: string }) {
  if (!n || n <= 0) return null;
  return (
    <View style={styles.badge} testID={testID} accessibilityLabel={`${n} need attention`}>
      <Text style={styles.badgeText}>{n > 99 ? '99+' : n}</Text>
    </View>
  );
}

/** A grouped list: small capital headings, a white card of rows under each. Each row opens its own page. */
export function SectionMenu<T extends string>({ groups, onPick, testID, rowTestID }: { groups: MenuGroup<T>[]; onPick: (id: T) => void; testID?: string; rowTestID: (id: T) => string }) {
  return (
    <View testID={testID} style={styles.stack}>
      {groups.map((g) => (
        <View key={g.title}>
          <Text style={styles.heading} accessibilityRole="header">
            {g.title}
          </Text>
          <View style={styles.card}>
            {g.items.map((it, i) => (
              <Pressable key={it.id} onPress={() => onPick(it.id)} accessibilityRole="button" testID={rowTestID(it.id)} style={({ pressed }) => [styles.row, i > 0 && styles.line, pressed && styles.pressed]}>
                <View style={styles.text}>
                  <Text style={styles.label}>{it.label}</Text>
                  {it.detail ? <Text style={styles.detail}>{it.detail}</Text> : null}
                </View>
                <CountBadge n={it.badge} testID={`${rowTestID(it.id)}-badge`} />
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/** One opened page of a grouped list: its title, then the page. Going back is the page header's "<" or the phone's back button, which return to the list. */
export function SectionPage({ title, onBack, children }: { area?: string; title: string; onBack: () => void; testID?: string; children: ReactNode }) {
  useBackStep(onBack);
  return (
    <View style={styles.stack}>
      <Text style={styles.pageTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  heading: { fontSize: 13, fontWeight: '800', letterSpacing: 1, color: colors.muted, textTransform: 'uppercase', paddingHorizontal: 4, paddingBottom: 6, paddingTop: 4 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, minHeight: 56 },
  line: { borderTopWidth: 1, borderTopColor: colors.line },
  pressed: { backgroundColor: colors.info },
  text: { flex: 1, gap: 2 },
  label: { fontSize: 18, fontWeight: '800', color: colors.text },
  detail: { fontSize: 15, fontWeight: '600', color: colors.muted },
  chevron: { fontSize: 26, color: colors.muted },
  badge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, backgroundColor: '#C62828', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.text, paddingHorizontal: 4 },
});
