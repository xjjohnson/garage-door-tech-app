// Adds build-time values on top of app.json.
// ANDROID_VERSION_CODE is set by the GitHub Actions APK build (the run number),
// so each APK has a higher version code than the last and installs over it.
// plugins/withReleaseSigning.js signs release builds with the app's own key
// (from GitHub secrets) instead of the public debug key.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    versionCode: Number(process.env.ANDROID_VERSION_CODE ?? 1),
  },
  plugins: [...(config.plugins ?? []), './plugins/withReleaseSigning'],
});
