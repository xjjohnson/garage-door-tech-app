// Adds build-time values on top of app.json.
// ANDROID_VERSION_CODE is set by the GitHub Actions APK build (the run number),
// so each APK has a higher version code than the last and installs over it.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    versionCode: Number(process.env.ANDROID_VERSION_CODE ?? 1),
  },
});
