import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState, Appearance } from 'react-native';
import { scheme } from '../theme';

/**
 * Screens draw their colors once at start, so when the phone switches
 * between light and dark the app restarts its JS the next time it comes back
 * to the front (never in the middle of typing). Does nothing in development
 * and in tests.
 */
export function useColorSchemeReload() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || __DEV__) return;
      const now = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
      if (now !== scheme) Updates.reloadAsync().catch(() => undefined);
    });
    return () => sub.remove();
  }, []);
}
