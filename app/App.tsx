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
  // Diagnose is drawn the first time it's opened, not at startup, so it adds
  // nothing to launch time. After that it stays mounted and keeps its picks.
  const [diagnoseOpened, setDiagnoseOpened] = useState(false);
  if (section === 'diagnose' && !diagnoseOpened) setDiagnoseOpened(true);
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style="dark" />
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {current.title}
          </Text>
          <Text style={styles.subtitle}>{current.subtitle}</Text>
          <Text style={styles.build} testID="build-info" selectable numberOfLines={1}>
            {BUILD_INFO}
          </Text>
        </View>
        {/* The runtime version is the installed APK's app.json version (appVersion policy). */}
        <ApkUpdateBanner manifestUrl={APK_MANIFEST_URL} currentVersion={Updates.runtimeVersion} />
        {/* Two ways into the calculator, as one joined switch so it doesn't read like the app's main tabs. */}
        <View style={[styles.segmentWrap, section !== 'springs' && styles.hidden]}>
          <View style={styles.segments} accessibilityRole="tablist">
            {TABS.map((t, i) => {
              const on = tab === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTab(t.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  testID={`tab-${t.id}`}
                  style={({ pressed }) => [styles.segment, i > 0 && styles.segmentDivider, on && styles.tabOn, pressed && !on && styles.pressed]}
                >
                  <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {/* Every screen stays mounted so switching keeps its inputs and search. */}
        <View style={[styles.flex, (section !== 'springs' || tab !== 'match') && styles.hidden]}>
          <MatchScreen />
        </View>
        <View style={[styles.flex, (section !== 'springs' || tab !== 'door') && styles.hidden]}>
          <DoorScreen />
        </View>
        <ScrollView style={[styles.flex, styles.manuals, section !== 'manuals' && styles.hidden]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ManualsScreen />
        </ScrollView>
        {diagnoseOpened ? (
          <ScrollView style={[styles.flex, styles.manuals, section !== 'diagnose' && styles.hidden]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <DiagnoseScreen />
          </ScrollView>
        ) : null}
        {/* The app's sections, at the bottom where a thumb reaches them. */}
        <View style={styles.nav} accessibilityRole="tablist">
          {SECTIONS.map((s) => {
            const on = section === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() => setSection(s.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                testID={`section-${s.id}`}
                style={({ pressed }) => [styles.navItem, on && styles.navItemOn, pressed && !on && styles.navPressed]}
              >
                <Text style={[styles.navText, on && styles.navTextOn]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  hidden: { display: 'none' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  title: { fontSize: type.big, fontWeight: '900', color: colors.text },
  subtitle: { fontSize: 16, fontWeight: '700', color: colors.muted },
  build: { fontSize: 13, fontWeight: '500', color: colors.muted, marginTop: 2 },
  segmentWrap: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 3, borderBottomColor: colors.border },
  segments: { flexDirection: 'row', borderWidth: 3, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' },
  segment: { flex: 1, minHeight: touch.min, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, backgroundColor: colors.bg },
  segmentDivider: { borderLeftWidth: 3, borderLeftColor: colors.border },
  tabOn: { backgroundColor: colors.selected },
  pressed: { backgroundColor: colors.safety },
  tabText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  tabTextOn: { color: colors.onSelected },
  manuals: { borderTopWidth: 3, borderTopColor: colors.border },
  content: { padding: 16, paddingBottom: 48 },
  // Black bar, the open section in safety yellow with a yellow mark on top.
  nav: { flexDirection: 'row', backgroundColor: colors.selected },
  navItem: { flex: 1, minHeight: touch.bar, alignItems: 'center', justifyContent: 'center', borderTopWidth: 6, borderTopColor: colors.selected },
  navItemOn: { borderTopColor: colors.safety },
  navPressed: { backgroundColor: colors.muted },
  navText: { fontSize: type.body, fontWeight: '800', color: colors.onSelected },
  navTextOn: { color: colors.safety, fontWeight: '900' },
});
