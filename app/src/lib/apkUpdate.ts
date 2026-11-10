/**
 * Knowing when the phone needs a new APK.
 *
 * Over-the-air updates only carry JavaScript, and each one only reaches APKs
 * with the same native version (the app.json "version"). When a change needs
 * new native code, the version goes up and old APKs stop getting updates. So
 * the app also checks a small version.json that the build publishes next to
 * the APK, and offers the download when that version is newer than its own.
 */

export interface ApkManifest {
  version: string;
  apkUrl: string;
}

export type ApkCheck =
  | { status: 'off' }
  | { status: 'current' }
  | { status: 'unknown' }
  | { status: 'update'; version: string; apkUrl: string };

/** "0.10.0" vs "0.9.2": -1, 0 or 1. Missing parts count as 0; other text is ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split('.').map((p) => Number.parseInt(p, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

const VERSION = /^\d+(\.\d+){0,3}$/;

/** Accept only a plain version and an https link, so a bad file can't point the phone anywhere odd. */
export function parseManifest(data: unknown): ApkManifest | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const { version, apkUrl } = data as Record<string, unknown>;
  if (typeof version !== 'string' || !VERSION.test(version)) return undefined;
  if (typeof apkUrl !== 'string' || !/^https:\/\/[^\s]+$/.test(apkUrl)) return undefined;
  return { version, apkUrl };
}

type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * Look for a newer APK. Never throws: with no signal, a bad file or no
 * address set, it says so and the app carries on as it is.
 */
export async function checkForApk(manifestUrl: string, currentVersion: string | null | undefined, fetchImpl: Fetch): Promise<ApkCheck> {
  if (!manifestUrl || !currentVersion) return { status: 'off' };
  try {
    const res = await fetchImpl(manifestUrl, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) return { status: 'unknown' };
    const manifest = parseManifest(await res.json());
    if (!manifest) return { status: 'unknown' };
    if (compareVersions(manifest.version, currentVersion) > 0) {
      return { status: 'update', version: manifest.version, apkUrl: manifest.apkUrl };
    }
    return { status: 'current' };
  } catch {
    return { status: 'unknown' };
  }
}
