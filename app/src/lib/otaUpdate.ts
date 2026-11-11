/**
 * Knowing when an over-the-air update is ready.
 *
 * The app already downloads an over-the-air update by itself at launch
 * (app.json "checkAutomatically": "ON_LOAD"), but it only switches to it the
 * next time the app is fully closed and opened. Techs rarely close the app,
 * so it also looks again whenever it comes back to the screen, downloads what
 * it finds, and then says "Update ready" with a Restart button. It never
 * restarts by itself, so nobody loses their place mid-job.
 */

/** The parts of expo-updates this needs, so tests can pass a fake. */
export interface OtaApi {
  isEnabled: boolean;
  checkForUpdateAsync(): Promise<{ isAvailable: boolean }>;
  fetchUpdateAsync(): Promise<{ isNew: boolean }>;
}

/** off: Expo Go or a dev build. current: nothing new. ready: downloaded, restart to use it. */
export type OtaCheck = 'off' | 'current' | 'ready' | 'unknown';

/** Look at most this often when the app keeps coming back to the screen. */
export const OTA_CHECK_GAP_MS = 10 * 60 * 1000;

/** True on the first look, and again once the gap has passed since the last one. */
export function isCheckDue(lastCheckAt: number | undefined, now: number, gapMs = OTA_CHECK_GAP_MS): boolean {
  return lastCheckAt === undefined || now - lastCheckAt >= gapMs;
}

/**
 * Check for an update and download it. Never throws: with no signal or an
 * error it says "unknown" and the app carries on with what it has.
 */
export async function checkAndFetchOta(api: OtaApi): Promise<OtaCheck> {
  if (!api.isEnabled) return 'off';
  try {
    const check = await api.checkForUpdateAsync();
    if (!check.isAvailable) return 'current';
    const fetched = await api.fetchUpdateAsync();
    return fetched.isNew ? 'ready' : 'current';
  } catch {
    return 'unknown';
  }
}
