/**
 * Feature flags: switches for work in progress and for developer tools,
 * hidden on the Developer screen so techs never see them. Saved on the phone
 * so they survive a restart. A flag's own default applies until it's changed.
 * Add a flag by adding a line to FEATURE_FLAGS and asking `featureOn(id)`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const FLAGS_STORAGE_KEY = 'feature-flags/v1';

export interface FeatureFlag {
  id: string;
  label: string;
  detail: string;
  default: boolean;
}

export const FEATURE_FLAGS: FeatureFlag[] = [
  { id: 'callTrace', label: 'Record Odoo calls', detail: 'Keeps the last 50 calls (model and method only) for the Odoo calls trace.', default: true },
  { id: 'logSlowCalls', label: 'Log slow Odoo calls', detail: 'Writes a warning to the log for any Odoo call that takes over 3 seconds.', default: false },
];

let saved: Record<string, boolean> = {};
const listeners = new Set<() => void>();

export function featureOn(id: string): boolean {
  const f = FEATURE_FLAGS.find((x) => x.id === id);
  return id in saved ? saved[id] : f?.default ?? false;
}

export async function loadFeatureFlags(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(FLAGS_STORAGE_KEY);
    const d = raw ? JSON.parse(raw) : null;
    if (d && typeof d === 'object') saved = Object.fromEntries(Object.entries(d).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean>;
  } catch {
    // A damaged entry just means the defaults.
  }
  listeners.forEach((l) => l());
}

export async function setFeature(id: string, on: boolean): Promise<void> {
  saved = { ...saved, [id]: on };
  listeners.forEach((l) => l());
  await AsyncStorage.setItem(FLAGS_STORAGE_KEY, JSON.stringify(saved)).catch(() => undefined);
}

export function onFeatureFlags(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** For tests. */
export function resetFeatureFlags() {
  saved = {};
}
