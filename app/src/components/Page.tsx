import { router } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, touch, type } from '../theme';

/** A full page over the sections, such as a quote: its title and a big Close button that goes back. */
export function Page({ title, children, testID }: { title: string; children: ReactNode; testID?: string }) {
  return (
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.head },
  title: { flex: 1, fontSize: type.big, fontWeight: '800', color: colors.onHead },
  close: { minHeight: touch.min - 8, minWidth: touch.min + 8, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  pressed: { backgroundColor: 'rgba(255,255,255,0.35)' },
  closeText: { fontSize: type.body, fontWeight: '800', color: colors.onHead },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
});
