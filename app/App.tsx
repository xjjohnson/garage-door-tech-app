import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { ApkUpdateBanner } from './src/components/ApkUpdateBanner';
import { APK_MANIFEST_URL } from './src/config';
import { formatBuildInfo } from './src/lib/buildInfo';
import { DiagnoseScreen } from './src/screens/DiagnoseScreen';
import { DoorScreen } from './src/screens/DoorScreen';
import { ManualsScreen } from './src/screens/ManualsScreen';
import { MatchScreen } from './src/screens/MatchScreen';
import { colors, touch, type } from './src/theme';

type Section = 'springs' | 'manuals' | 'diagnose';
type Tab = 'match' | 'door';

// Read once: what's running doesn't change until the app restarts.
const BUILD_INFO = formatBuildInfo({
  runtimeVersion: Updates.runtimeVersion,
  updateId: Updates.updateId,
  createdAt: Updates.createdAt,
  isEmbeddedLaunch: Updates.isEmbeddedLaunch,
  manifest: Updates.manifest,
});

const SECTIONS: { id: Section; label: string; title: string; subtitle: string }[] = [
  { id: 'springs', label: 'Springs', title: 'Spring calculator', subtitle: 'Torsion, standard lift' },
  { id: 'manuals', label: 'Manuals', title: 'Manuals', subtitle: "Makers' install and owner's manuals" },
  { id: 'diagnose', label: 'Diagnose', title: 'Diagnose', subtitle: 'Opener codes and symptoms, works offline' },
];

const TABS: { id: Tab; label: string }[] = [
  { id: 'match', label: 'Match old spring' },
  { id: 'door', label: 'Size from door' },
];

export default function App() {
  const [section, setSection] = useState<Section>('springs');
  const [tab, setTab] = useState<Tab>('match');
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.subtitle}>{current.subtitle}</Text>
          <Text style={styles.build} testID="build-info" selectable>
            {BUILD_INFO}
          </Text>
        </View>
        {/* The runtime version is the installed APK's app.json version (appVersion policy). */}
        <ApkUpdateBanner manifestUrl={APK_MANIFEST_URL} currentVersion={Updates.runtimeVersion} />
        <View style={[styles.tabs, section === 'springs' && styles.sections]} accessibilityRole="tablist">
          {SECTIONS.map((s) => {
            const on = section === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() => setSection(s.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                testID={`section-${s.id}`}
                style={[styles.tab, on && styles.tabOn]}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.tabs, section !== 'springs' && styles.hidden]} accessibilityRole="tablist">
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
        {/* Every screen stays mounted so switching keeps its inputs and search. */}
        <ScrollView style={[styles.flex, (section !== 'springs' || tab !== 'match') && styles.hidden]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <MatchScreen />
        </ScrollView>
        <ScrollView style={[styles.flex, (section !== 'springs' || tab !== 'door') && styles.hidden]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <DoorScreen />
        </ScrollView>
        <ScrollView style={[styles.flex, section !== 'manuals' && styles.hidden]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ManualsScreen />
        </ScrollView>
        <ScrollView style={[styles.flex, section !== 'diagnose' && styles.hidden]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <DiagnoseScreen />
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
  build: { fontSize: 14, fontWeight: '500', color: colors.muted, marginTop: 2 },
  sections: { borderBottomWidth: 0, paddingBottom: 0 },
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
