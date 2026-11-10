/**
 * Where the app looks for a newer APK. The build publishes a small
 * version.json next to each APK:
 *
 *   { "version": "0.2.0", "apkUrl": "https://.../spring-calc.apk" }
 *
 * Leave this empty to turn the check off. It can be changed later with an
 * over-the-air update, since it's plain JavaScript.
 */
export const APK_MANIFEST_URL = '';
