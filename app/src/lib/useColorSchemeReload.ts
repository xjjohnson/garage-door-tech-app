import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState, Appearance } from 'react-native';
import { scheme } from '../theme';
import { applyThemePref, loadThemePref } from './themePref';

function nowScheme() {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

function restartIfChanged() {
  if (__DEV__) return;
  if (nowScheme() !== scheme) Updates.reloadAsync().catch(() => undefined);
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
