import AsyncStorage from '@react-native-async-storage/async-storage';
import { parsePalette } from './themeLook';
import { DEFAULT_THEME, LookPick, parseTheme } from './themes';
import { writeStartValue } from './themeStart';

export const LOOK_PREF_KEY = 'johnsons.theme';

/** The tech's saved theme. Classic (the app as it was) until one is picked. */
export async function loadLook(): Promise<LookPick> {
  try {
    const raw = await AsyncStorage.getItem(LOOK_PREF_KEY);
    const d = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    return { theme: parseTheme(d.theme), palette: parsePalette(d.palette) };
  } catch {
    return { theme: DEFAULT_THEME, palette: 'johnsons' };
  }
}

/** Saves the pick, and an instant copy the very first screen can read. The app restarts to draw it. */
export async function saveLook(pick: LookPick): Promise<void> {
  try {
    await AsyncStorage.setItem(LOOK_PREF_KEY, JSON.stringify(pick));
  } catch {
    // Not saved; the instant copy below still applies on the next start.
  }
  writeStartValue('apptheme', pick.theme);
  writeStartValue('palette', pick.palette);
}
