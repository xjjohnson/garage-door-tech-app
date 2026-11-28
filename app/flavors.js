// The versions of this app that are built from the same code. Each one is its
// own APK with its own name, icon and Android id, so they can sit on one phone.
// Johnsons keeps today's id, so Johnsons phones update in place. Every version
// shares one runtime version and the same update channels, so one over-the-air
// update reaches all of them. Chosen at build time with APP_FLAVOR; the default
// is johnsons. To add a business, add an entry here and to src/flavor.ts.
const REPO_DL = 'https://github.com/xjjohnson/garage-door-tech-app/releases/download/latest-apk';

module.exports = {
  johnsons: {
    name: 'Johnsons',
    scheme: 'garagedoortech',
    appId: 'com.xjjohnson.garagedoortech',
    icon: './assets/icon.png',
    adaptiveIcon: {
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    favicon: './assets/favicon.png',
    apkFile: 'johnsons.apk',
    manifestFile: 'version.json',
  },
  fscrew: {
    name: 'FS Crew',
    scheme: 'fscrew',
    appId: 'com.xjjohnson.fscrew',
    icon: './assets/fscrew/icon.png',
    adaptiveIcon: {
      backgroundColor: '#002D04',
      foregroundImage: './assets/fscrew/android-icon-foreground.png',
      backgroundImage: './assets/fscrew/android-icon-background.png',
      monochromeImage: './assets/fscrew/android-icon-monochrome.png',
    },
    favicon: './assets/fscrew/favicon.png',
    apkFile: 'fs-crew.apk',
    manifestFile: 'fs-crew-version.json',
  },
  REPO_DL,
};
