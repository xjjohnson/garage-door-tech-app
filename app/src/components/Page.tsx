import { router } from 'expo-router';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, touch, type } from '../theme';

const DockContext = createContext<((node: ReactNode) => void) | null>(null);

/** Puts its children in a bar pinned to the bottom of the page, under the scrolling content. Used inside a Page. */
export function Dock({ children }: { children: ReactNode }) {
  const set = useContext(DockContext);
  useEffect(() => {
    set?.(children);
  });
  useEffect(() => () => set?.(null), [set]);
  // Outside a Page there is nowhere to pin it, so it sits in the flow.
  return set ? null : <>{children}</>;
}

/** A full page over the sections, such as a quote: its title and a big Close button that goes back. */
export function Page({ title, children, testID }: { title: string; children: ReactNode; testID?: string }) {
  const [dock, setDock] = useState<ReactNode>(null);
  return (
    <DockContext.Provider value={setDock}>
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']} testID={testID}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/jobs'))}
          accessibilityRole="button"
          testID={testID ? `${testID}-close` : undefined}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {dock ? (
        <View style={styles.dock} testID={testID ? `${testID}-dock` : undefined}>
          {dock}
        </View>
      ) : null}
    </SafeAreaView>
    </DockContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.head },
  title: { flex: 1, fontSize: type.big, fontWeight: '800', color: colors.onHead },
  close: { minHeight: touch.min - 8, minWidth: touch.min + 8, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  pressed: { backgroundColor: 'rgba(255,255,255,0.35)' },
  closeText: { fontSize: type.body, fontWeight: '800', color: colors.onHead },
  dock: { padding: 12, gap: 8, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
});
