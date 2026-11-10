// The config plugin that makes release APKs use the app's own key
// (plugins/withReleaseSigning.js). The real build.gradle comes from Expo's
// template at build time; this is the part of it the plugin edits.
const { addReleaseSigning } = require('../../plugins/withReleaseSigning') as { addReleaseSigning: (gradle: string) => string };

const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}
`;

describe('release signing plugin', () => {
  const out = addReleaseSigning(TEMPLATE);

  it('signs the release build type with the release key', () => {
    const release = out.slice(out.indexOf('buildTypes'));
    const releaseBlock = release.slice(release.indexOf('release {'));
    expect(releaseBlock).toMatch(/signingConfig signingConfigs\.release/);
    expect(releaseBlock).not.toMatch(/signingConfig signingConfigs\.debug/);
  });

  it('keeps debug builds on the debug key', () => {
    const debugBlock = out.slice(out.indexOf('buildTypes'), out.indexOf('release {', out.indexOf('buildTypes')));
    expect(debugBlock).toMatch(/signingConfig signingConfigs\.debug/);
  });

  it('reads the key from the environment, never from the repo', () => {
    expect(out).toMatch(/System\.getenv\('ANDROID_KEYSTORE_PATH'\)/);
    expect(out).toMatch(/System\.getenv\('ANDROID_KEYSTORE_PASSWORD'\)/);
    expect(out).toMatch(/System\.getenv\('ANDROID_KEY_ALIAS'\)/);
  });

  it('stops a release build when the key is missing', () => {
    expect(out).toMatch(/gradle\.taskGraph\.whenReady/);
    expect(out).toMatch(/throw new GradleException/);
  });

  it('changes nothing when run twice', () => {
    expect(addReleaseSigning(out)).toBe(out);
  });

  it('fails loudly if the template no longer looks as expected', () => {
    expect(() => addReleaseSigning('android { }')).toThrow(/withReleaseSigning/);
    expect(() => addReleaseSigning(TEMPLATE.replace('signingConfig signingConfigs.debug\n            minify', 'minify'))).toThrow(/release build type/);
  });
});
