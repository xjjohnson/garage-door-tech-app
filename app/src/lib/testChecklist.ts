/**
 * The "What to test in this release" tick-list. Ticks are kept on the phone
 * only (nothing goes to Odoo), one set per release. Also remembers which
 * release the Developer screen's changelog was last looked at, to point out
 * what is new.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const ticksKey = (release: string) => `dev.testTicks/${release}`;
const SEEN_KEY = 'dev.changelogSeen';

export type Ticks = Record<number, 'pass' | 'problem'>;

export async function loadTicks(release: string): Promise<Ticks> {
  try {
    const raw = await AsyncStorage.getItem(ticksKey(release));
    const d = raw ? JSON.parse(raw) : null;
    return d && typeof d === 'object' ? (d as Ticks) : {};
  } catch {
    return {};
  }
}

/** Set an item's mark; setting the same mark again clears it. Returns the new marks. */
export async function setTick(release: string, index: number, mark: 'pass' | 'problem'): Promise<Ticks> {
  const t = await loadTicks(release);
  if (t[index] === mark) delete t[index];
  else t[index] = mark;
  try {
    await AsyncStorage.setItem(ticksKey(release), JSON.stringify(t));
  } catch {
    // Not saved; it still shows until the screen closes.
  }
  return t;
}

export async function loadSeenRelease(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export async function saveSeenRelease(release: string): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, release);
  } catch {
    // Not saved.
  }
}

export function doneCount(ticks: Ticks, total: number): number {
  return Object.keys(ticks).filter((k) => +k < total && ticks[+k] === 'pass').length;
}
