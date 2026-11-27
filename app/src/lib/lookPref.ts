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

/**
 * Where the saved theme came from: nothing saved yet, picked by the person in Settings (always kept),
 * or set by the app for their role (replaced only if their role changes).
 */
export async function loadLookSource(): Promise<'none' | 'manual' | 'auto'> {
  try {
    const raw = await AsyncStorage.getItem(LOOK_PREF_KEY);
    if (!raw) return 'none';
    const d = JSON.parse(raw) as Record<string, unknown>;
    return d.auto === true ? 'auto' : 'manual';
  } catch {
    return 'none';
  }
}

/** Saves the pick, and an instant copy the very first screen can read. The app restarts to draw it. `auto` marks a role default, not the person's own choice. */
export async function saveLook(pick: LookPick, auto = false): Promise<void> {
  try {
    await AsyncStorage.setItem(LOOK_PREF_KEY, JSON.stringify(auto ? { ...pick, auto: true } : pick));
  } catch {
    // Not saved; the instant copy below still applies on the next start.
  }
  writeStartValue('apptheme', pick.theme);
  writeStartValue('palette', pick.palette);
}
