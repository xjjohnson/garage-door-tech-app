import { useSyncExternalStore } from 'react';

/** Figtree, in the weights the app uses. Loaded once at start; until then (or if it can't load) the phone's own font is used. */
const FAMILIES = {
  '400': 'Figtree_400Regular',
  '500': 'Figtree_500Medium',
  '600': 'Figtree_600SemiBold',
  '700': 'Figtree_700Bold',
  '800': 'Figtree_800ExtraBold',
  '900': 'Figtree_900Black',
} as const;

let ready = false;
const listeners = new Set<() => void>();

/** Loads Figtree. Never throws: a phone that can't load it keeps its own font. */
export async function loadFonts(): Promise<void> {
  if (ready) return;
  try {
    const { loadAsync } = require('expo-font') as typeof import('expo-font');
    const f = require('@expo-google-fonts/figtree') as Record<string, number>;
    const map: Record<string, number> = {};
    for (const name of Object.values(FAMILIES)) map[name] = f[name];
    await loadAsync(map);
    ready = true;
    listeners.forEach((l) => l());
  } catch {
    /* system font */
  }
}

export function useFontsReady(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => ready,
    () => false,
  );
}

/** The Figtree family for a fontWeight value (normal, bold or 100-900). */
export function familyFor(weight: unknown): string {
  const w = weight === 'bold' ? '700' : weight === 'normal' || weight == null ? '400' : String(weight);
  if (w === '100' || w === '200' || w === '300' || w === '400') return FAMILIES['400'];
  if (w === '500') return FAMILIES['500'];
  if (w === '600') return FAMILIES['600'];
  if (w === '700') return FAMILIES['700'];
  if (w === '800') return FAMILIES['800'];
  return FAMILIES['900'];
}
