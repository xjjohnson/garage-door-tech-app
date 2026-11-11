import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { checkAndFetchOta, isCheckDue, type OtaApi } from '../lib/otaUpdate';
import { useAppForeground } from '../lib/useAppForeground';
import { colors, touch, type } from '../theme';

interface Props {
  /** True when expo-updates has already downloaded an update on its own (at launch). */
  pending?: boolean;
  api?: OtaApi;
  restart?: () => Promise<unknown>;
  now?: () => number;
}

const defaultApi: OtaApi = Updates;
const defaultRestart = () => Updates.reloadAsync();

/**
 * A bar above the bottom tabs once an over-the-air update has downloaded.
 * Restart switches to it right away; saved inputs come back after the
 * restart. Later hides it until the app is next opened, which also
 * switches to the update. It checks when the app opens and each time it comes back to the
 * screen, at most every ten minutes.
 */
export function UpdateReadyBar({ pending = false, api = defaultApi, restart = defaultRestart, now = Date.now }: Props) {
  const [found, setFound] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const lastCheckAt = useRef<number | undefined>(undefined);
  const live = useRef(true);

  const look = useCallback(() => {
    if (!isCheckDue(lastCheckAt.current, now())) return;
    lastCheckAt.current = now();
    checkAndFetchOta(api).then((result) => {
      if (live.current && result === 'ready') setFound(true);
    });
  }, [api, now]);

  useEffect(() => {
    live.current = true;
    look();
    return () => {
      live.current = false;
    };
  }, [look]);

  useAppForeground(look);

  if (!(found || pending) || hidden) return null;

  return (
    <View style={styles.bar} testID="update-ready-bar" accessibilityRole="alert" accessibilityLiveRegion="polite">
      <View style={styles.textWrap}>
        <Text style={styles.title}>Update ready</Text>
        <Text style={styles.body}>{failed ? "Couldn't restart. Close and reopen the app to use it." : 'Restart to use it. Your inputs stay.'}</Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.button, styles.primary, (pressed || restarting) && styles.pressed]}
        disabled={restarting}
        onPress={() => {
          setRestarting(true);
          setFailed(false);
          restart().catch(() => {
            if (!live.current) return;
            setRestarting(false);
            setFailed(true);
          });
        }}
        accessibilityRole="button"
        accessibilityLabel="Restart to update"
        testID="update-restart"
      >
        <Text style={[styles.buttonText, styles.primaryText, restarting && styles.pressedText]}>{restarting ? 'Restarting' : 'Restart'}</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        onPress={() => setHidden(true)}
        accessibilityRole="button"
        accessibilityLabel="Update later"
        testID="update-later"
      >
        <Text style={styles.buttonText}>Later</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Safety yellow so it's seen, sitting on the black bottom tabs.
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.safety, borderTopWidth: 3, borderTopColor: colors.border },
  textWrap: { flex: 1 },
  title: { fontSize: type.body, fontWeight: '900', color: colors.text },
  body: { fontSize: 15, fontWeight: '600', color: colors.text },
  button: { minHeight: touch.min, paddingHorizontal: 14, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected },
  pressed: { backgroundColor: colors.muted },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  primaryText: { color: colors.onSelected },
  pressedText: { color: colors.onSelected },
});
