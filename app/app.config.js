// Adds build-time values on top of app.json.
// ANDROID_VERSION_CODE is set by the GitHub Actions APK build (the run number),
// so each APK has a higher version code than the last and installs over it.
// GITHUB_RUN_NUMBER is the fallback so an over-the-air update published from
// a workflow run records that run's number too; the screen shows it as the
// build number. Neither changes the native app's runtime version.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    versionCode: Number(process.env.ANDROID_VERSION_CODE || process.env.GITHUB_RUN_NUMBER || 1),
  },
});
