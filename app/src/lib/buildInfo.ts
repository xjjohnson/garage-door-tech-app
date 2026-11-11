/**
 * One line that says exactly what code is running, so a tech can tell at a
 * glance whether the phone has the latest:
 *
 *   Version 0.1.0 · build 7 · update 1a2b3c4d, Nov 10
 *   Version 0.1.0 · build 7 · as installed
 *
 * The version is the installed APK's native version (the app.json "version",
 * which is also the runtime version). The build number is the GitHub run that
 * produced the running code: the APK's own build, or the run that published
 * the over-the-air update it's on now. The update id appears only when an
 * over-the-air update is running.
 */

export interface BuildSource {
  runtimeVersion: string | null | undefined;
  updateId: string | null | undefined;
  createdAt: Date | null | undefined;
  isEmbeddedLaunch: boolean;
  manifest: unknown;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The build number stored in the running code's app config, if any. */
export function buildNumberFrom(manifest: unknown): number | undefined {
  const m = manifest as { extra?: { expoClient?: { android?: { versionCode?: unknown } } } } | null | undefined;
  const code = m?.extra?.expoClient?.android?.versionCode;
  return typeof code === 'number' && Number.isFinite(code) && code > 1 ? code : undefined;
}

export function formatBuildInfo(s: BuildSource): string {
  if (!s.runtimeVersion) return 'Development version';
  const parts = [`Version ${s.runtimeVersion}`];
  const build = buildNumberFrom(s.manifest);
  if (build !== undefined) parts.push(`build ${build}`);
  if (s.isEmbeddedLaunch || !s.updateId) {
    parts.push('as installed');
  } else {
    const id = s.updateId.replace(/-/g, '').slice(0, 8);
    const d = s.createdAt;
    parts.push(d && !Number.isNaN(d.getTime()) ? `update ${id}, ${MONTHS[d.getMonth()]} ${d.getDate()}` : `update ${id}`);
  }
  return parts.join(' · ');
}

/** The short version for the header, such as "v0.4.0". */
export function shortVersion(runtimeVersion: string | null | undefined): string {
  return runtimeVersion ? `v${runtimeVersion}` : 'dev';
}
