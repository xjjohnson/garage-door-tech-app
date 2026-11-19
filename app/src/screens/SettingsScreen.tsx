import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useEffect, useRef, useState } from 'react';
import { repaintRestart } from '../lib/useColorSchemeReload';
import { Appearance, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Segmented } from '../components/controls';
import { Caption, IconRow, RowGroup } from '../components/ToolRows';
import { BUILD_INFO, UPDATE_CHANNEL } from '../lib/appVersion';
import { checkAndFetchOta, OtaApi, OtaCheck } from '../lib/otaUpdate';
import { loadShareLocation, saveShareLocation } from '../lib/locationPref';
import { loadThemePref, saveThemePref, ThemePref } from '../lib/themePref';
import { loadLook, saveLook } from '../lib/lookPref';
import { Look, PALETTES, SHAPES, SIZES, LEGACY_LOOK } from '../lib/themeLook';
import { useInvoices } from '../lib/useInvoices';
import { useOwner } from '../lib/useDepartments';
import { useOdoo } from '../lib/useOdoo';
import { colors, look as drawnLook, scheme, touch, type, bw, fs, rad, sp } from '../theme';

interface Props {
  /** expo-updates; tests pass a fake. */
  api?: OtaApi;
  restart?: () => Promise<unknown>;
  buildInfo?: string;
  channel?: string | null;
}

const CHECK_NOTE: Record<OtaCheck, string> = {
  off: 'Updates are off in this build (Expo Go or a test build).',
  current: 'You have the latest.',
  ready: 'Update downloaded. Restart to use it. Your inputs stay.',
  unknown: "Couldn't reach the update server. Check your signal and try again.",
};

/**
 * The setup behind the app, in one place: what version is running and a
 * manual update check, the business details on invoices, the Odoo sign-in
 * for team jobs, and backups. Day-to-day buttons stay on Jobs.
 */
