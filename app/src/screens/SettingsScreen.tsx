import type { Href } from 'expo-router';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SectionTitle } from '../components/controls';
import { BUILD_INFO, UPDATE_CHANNEL } from '../lib/appVersion';
import { checkAndFetchOta, OtaApi, OtaCheck } from '../lib/otaUpdate';
import { useInvoices } from '../lib/useInvoices';
import { useOdoo } from '../lib/useOdoo';
import { colors, touch, type } from '../theme';

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

  return (
    <View style={styles.wrap}>
      <SectionTitle first>App version</SectionTitle>
      <Pressable onPress={tapVersion} accessibilityRole="text" style={styles.card} testID="settings-version">
        <Text style={styles.value} testID="build-info">
          {buildInfo}
        </Text>
        <Text style={styles.meta}>Update channel: {channel ?? 'none (development)'}</Text>
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

      <SectionTitle>Business</SectionTitle>
      <Link
        label="Your business"
        detail={business.name ? `${business.name}: name, payment handles and review link` : 'Name, payment handles and review link for invoices'}
        href="/business"
        testID="settings-business"
      />
      <Link label="Price sheet" detail="Parts and labor prices for quotes" href="/price-sheet" testID="settings-price-sheet" />

      <SectionTitle>Odoo (team jobs)</SectionTitle>
      <Link label={signedIn ? 'Odoo account' : 'Sign in to Odoo'} detail={odooLine} href="/team" testID="settings-odoo" />

      <SectionTitle>Data on this phone</SectionTitle>
      <Link label="Back up or restore" detail="Save everything to a file, or read one back" href="/backup" testID="settings-backup" />
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

function Link({ label, detail, href, testID }: { label: string; detail: string; href: Href; testID: string }) {
  return (
    <Pressable onPress={() => router.push(href)} accessibilityRole="button" accessibilityHint={detail} testID={testID} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
      <View style={styles.linkText}>
        <Text style={styles.buttonText}>{label}</Text>
        <Text style={styles.meta}>{detail}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  card: { borderWidth: 2, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: colors.card, gap: 4 },
  value: { fontSize: type.body, fontWeight: '800', color: colors.text },
  meta: { fontSize: 16, fontWeight: '600', color: colors.muted },
  note: { fontSize: type.body, fontWeight: '700', color: colors.text },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected },
  primaryText: { color: colors.onSelected },
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  link: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8, backgroundColor: colors.bg },
  linkText: { flex: 1, gap: 2 },
  chevron: { fontSize: type.big, fontWeight: '900', color: colors.text },
});
