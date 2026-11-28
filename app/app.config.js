// Adds build-time values on top of app.json.
// APP_FLAVOR picks which version of the app is built (see flavors.js); the
// default is johnsons, so a plain build is the Johnsons app as before.
// ANDROID_VERSION_CODE is set by the GitHub Actions APK build (the run number),
// so each APK has a higher version code than the last and installs over it.
// GITHUB_RUN_NUMBER is the fallback so an over-the-air update published from
// a workflow run records that run's number too; the screen shows it as the
// build number. Neither changes the native app's runtime version.
const flavors = require('./flavors');

module.exports = ({ config }) => {
  const id = process.env.APP_FLAVOR || 'johnsons';
  const f = flavors[id];
  if (!f || typeof f !== 'object') throw new Error(`Unknown APP_FLAVOR "${id}". Known: ${Object.keys(flavors).filter((k) => k !== 'REPO_DL').join(', ')}`);
  return {
    ...config,
    name: f.name,
    scheme: f.scheme,
    icon: f.icon,
    ios: { ...config.ios, bundleIdentifier: f.appId },
    web: { ...config.web, favicon: f.favicon },
    extra: { ...config.extra, flavor: id },
    android: {
      ...config.android,
      package: f.appId,
      adaptiveIcon: { ...config.android.adaptiveIcon, ...f.adaptiveIcon },
      versionCode: Number(process.env.ANDROID_VERSION_CODE || process.env.GITHUB_RUN_NUMBER || 1),
    },
  };
};