export function SettingsScreen({ api = Updates, restart = () => Updates.reloadAsync(), buildInfo = BUILD_INFO, channel = UPDATE_CHANNEL }: Props) {
  const { business } = useInvoices();
  const odoo = useOdoo();
  const { owner } = useOwner();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<OtaCheck | null>(null);
  const [restartFailed, setRestartFailed] = useState(false);
  // Seven taps on the version opens the hidden Developer screen.
  const taps = useRef<number[]>([]);
  const tapVersion = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 4000), now];
    if (taps.current.length >= 7) {
      taps.current = [];
      router.push('/developer');
    }
  };

  const [shareLocation, setShareLocation] = useState(true);
  useEffect(() => {
    loadShareLocation().then(setShareLocation);
  }, []);
  const [themePref, setThemePref] = useState<ThemePref>('match');
  useEffect(() => {
    loadThemePref().then(setThemePref);
  }, []);
  const chooseTheme = async (pref: ThemePref) => {
    setThemePref(pref);
    await saveThemePref(pref);
    // Screens draw their colors once, so restart the app's JS to repaint.
    const now = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
    if (now !== scheme) repaintRestart(now, restart).catch(() => undefined);
  };

  const [lookPick, setLookPick] = useState<Look>(drawnLook);
  useEffect(() => {
    loadLook().then(setLookPick);
  }, []);
  const changed = lookPick.shape !== drawnLook.shape || lookPick.size !== drawnLook.size || lookPick.palette !== drawnLook.palette;
  const chooseLook = async (next: Look) => {
    setLookPick(next);
    await saveLook(next);
  };

  const check = async () => {
    setChecking(true);
    setResult(await checkAndFetchOta(api));
    setChecking(false);
  };

  const signedIn = odoo.status === 'signedIn' && odoo.client;
  const odooLine = odoo.status === 'loading' || odoo.status === 'signingIn'
    ? 'Checking your sign-in...'
    : signedIn
      ? `Signed in as ${odoo.client!.session.name || odoo.client!.session.login} at ${odoo.client!.session.url}`
      : odoo.saved
        ? `Signed out. Last used ${odoo.saved.url}`
        : 'Not set up';

  const who = signedIn ? odoo.client!.session.name || odoo.client!.session.login : '';
  return (
    <View style={styles.wrap}>
      <RowGroup>
        <IconRow
          icon="users"
          label={signedIn ? business.name || who : 'Sign in to Odoo'}
          detail={signedIn ? `Signed in as ${who}. Tap for your profile` : odooLine}
          href={signedIn ? '/profile' : '/team'}
          testID="settings-odoo"
          last
        />
      </RowGroup>

      {owner ? (
        <>
      <Caption>Setup (owner)</Caption>
      <RowGroup>
        <IconRow icon="gear" label="Management" detail={business.name ? `${business.name}, job types, quote templates, parts, prices, texts and checklists, saved to Odoo` : 'Your business, job types, quote templates, parts, prices, texts and checklists, saved to Odoo'} href="/management" testID="settings-management" last />
      </RowGroup>
        </>
      ) : null}

      <Caption>Location</Caption>
      <Segmented<'on' | 'off'>
        testID="settings-share-location"
        options={[{ value: 'on', label: 'Share while clocked in' }, { value: 'off', label: 'Off' }]}
        value={shareLocation ? 'on' : 'off'}
        onChange={(v) => {
          setShareLocation(v === 'on');
          saveShareLocation(v === 'on');
        }}
      />
      <Text style={styles.shareNote}>While you are clocked in and the app is open, your position goes to your own Odoo so the dispatcher can see where your truck is. Nothing is sent anywhere else.</Text>

      <Caption>Appearance</Caption>
      <Segmented<ThemePref>
        testID="settings-theme"
        options={[{ value: 'match', label: 'Match phone' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
        value={themePref}
        onChange={chooseTheme}
      />

      <Caption>Look</Caption>
      <Text style={styles.shareNote}>Shape</Text>
      <Segmented<Look['shape']> testID="settings-look-shape" options={SHAPES} value={lookPick.shape} onChange={(shape) => chooseLook({ ...lookPick, shape })} />
      <Text style={styles.shareNote}>Size of buttons and text. Legacy is the large look from before.</Text>
      <Segmented<Look['size']> testID="settings-look-size" options={SIZES.map((s) => ({ value: s.value, label: s.label }))} value={lookPick.size} onChange={(size) => chooseLook({ ...lookPick, size })} />
      <Text style={styles.shareNote}>Colors</Text>
      <Segmented<Look['palette']> testID="settings-look-palette" options={PALETTES} value={lookPick.palette} onChange={(palette) => chooseLook({ ...lookPick, palette })} />
      <Text style={styles.shareNote}>Company brand uses the color set on your company in Odoo (and falls back to Johnsons green if there is none).</Text>
      {changed ? <Action label="Restart to use this look" primary onPress={() => restart().catch(() => setRestartFailed(true))} testID="settings-look-restart" /> : null}
      {lookPick.shape === LEGACY_LOOK.shape && lookPick.size === LEGACY_LOOK.size && lookPick.palette === LEGACY_LOOK.palette ? null : (
        <Action label="Back to the legacy look" onPress={() => chooseLook(LEGACY_LOOK)} testID="settings-look-legacy" />
      )}

      <Caption>This phone</Caption>
      <RowGroup>
        <IconRow icon="book" label="Back up or restore" detail="Save everything to a file, or read one back" href="/backup" testID="settings-backup" last />
      </RowGroup>

      <Caption>About this app</Caption>
      <Pressable onPress={tapVersion} accessibilityRole="text" style={styles.card} testID="settings-version">
        <Text style={styles.value} testID="build-info">
          {buildInfo}
        </Text>
        {owner ? <Text style={styles.meta}>Update channel: {channel ?? 'none (development)'}</Text> : null}
      </Pressable>
      <Action label={checking ? 'Checking...' : 'Check for update'} disabled={checking} onPress={check} testID="settings-check-update" />
      {result ? (
        <Text style={styles.note} testID="settings-update-note" accessibilityLiveRegion="polite">
          {restartFailed ? "Couldn't restart. Close and reopen the app to use it." : CHECK_NOTE[result]}
        </Text>
      ) : null}
      {result === 'ready' ? (
        <Action label="Restart now" primary onPress={() => restart().catch(() => setRestartFailed(true))} testID="settings-restart" />
      ) : null}
    </View>
  );
}

function Action({ label, onPress, primary, disabled, testID }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={({ pressed }) => [styles.button, primary && styles.primary, pressed && styles.pressed]}
    >
      <Text style={[styles.buttonText, primary && styles.primaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: sp(12) },
  card: { borderWidth: bw(1.5), borderColor: colors.border, borderRadius: rad(12), padding: sp(12), backgroundColor: colors.card, gap: sp(4) },
  shareNote: { fontSize: fs(15), fontWeight: '600', color: colors.muted, lineHeight: fs(21) },
  value: { fontSize: type.body, fontWeight: '800', color: colors.text },
  meta: { fontSize: fs(16), fontWeight: '600', color: colors.muted },
  note: { fontSize: type.body, fontWeight: '700', color: colors.text },
  button: { minHeight: touch.min, borderRadius: rad(14), borderWidth: bw(1.5), borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sp(12), backgroundColor: colors.card },
  primary: { backgroundColor: colors.selected },
  primaryText: { color: colors.onSelected },
  pressed: { backgroundColor: colors.info },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
});
