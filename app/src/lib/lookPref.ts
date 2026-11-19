import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEGACY_LOOK, Look, parsePalette, parseShape, parseSize } from './themeLook';
import { writeStartValue } from './themeStart';

export const LOOK_PREF_KEY = 'johnsons.look';

/** The tech's saved look. Legacy (the app as it was) until one is picked. */
export async function loadLook(): Promise<Look> {
  try {
    const raw = await AsyncStorage.getItem(LOOK_PREF_KEY);
    const d = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    return { shape: parseShape(d.shape), size: parseSize(d.size), palette: parsePalette(d.palette) };
  } catch {
    return LEGACY_LOOK;
  }
}

/** Saves the look, and an instant copy the very first screen can read. The app restarts to draw it. */
export async function saveLook(look: Look): Promise<void> {
  try {
    await AsyncStorage.setItem(LOOK_PREF_KEY, JSON.stringify(look));
  } catch {
    // Not saved; the instant copy below still applies on the next start.
  }
  writeStartValue('shape', look.shape);
  writeStartValue('size', look.size);
  writeStartValue('palette', look.palette);
}
