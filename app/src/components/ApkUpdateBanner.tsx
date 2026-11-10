import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApkCheck, checkForApk } from '../lib/apkUpdate';
import { colors, touch, type } from '../theme';

interface Props {
  manifestUrl: string;
  /** The installed APK's native version; null in Expo Go, which turns the check off. */
  currentVersion: string | null | undefined;
  fetchImpl?: typeof fetch;
  openUrl?: (url: string) => Promise<unknown>;
}

/**
 * Shown under the header when a newer APK exists. Download opens the APK
 * link in the browser; Android then shows its own Install screen. "Later"
 * hides it until the app is opened again.
 */
export function ApkUpdateBanner({ manifestUrl, currentVersion, fetchImpl = fetch, openUrl = (u) => Linking.openURL(u) }: Props) {
  const [check, setCheck] = useState<ApkCheck>({ status: 'off' });
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let live = true;
    checkForApk(manifestUrl, currentVersion, fetchImpl).then((c) => {
      if (live) setCheck(c);
    });
    return () => {
      live = false;
    };
  }, [manifestUrl, currentVersion, fetchImpl]);

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
  pressed: { backgroundColor: colors.safety },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  primaryText: { color: colors.onSelected },
});
