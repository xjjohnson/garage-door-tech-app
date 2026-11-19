import { router } from 'expo-router';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { runBackStep } from '../lib/backStep';
import { Text } from './AppText';
import { Icon } from './Icon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, touch, type, sp } from '../theme';

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
  // The phone's back button steps back one level (an opened row, an edit screen) before it leaves the page.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => runBackStep());
    return () => sub.remove();
  }, []);
  return (
    <DockContext.Provider value={setDock}>
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']} testID={testID}>
      <View style={styles.head}>
        <Pressable
          onPress={() => { if (!runBackStep()) router.canGoBack() ? router.back() : router.replace('/jobs'); }}
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID={testID ? `${testID}-close` : undefined}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <Icon name="back" size={24} color={colors.onHead} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
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
  head: { flexDirection: 'row', alignItems: 'center', gap: sp(12), paddingHorizontal: sp(16), paddingVertical: sp(10), backgroundColor: colors.head },
  title: { flex: 1, fontSize: type.big, fontWeight: '800', color: colors.onHead },
  close: { width: touch.min - 4, height: touch.min - 4, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: 'rgba(255,255,255,0.35)' },
  dock: { padding: sp(12), gap: sp(8), backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line },
  content: { padding: sp(16), paddingBottom: sp(48), gap: sp(14) },
});
