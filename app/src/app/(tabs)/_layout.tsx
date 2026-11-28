import { router, usePathname } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import * as Updates from 'expo-updates';
import { SyncPill } from '../../components/SyncNowButton';
import { Icon } from '../../components/Icon';
import { requestHeaderAdd } from '../../lib/headerAdd';
import { useSchedule } from '../../lib/useSchedule';
import { onDay } from '../../lib/schedule';
import { Image, Pressable, View } from 'react-native';
import { Text } from '../../components/AppText';
import { CountBadge } from '../../components/SectionMenu';
import { dispatchTotal, toolsTotal } from '../../lib/deptBadges';
import { useBadges } from '../../lib/useBadges';
import { OpeningDoor, stagePercent } from '../../components/OpeningDoor';
import { RoleChip } from '../../components/RoleChip';
import { useRoles } from '../../lib/useRoles';
import { useDepartments, useDispatcherOnly, useOfficeOnly, useOwnerBar, useSalesOnly, useTech } from '../../lib/useDepartments';
import { useEffect, useRef, useState } from 'react';
import { useOdoo } from '../../lib/useOdoo';
import { useAllAccess } from '../../lib/useDepartments';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApkUpdateBanner } from '../../components/ApkUpdateBanner';
import { UpdateReadyBar } from '../../components/UpdateReadyBar';
import { APK_MANIFEST_URL } from '../../config';
import { dateLine } from '../../lib/schedule';
import { barFor, DISPATCH_ONLY_HREFS, OFFICE_ONLY_HREFS, OWNER_AREAS_HREFS, OWNER_ONLY_HREFS, SALES_ONLY_HREFS, SECTIONS, TECH_HIDDEN_HREFS, TOOL_PAGES } from '../../lib/sections';
import { colors, radius, touch, type, fs, rad, sp } from '../../theme';
import { makeStyles } from '../../lib/makeStyles';

/**
 * The five tabs (Today, Jobs, Sales, Customers, Tools) and the tool pages
 * opened from Tools (springs, manuals, diagnose), which keep the bar with
 * Tools lit. The header, update banners and the bottom bar are drawn here;
 * the navigator's own tab bar is hidden so the bar keeps the app's big,
 * high-contrast look. A tab stays mounted once opened, so switching keeps
 * its inputs and search.
 */
export default function TabsLayout() {
  const { status, client } = useOdoo();
  const { ready } = useAllAccess();
  const { needsPick } = useRoles();
  // Until Odoo says which roles this person has, the look and bar are a guess, so hold a plain
  // screen instead of flashing the wrong one. Never longer than a few seconds (slow or no signal).
  const waiting = status === 'loading' || status === 'signingIn' || (!!client && !ready);
  // Someone with more than one role who hasn't chosen yet starts on the role screen. This lives here,
  // not in the tabs below, because the tabs are not drawn while the Opening screen shows.
  useEffect(() => {
    if (needsPick) router.replace('/roles');
  }, [needsPick]);
  const [gaveUp, setGaveUp] = useState(false);
  // Only at launch: once the tabs have shown, signing in or refreshing later must not tear them down.
  const [shown, setShown] = useState(false);
  const hadPick = useRef(false);
  const startedAt = useRef(Date.now());
  if (needsPick) hadPick.current = true;
  const finished = (!waiting || gaveUp) && !needsPick;
  useEffect(() => {
    if (!finished) return;
    // A moment with the door fully open (100%), but only when the load was slow enough to watch it;
    // a quick start, or the role screen as the next stop, goes straight on.
    if (hadPick.current || Date.now() - startedAt.current < 500) {
      setShown(true);
      return;
    }
    const t = setTimeout(() => setShown(true), 300);
    return () => clearTimeout(t);
  }, [finished]);
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setGaveUp(true), 6000);
    return () => clearTimeout(t);
  }, [waiting]);
  // The door is the progress bar: each real loading step lifts one bar away (25, 50, 75, 100%).
  const stage = finished || needsPick || gaveUp ? 4 : status === 'loading' ? 0 : status === 'signingIn' ? 1 : client && !ready ? 2 : 3;
  if (!shown) return <OpeningScreen stage={stage} />;
  return <TabsShell />;
}

