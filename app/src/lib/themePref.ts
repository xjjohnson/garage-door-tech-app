import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { writeStartChoice } from './themeStart';

export type ThemePref = 'match' | 'light' | 'dark';
export const THEME_PREF_KEY = 'johnsons.themePref';

export async function loadThemePref(): Promise<ThemePref> {
  try {
    const v = await AsyncStorage.getItem(THEME_PREF_KEY);
    return v === 'light' || v === 'dark' ? v : 'match';
  } catch {
    return 'match';
  }
}

/** Makes the phone report the chosen scheme to this app ('match' hands control back to the phone). */
export function applyThemePref(pref: ThemePref) {
  try {
    Appearance.setColorScheme?.(pref === 'match' ? 'unspecified' : pref);
  } catch {
    // Older runtimes: the choice then takes effect on the phone's own setting only.
  }
}

export async function saveThemePref(pref: ThemePref): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_PREF_KEY, pref);
  } catch {
    // Not saved; it still applies until the app closes.
  }
  writeStartChoice(pref === 'match' ? null : pref);
  applyThemePref(pref);
}
