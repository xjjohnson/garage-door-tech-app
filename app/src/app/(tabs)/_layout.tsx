import { router, usePathname } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import * as Updates from 'expo-updates';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApkUpdateBanner } from '../../components/ApkUpdateBanner';
import { UpdateReadyBar } from '../../components/UpdateReadyBar';
import { APK_MANIFEST_URL } from '../../config';
import { SHORT_VERSION } from '../../lib/appVersion';
import { SECTIONS } from '../../lib/sections';
import { colors, touch, type } from '../../theme';

/**
 * The four sections as tabs. The header, update banners and the bottom bar
 * are drawn here, around whichever section is open; the navigator's own tab
 * bar is hidden so the bar keeps the app's big, high-contrast look. A
 * section stays mounted once opened, so switching keeps its inputs and
 * search; Manuals and Diagnose aren't drawn until first opened.
 */
export default function TabsLayout() {
  // Turns true when expo-updates finishes downloading an update by itself at launch.
  const { isUpdatePending } = Updates.useUpdates();
  const pathname = usePathname();
  const current = SECTIONS.find((s) => s.href === pathname) ?? SECTIONS[0];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      {/* Settings at the top right, with the running version on it so it's always in sight. */}
      <View style={styles.header} testID="header">
        <View style={styles.headText}>
          <Text style={styles.title} accessibilityRole="header">
            {current.title}
          </Text>
          <Text style={styles.subtitle}>{current.subtitle}</Text>
        </View>
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel={`Settings, app ${SHORT_VERSION}`}
          testID="open-settings"
          style={({ pressed }) => [styles.settings, pressed && styles.navPressedLight]}
        >
          <Text style={styles.settingsText}>Settings</Text>
          <Text style={styles.version} testID="header-version">
            {SHORT_VERSION}
          </Text>
        </Pressable>
      </View>
      {/* The runtime version is the installed APK's app.json version (appVersion policy). */}
      <ApkUpdateBanner manifestUrl={APK_MANIFEST_URL} currentVersion={Updates.runtimeVersion} />
      <View style={styles.root}>
        <Tabs tabBar={() => null} screenOptions={{ headerShown: false, lazy: true, sceneStyle: { backgroundColor: colors.bg } }}>
          {SECTIONS.map((s) => (
            <Tabs.Screen key={s.id} name={s.name} options={{ title: s.label }} />
          ))}
        </Tabs>
      </View>
      {/* Shown once an over-the-air update has downloaded; never restarts on its own. */}
      <UpdateReadyBar pending={isUpdatePending} />
      {/* The app's sections, at the bottom where a thumb reaches them. */}
      <View style={styles.nav} accessibilityRole="tablist">
        {SECTIONS.map((s) => {
          const on = current.id === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => router.navigate(s.href)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              testID={`section-${s.id}`}
              style={({ pressed }) => [styles.navItem, on && styles.navItemOn, pressed && !on && styles.navPressed]}
            >
              <Text style={[styles.navText, on && styles.navTextOn]} numberOfLines={1} adjustsFontSizeToFit>
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  headText: { flex: 1 },
  title: { fontSize: type.big, fontWeight: '900', color: colors.text },
  subtitle: { fontSize: 16, fontWeight: '700', color: colors.muted },
  settings: { minHeight: touch.min, minWidth: touch.min + 24, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  settingsText: { fontSize: 16, fontWeight: '800', color: colors.text },
  version: { fontSize: 13, fontWeight: '700', color: colors.muted },
  navPressedLight: { backgroundColor: colors.safety },
  // Black bar, the open section in safety yellow with a yellow mark on top.
  nav: { flexDirection: 'row', backgroundColor: colors.selected },
  navItem: { flex: 1, paddingHorizontal: 2, minHeight: touch.bar, alignItems: 'center', justifyContent: 'center', borderTopWidth: 6, borderTopColor: colors.selected },
  navItemOn: { borderTopColor: colors.safety },
  navPressed: { backgroundColor: colors.muted },
  navText: { fontSize: type.body, fontWeight: '800', color: colors.onSelected },
  navTextOn: { color: colors.safety, fontWeight: '900' },
});
