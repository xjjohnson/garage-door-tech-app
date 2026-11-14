import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { ApkCheck, checkForApk } from '../lib/apkUpdate';
import { isCheckDue } from '../lib/otaUpdate';
import { useAppForeground } from '../lib/useAppForeground';
import { colors, touch, type } from '../theme';

interface Props {
  manifestUrl: string;
  /** The installed APK's native version; null in Expo Go, which turns the check off. */
  currentVersion: string | null | undefined;
  fetchImpl?: typeof fetch;
  openUrl?: (url: string) => Promise<unknown>;
  now?: () => number;
}

/**
 * Shown under the header when a newer APK exists. Download opens the APK
 * link in the browser; Android then shows its own Install screen. "Later"
 * hides it until the app is opened again. It checks when the app opens and
 * again each time the app comes back to the screen, at most every ten
 * minutes, so a phone that never closes the app still hears about it.
 */
export function ApkUpdateBanner({ manifestUrl, currentVersion, fetchImpl = fetch, openUrl = (u) => Linking.openURL(u), now = Date.now }: Props) {
  const [check, setCheck] = useState<ApkCheck>({ status: 'off' });
  const [hidden, setHidden] = useState(false);
  const [round, setRound] = useState(0);
  const lastCheckAt = useRef<number | undefined>(undefined);

  useAppForeground(() => {
    if (isCheckDue(lastCheckAt.current, now())) setRound((r) => r + 1);
  });

  useEffect(() => {
    let live = true;
    lastCheckAt.current = now();
    checkForApk(manifestUrl, currentVersion, fetchImpl).then((c) => {
      // A failed re-check (no signal) keeps what the last one found.
      if (live && c.status !== 'unknown') setCheck(c);
    });
    return () => {
      live = false;
    };
  }, [manifestUrl, currentVersion, fetchImpl, now, round]);

  if (check.status !== 'update' || hidden) return null;
  const { version, apkUrl } = check;

  return (
    <View style={styles.banner} testID="apk-update-banner" accessibilityRole="alert">
      <Text style={styles.title}>New app version {version}</Text>
      <Text style={styles.body}>
        This version needs a fresh install to keep getting updates. Download it, then tap Install. Your saved inputs stay.
      </Text>
      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}
          onPress={() => {
            openUrl(apkUrl).catch(() => undefined);
          }}
          accessibilityRole="button"
          testID="apk-download"
        >
          <Text style={[styles.buttonText, styles.primaryText]}>Download</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={() => setHidden(true)}
          accessibilityRole="button"
          testID="apk-later"
        >
          <Text style={styles.buttonText}>Later</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: 10, borderWidth: 3, borderColor: colors.border, backgroundColor: colors.info, gap: 8 },
  title: { fontSize: type.value, fontWeight: '900', color: colors.text },
  body: { fontSize: type.body, color: colors.text, lineHeight: 24 },
  row: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected, flex: 2 },
  pressed: { backgroundColor: colors.info },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  primaryText: { color: colors.onSelected },
});
