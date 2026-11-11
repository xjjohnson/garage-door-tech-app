import * as Updates from 'expo-updates';
import { formatBuildInfo, shortVersion } from './buildInfo';

// Read once: what's running doesn't change until the app restarts.

/** The full build line, such as "Version 0.4.0 · build 12 · update 1a2b3c4d, Nov 11". */
export const BUILD_INFO = formatBuildInfo({
  runtimeVersion: Updates.runtimeVersion,
  updateId: Updates.updateId,
  createdAt: Updates.createdAt,
  isEmbeddedLaunch: Updates.isEmbeddedLaunch,
  manifest: Updates.manifest,
});

/** "v0.4.0", shown in the header on every section. */
export const SHORT_VERSION = shortVersion(Updates.runtimeVersion);

/** The update channel this APK listens to ("production"), or null in Expo Go and dev builds. */
export const UPDATE_CHANNEL: string | null = Updates.channel ?? null;