function OpeningScreen({ stage }: { stage: number }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF0EA' }} testID="opening-screen">
      <OpeningDoor stage={stage} />
      <Text style={{ color: '#002D04', marginTop: 24, fontSize: 16, fontWeight: '700' }} testID="opening-percent">
        Opening… {stagePercent(stage)}%
      </Text>
    </View>
  );
}

function TabsShell() {
  const styles = useStyles();
  // Turns true when expo-updates finishes downloading an update by itself at launch.
  const { isUpdatePending } = Updates.useUpdates();
  const pathname = usePathname();
  const tool = TOOL_PAGES.find((t) => t.href === pathname);
  const current = tool ?? SECTIONS.find((s) => s.href === pathname) ?? SECTIONS[0];
  const { access } = useDepartments();
  const ownerBar = useOwnerBar();
  // The owner bar keeps Areas lit on the pages it opens (Customers, Sales, Tools and the tool pages).
  const lit = ownerBar && (tool || OWNER_AREAS_HREFS.includes(pathname)) ? 'areas' : tool ? 'tools' : current.id;
  const tech = useTech();
  const { roles, current: currentRole } = useRoles();
  const dispatcher = useDispatcherOnly();
  const salesOnly = useSalesOnly();
  const officeOnly = useOfficeOnly();
  const ids = barFor(ownerBar ? 'owner' : dispatcher ? 'dispatcher' : salesOnly ? 'sales' : officeOnly ? 'office' : tech ? 'tech' : 'other');
  const bar = SECTIONS.filter((x) => ids.includes(x.id));
  // A tech or dispatcher who lands on Customers or Sales (an old link) goes Home; Needs you and Week are only on the dispatcher bar.
  useEffect(() => {
    if ((tech || dispatcher) && TECH_HIDDEN_HREFS.includes(pathname)) router.replace('/');
    if (!dispatcher && DISPATCH_ONLY_HREFS.includes(pathname)) router.replace('/');
    if (!salesOnly && SALES_ONLY_HREFS.includes(pathname)) router.replace('/');
    if (!officeOnly && OFFICE_ONLY_HREFS.includes(pathname)) router.replace('/');
    if (!ownerBar && OWNER_ONLY_HREFS.includes(pathname)) router.replace('/');
  }, [tech, dispatcher, salesOnly, officeOnly, ownerBar, pathname]);
  const badges = useBadges();
  const moreCount = dispatcher ? 0 : toolsTotal(badges, access);
  const needsCount = dispatchTotal(badges);
  const { appointments } = useSchedule();
  const visits = onDay(appointments, Date.now()).filter((a) => a.status !== 'cancelled').length;
  const subtitle = current.id === 'today' ? `${dateLine(Date.now())} · ${visits === 0 ? 'no visits' : `${visits} visit${visits === 1 ? '' : 's'}`}` : current.subtitle;
  // Today, Jobs, Customers and Sales carry their own action in the header. Settings is only the gear on Tools. The version lives at the bottom of Home and in Settings.
  const action = !tool && current.id === 'today' && (salesOnly || officeOnly) ? <NewJobPill /> : !tool && current.id === 'today' ? <BookPill /> : !tool && current.id === 'jobs' ? <NewJobPill /> : !tool && current.id === 'customers' ? <AddPill /> : !tool && current.id === 'sales' ? <SyncPill label="Sync all" testID="sales-sync-all" /> : null;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']}>
      {/* The forest header with the page title; its action (or the Tools gear) at the top right. */}
      <View style={styles.header} testID="header">
        {tool ? (
          <Pressable onPress={() => router.navigate('/tools')} accessibilityRole="button" accessibilityLabel="Back to Tools" testID="back-to-tools" style={({ pressed }) => [styles.back, pressed && styles.headPressed]}>
            <Text style={styles.backText}>‹ Tools</Text>
          </Pressable>
        ) : roles.length > 1 && currentRole ? (
          <RoleChip roles={roles} current={currentRole} />
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
        {bar.map((s) => {
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
              <View>
                <Icon name={ICONS[s.id]} color={on ? colors.selected : colors.muted} />
                {s.id === 'needs' && needsCount > 0 ? (
                  <View style={styles.navBadge} pointerEvents="none">
                    <CountBadge n={needsCount} testID="needs-tab-badge" />
                  </View>
                ) : null}
                {s.id === 'tools' && moreCount > 0 ? (
                  <View style={styles.navBadge} pointerEvents="none">
                    <CountBadge n={moreCount} testID="tools-tab-badge" />
                  </View>
                ) : null}
              </View>
              <Text style={[styles.navText, on && styles.navTextOn]} numberOfLines={1} adjustsFontSizeToFit>
                {tech && s.id === 'tools' ? 'Tools' : s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function BookPill() {
  const styles = useStyles();
  return (
    <Pressable onPress={() => router.push({ pathname: '/schedule', params: { book: 'new' } })} accessibilityRole="button" testID="home-book-visit" style={({ pressed }) => [styles.newJob, pressed && styles.headPressed]}>
      <Icon name="plus" size={16} color={colors.onHead} />
      <Text style={styles.settingsText}>Book a visit</Text>
    </Pressable>
  );
}

function AddPill() {
  const styles = useStyles();
  return (
    <Pressable onPress={requestHeaderAdd} accessibilityRole="button" testID="customers-add" style={({ pressed }) => [styles.newJob, pressed && styles.headPressed]}>
      <Icon name="plus" size={16} color={colors.onHead} />
      <Text style={styles.settingsText}>Add</Text>
    </Pressable>
  );
}

function NewJobPill() {
  const styles = useStyles();
  return (
    <Pressable onPress={() => router.push('/new-job')} accessibilityRole="button" testID="jobs-new-job" style={({ pressed }) => [styles.newJob, pressed && styles.headPressed]}>
      <Icon name="plus" size={16} color={colors.onHead} />
      <Text style={styles.settingsText}>New job</Text>
    </Pressable>
  );
}

const ICONS = { today: 'clock', officedesk: 'dollar', jobs: 'wrench', money: 'dollar', areas: 'chart', manage: 'gear', needs: 'warn', week: 'cal', quotes: 'tag', invoices: 'mail', customers: 'users', sales: 'dollar', tools: 'gear' } as const;

const MARK = require('../../../assets/brand/mark.png');

const useStyles = makeStyles(() => ({
  root: { flex: 1, backgroundColor: colors.head },
  header: { flexDirection: 'row', alignItems: 'center', gap: sp(10), paddingHorizontal: sp(16), paddingTop: sp(8), paddingBottom: sp(26), backgroundColor: colors.head },
  headText: { flex: 1 },
  mark: { width: 44, height: 44, borderRadius: rad(10) },
  back: { minHeight: touch.min - 8, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(14) },
  backText: { fontSize: fs(16), fontWeight: '800', color: colors.onHead },
  title: { fontSize: type.big - 2, fontWeight: '800', color: colors.onHead },
  subtitle: { fontSize: fs(15), fontWeight: '600', color: colors.onHead, opacity: 0.85 },
  settings: { minHeight: touch.min - 8, minWidth: touch.min + 16, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(12) },
  settingsText: { fontSize: fs(15), fontWeight: '800', color: colors.onHead },
  gear: { width: touch.min - 8, height: touch.min - 8, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  actionCol: { alignItems: 'flex-end', gap: sp(4) },
  newJob: { flexDirection: 'row', alignItems: 'center', gap: sp(6), minHeight: touch.min - 12, paddingHorizontal: sp(14), borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.2)' },
  versionLink: { fontSize: fs(12), fontWeight: '700', color: colors.onHead, opacity: 0.85 },
  headPressed: { backgroundColor: 'rgba(255,255,255,0.35)' },
  sheet: { flex: 1, marginTop: sp(-18), backgroundColor: colors.bg, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, overflow: 'hidden' },
  nav: { flexDirection: 'row', backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: sp(6), paddingBottom: sp(4) },
  navItem: { flex: 1, paddingHorizontal: sp(2), minHeight: touch.bar - 6, alignItems: 'center', justifyContent: 'center', gap: sp(2) },
  navBadge: { position: 'absolute', top: -6, right: -16 },
  navPressed: { backgroundColor: colors.info },
  navText: { fontSize: fs(13), fontWeight: '700', color: colors.muted },
  navTextOn: { color: colors.selected, fontWeight: '800' },
}));
