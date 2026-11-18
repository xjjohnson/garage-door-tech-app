import { router, usePathname } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import * as Updates from 'expo-updates';
import { SyncPill } from '../../components/SyncNowButton';
import { Icon } from '../../components/Icon';
import { requestHeaderAdd } from '../../lib/headerAdd';
import { useSchedule } from '../../lib/useSchedule';
import { onDay } from '../../lib/schedule';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApkUpdateBanner } from '../../components/ApkUpdateBanner';
import { UpdateReadyBar } from '../../components/UpdateReadyBar';
import { APK_MANIFEST_URL } from '../../config';
import { dateLine } from '../../lib/schedule';
import { SECTIONS, TOOL_PAGES } from '../../lib/sections';
import { colors, radius, touch, type } from '../../theme';

/**
 * The five tabs (Today, Jobs, Sales, Customers, Tools) and the tool pages
 * opened from Tools (springs, manuals, diagnose), which keep the bar with
 * Tools lit. The header, update banners and the bottom bar are drawn here;
 * the navigator's own tab bar is hidden so the bar keeps the app's big,
 * high-contrast look. A tab stays mounted once opened, so switching keeps
 * its inputs and search.
 */
export default function TabsLayout() {
  // Turns true when expo-updates finishes downloading an update by itself at launch.
  const { isUpdatePending } = Updates.useUpdates();
  const pathname = usePathname();
  const tool = TOOL_PAGES.find((t) => t.href === pathname);
  const current = tool ?? SECTIONS.find((s) => s.href === pathname) ?? SECTIONS[0];
  const lit = tool ? 'tools' : current.id;
  const { appointments } = useSchedule();
  const visits = onDay(appointments, Date.now()).filter((a) => a.status !== 'cancelled').length;
  const subtitle = current.id === 'today' ? `${dateLine(Date.now())} · ${visits === 0 ? 'no visits' : `${visits} visit${visits === 1 ? '' : 's'}`}` : current.subtitle;
  // Today, Jobs, Customers and Sales carry their own action in the header. Settings is only the gear on Tools. The version lives at the bottom of Home and in Settings.
  const action = !tool && current.id === 'today' ? <BookPill /> : !tool && current.id === 'jobs' ? <NewJobPill /> : !tool && current.id === 'customers' ? <AddPill /> : !tool && current.id === 'sales' ? <SyncPill label="Sync all" testID="sales-sync-all" /> : null;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      {/* The forest header with the page title; its action (or the Tools gear) at the top right. */}
      <View style={styles.header} testID="header">
        {tool ? (
          <Pressable onPress={() => router.navigate('/tools')} accessibilityRole="button" accessibilityLabel="Back to Tools" testID="back-to-tools" style={({ pressed }) => [styles.back, pressed && styles.headPressed]}>
            <Text style={styles.backText}>‹ Tools</Text>
          </Pressable>
        ) : (
          <Image source={MARK} style={styles.mark} accessibilityLabel="Johnsons" testID="brand-mark" />
        )}
        <View style={styles.headText}>
          <Text style={styles.title} accessibilityRole="header">
            {current.title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {action ? (
          action
        ) : current.id === 'tools' && !tool ? (
          <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings" testID="open-settings" style={({ pressed }) => [styles.gear, pressed && styles.headPressed]}>
            <Icon name="gear" size={24} color={colors.onHead} />
          </Pressable>
        ) : null}
      </View>
      {/* The runtime version is the installed APK's app.json version (appVersion policy). */}
      <ApkUpdateBanner manifestUrl={APK_MANIFEST_URL} currentVersion={Updates.runtimeVersion} />
      {/* The rounded sheet that rides up over the header. */}
      <View style={styles.sheet}>
        <Tabs tabBar={() => null} screenOptions={{ headerShown: false, lazy: true, sceneStyle: { backgroundColor: colors.bg } }}>
          {[...SECTIONS, ...TOOL_PAGES].map((s) => (
            <Tabs.Screen key={s.id} name={s.name} options={{ title: s.label }} />
          ))}
        </Tabs>
      </View>
      {/* Shown once an over-the-air update has downloaded; never restarts on its own. */}
      <UpdateReadyBar pending={isUpdatePending} />
      {/* The app's sections, at the bottom where a thumb reaches them. */}
      <View style={styles.nav} accessibilityRole="tablist">
        {SECTIONS.map((s) => {
          const on = lit === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => router.navigate(s.href)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              testID={`section-${s.id}`}
              style={({ pressed }) => [styles.navItem, pressed && !on && styles.navPressed]}
            >
              <Icon name={ICONS[s.id]} color={on ? colors.selected : colors.muted} />
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

function BookPill() {
  return (
    <Pressable onPress={() => router.push({ pathname: '/schedule', params: { book: 'new' } })} accessibilityRole="button" testID="home-book-visit" style={({ pressed }) => [styles.newJob, pressed && styles.headPressed]}>
      <Icon name="plus" size={16} color={colors.onHead} />
      <Text style={styles.settingsText}>Book a visit</Text>
    </Pressable>
  );
}

function AddPill() {
  return (
    <Pressable onPress={requestHeaderAdd} accessibilityRole="button" testID="customers-add" style={({ pressed }) => [styles.newJob, pressed && styles.headPressed]}>
      <Icon name="plus" size={16} color={colors.onHead} />
      <Text style={styles.settingsText}>Add</Text>
    </Pressable>
  );
}

function NewJobPill() {
  return (
    <Pressable onPress={() => router.push('/new-job')} accessibilityRole="button" testID="jobs-new-job" style={({ pressed }) => [styles.newJob, pressed && styles.headPressed]}>
      <Icon name="plus" size={16} color={colors.onHead} />
      <Text style={styles.settingsText}>New job</Text>
    </Pressable>
  );
}

const ICONS = { today: 'clock', jobs: 'wrench', customers: 'users', sales: 'dollar', tools: 'gear' } as const;

const MARK = require('../../../assets/brand/mark.png');

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.head },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 26, backgroundColor: colors.head },
  headText: { flex: 1 },
  mark: { width: 44, height: 44, borderRadius: 10 },
  back: { minHeight: touch.min - 8, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  backText: { fontSize: 16, fontWeight: '800', color: colors.onHead },
  title: { fontSize: type.big - 2, fontWeight: '800', color: colors.onHead },
  subtitle: { fontSize: 15, fontWeight: '600', color: colors.onHead, opacity: 0.85 },
  settings: { minHeight: touch.min - 8, minWidth: touch.min + 16, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  settingsText: { fontSize: 15, fontWeight: '800', color: colors.onHead },
  gear: { width: touch.min - 8, height: touch.min - 8, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  actionCol: { alignItems: 'flex-end', gap: 4 },
  newJob: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: touch.min - 12, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.2)' },
  versionLink: { fontSize: 12, fontWeight: '700', color: colors.onHead, opacity: 0.85 },
  headPressed: { backgroundColor: 'rgba(255,255,255,0.35)' },
  sheet: { flex: 1, marginTop: -18, backgroundColor: colors.bg, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, overflow: 'hidden' },
  nav: { flexDirection: 'row', backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 6, paddingBottom: 4 },
  navItem: { flex: 1, paddingHorizontal: 2, minHeight: touch.bar - 6, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navPressed: { backgroundColor: colors.info },
  navText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  navTextOn: { color: colors.selected, fontWeight: '800' },
});
