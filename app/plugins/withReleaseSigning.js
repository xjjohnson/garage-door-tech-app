// Signs release builds with the app's own private key instead of the public
// debug key that Expo's Android template uses.
//
// `expo prebuild` regenerates android/ from scratch on every build, so the
// change to android/app/build.gradle is made here, as a config plugin, rather
// than by editing the generated file. It adds a "release" signing config that
// reads the key from environment variables:
//
//   ANDROID_KEYSTORE_PATH      path to the .p12 keystore file
//   ANDROID_KEYSTORE_PASSWORD  its password
//   ANDROID_KEY_ALIAS          the key's alias inside it
//   ANDROID_KEY_PASSWORD       optional; defaults to the keystore password
//                              (a PKCS12 keystore has only one password)
//
// In GitHub Actions these come from repo secrets (see app/README.md,
// "Signing key"). A release build without them stops with an error; it never
// falls back to the debug key. Debug builds are unchanged.
//
// If Expo's template changes so the expected lines aren't found, prebuild
// fails here rather than quietly producing a debug-signed release.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// withReleaseSigning';

const RELEASE_SIGNING_CONFIG = `
        ${MARKER}: the app's own key, from the environment. Never the debug key above.
        release {
            def releaseKeystore = System.getenv('ANDROID_KEYSTORE_PATH')
            if (releaseKeystore) {
                storeFile file(releaseKeystore)
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD') ?: System.getenv('ANDROID_KEYSTORE_PASSWORD')
            }
        }`;

const RELEASE_GUARD = `
${MARKER}: stop any release build that has no signing key, before it starts.
gradle.taskGraph.whenReady { graph ->
    def wantsRelease = graph.allTasks.any { it.project == project && it.name.toLowerCase().contains('release') }
    if (wantsRelease) {
        def missing = ['ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS'].findAll { !System.getenv(it) }
        if (missing) {
            throw new GradleException("Release builds are signed with the app's own key, but these are not set: \${missing.join(', ')}. See app/README.md, 'Signing key'. This build will not fall back to the public debug key.")
        }
        if (!file(System.getenv('ANDROID_KEYSTORE_PATH')).isFile()) {
            throw new GradleException("ANDROID_KEYSTORE_PATH does not point to a keystore file.")
        }
    }
}
`;

function addReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;

  // 1. Add the release signing config right after the debug one.
  const debugConfig = /(signingConfigs\s*\{\s*debug\s*\{[^{}]*\})/;
  if (!debugConfig.test(gradle)) {
    throw new Error('withReleaseSigning: could not find signingConfigs { debug { ... } } in android/app/build.gradle.');
  }
  let out = gradle.replace(debugConfig, `$1\n${RELEASE_SIGNING_CONFIG}`);

  // 2. Point the release build type at it.
  const releaseUsesDebug = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/;
  if (!releaseUsesDebug.test(out)) {
    throw new Error('withReleaseSigning: could not find "signingConfig signingConfigs.debug" in the release build type.');
  }
  out = out.replace(releaseUsesDebug, '$1signingConfig signingConfigs.release');

  // 3. Fail early and clearly when the key is missing.
  return `${out.trimEnd()}\n${RELEASE_GUARD}`;
}

const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: expected a Groovy build.gradle.');
    }
    cfg.modResults.contents = addReleaseSigning(cfg.modResults.contents);
    return cfg;
  });

module.exports = withReleaseSigning;
module.exports.addReleaseSigning = addReleaseSigning;
