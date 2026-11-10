import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { ApkUpdateBanner } from './src/components/ApkUpdateBanner';
import { APK_MANIFEST_URL } from './src/config';
import { DoorScreen } from './src/screens/DoorScreen';
import { MatchScreen } from './src/screens/MatchScreen';
import { colors, touch, type } from './src/theme';

type Tab = 'match' | 'door';

const TABS: { id: Tab; label: string }[] = [
  { id: 'match', label: 'Match old spring' },
  { id: 'door', label: 'Size from door' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('match');
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <Text style={styles.title}>Spring calculator</Text>
          <Text style={styles.subtitle}>Torsion, standard lift</Text>
        </View>
        {/* The runtime version is the installed APK's app.json version (appVersion policy). */}
        <ApkUpdateBanner manifestUrl={APK_MANIFEST_URL} currentVersion={Updates.runtimeVersion} />
        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTab(t.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                testID={`tab-${t.id}`}
                style={[styles.tab, on && styles.tabOn]}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {/* Both screens stay mounted so switching tabs keeps each one's inputs. */}
        <ScrollView style={[styles.flex, tab !== 'match' && styles.hidden]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <MatchScreen />
        </ScrollView>
        <ScrollView style={[styles.flex, tab !== 'door' && styles.hidden]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <DoorScreen />
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  hidden: { display: 'none' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: type.big, fontWeight: '900', color: colors.text },
  subtitle: { fontSize: 16, fontWeight: '600', color: colors.muted },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 3, borderBottomColor: colors.border },
  tab: {
    flex: 1,
    minHeight: touch.min,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  tabOn: { backgroundColor: colors.selected },
  tabText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  tabTextOn: { color: colors.onSelected },
  content: { padding: 16, paddingBottom: 48 },
});
