/**
 * Which version of the app this is: "johnsons" (today's app) or "fscrew" (the
 * public one). Both are built from this code (see app/flavors.js), with their
 * own name, icon and Android id, and both get the same over-the-air updates.
 *
 * The version is read from the app's own Android id, because an over-the-air
 * update carries one config for everybody, and an APK made before this
 * existed has no flavor. Anything that can't be told is Johnsons, so those
 * phones keep working exactly as they did. Kept free of React.
 */
import * as fs from 'expo-file-system';
import type { Industry } from './lib/industry';

export type FlavorId = 'johnsons' | 'fscrew';

export interface Flavor {
  id: FlavorId;
  appId: string;
  /** Where the newest APK of this version is announced (a small file next to the APK on GitHub). */
  manifestUrl: string;
  /** The industry a business starts on until its owner picks one in Management. */
  defaultIndustry: Industry;
}

const DOWNLOADS = 'https://github.com/xjjohnson/garage-door-tech-app/releases/download/latest-apk';

export const FLAVORS: Record<FlavorId, Flavor> = {
  johnsons: { id: 'johnsons', appId: 'com.xjjohnson.garagedoortech', manifestUrl: `${DOWNLOADS}/version.json`, defaultIndustry: 'garage-doors' },
  fscrew: { id: 'fscrew', appId: 'com.xjjohnson.fscrew', manifestUrl: `${DOWNLOADS}/fs-crew-version.json`, defaultIndustry: 'other' },
};

/** The version for an Android app id; anything unknown is Johnsons. */
export function flavorForAppId(appId: string | null | undefined): Flavor {
  return Object.values(FLAVORS).find((f) => f.appId === appId) ?? FLAVORS.johnsons;
}

/** The app id inside the phone's app folder ("/data/user/0/<id>/files/..."), or null when it can't be read. */
export function appIdFromPath(uri: string | null | undefined): string | null {
  const m = /\/(?:data\/user\/\d+|data\/data)\/([A-Za-z0-9_.]+)\//.exec(uri ?? '');
  return m ? m[1] : null;
}

let cached: Flavor | null = null;

export function currentFlavor(): Flavor {
  if (cached) return cached;
  let uri: string | null = null;
  try {
    uri = String(fs.Paths.document.uri);
  } catch {
    // Not on a phone (tests, web): Johnsons.
  }
  cached = flavorForAppId(appIdFromPath(uri));
  return cached;
}

/** For tests. */
export function resetFlavorForTests() {
  cached = null;
}
