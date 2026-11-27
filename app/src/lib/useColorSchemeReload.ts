import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState, Appearance } from 'react-native';
import { scheme } from '../theme';
import { applyThemePref, loadThemePref } from './themePref';
import { writeStartChoice } from './themeStart';

function nowScheme() {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

export const RELOAD_GUARD_KEY = 'johnsons.themeReload';
/** A repaint restart for the same colors is not repeated within this long: it didn't take, and trying again would loop. */
export const RELOAD_GUARD_MS = 10 * 60 * 1000;

/** Whether a restart toward `target` was already tried recently (a record is kept so a restart that didn't take can't repeat). */
export async function reloadAlreadyTried(target: string, now = Date.now()): Promise<boolean> {
  try {
    const [t, at] = ((await AsyncStorage.getItem(RELOAD_GUARD_KEY)) ?? '').split(':');
    return t === target && now - Number(at) < RELOAD_GUARD_MS;
  } catch {
    return false;
  }
}

/** Restarts the app's JS to repaint in `target` colors, at most once per RELOAD_GUARD_MS for the same colors. Returns whether it restarted. */
export async function repaintRestart(target: string, restart: () => Promise<unknown> = () => Updates.reloadAsync()): Promise<boolean> {
  if (await reloadAlreadyTried(target)) return false;
  try {
    await AsyncStorage.setItem(RELOAD_GUARD_KEY, `${target}:${Date.now()}`);
  } catch {
    return false; // Can't record it, so don't risk a loop.
  }
  await restart().catch(() => undefined);
  return true;
}

function restartIfChanged() {
  if (__DEV__) return;
  const now = nowScheme();
  if (now !== scheme) repaintRestart(now).catch(() => undefined);
}

/**
 * Screens draw their colors once at start. The tech's choice (Settings: Light,
 * Dark or Match phone) is read as the app opens and applied; when the result
 * differs from what the screens drew, or the phone switches while the app is
 * away, the app restarts its JS (never in the middle of typing). Does nothing
 * in development and in tests.
 */
export function useColorSchemeReload() {
  useEffect(() => {
    let alive = true;
    loadThemePref().then((pref) => {
      if (!alive) return;
      // Keep the instant copy in step (it's missing right after an update from an older version).
      writeStartChoice(pref === 'match' ? null : pref);
      applyThemePref(pref);
      restartIfChanged();
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') restartIfChanged();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
}
