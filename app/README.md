# Spring Calc app (Expo)

The phone app for the torsion spring calculator. It is a screen on top of the
tested math in `../spring-calc`, which it uses unchanged. Everything runs on
the phone; there is no server and no network call.

## Try it on your phone

You need Node 20 or newer on a computer, and the **Expo Go** app on the phone
(App Store or Google Play). The phone and the computer should be on the same
Wi-Fi.

```bash
git clone https://github.com/xjjohnson/garage-door-tech-app.git
cd garage-door-tech-app/app
npm ci
npx expo start
```

A QR code shows in the terminal. On an iPhone, scan it with the Camera app; on
Android, scan it from inside Expo Go. The app opens in Expo Go.

If the phone can't reach the computer (different networks, or a guest Wi-Fi
that blocks devices from seeing each other), stop it with Ctrl+C and run
`npx expo start --tunnel` instead. The first time, it offers to install a
tunnel helper; say yes.

Offline: in Expo Go the app's code is loaded from your computer when it opens.
Once it's open, every calculation runs on the phone with no signal. For an
install that needs no computer at all, use the APK below.

## Install the APK (Android, no computer needed)

GitHub builds an APK every time a change lands on main (workflow
`.github/workflows/android-apk.yml`). A build takes a while; the run shows on
the repo's Actions tab.

1. On the phone, open the repo on GitHub, go to **Releases** and open
   **Latest APK**. No GitHub account is needed, since the repo is public.
2. Tap `spring-calc.apk` to download it, then open it.
3. The first time, Android asks to allow installs from your browser or the
   GitHub app. Allow it, go back, and tap **Install**.

A newer APK installs over the old one and keeps the saved inputs, because
each build has a higher version code and the same signing key. That key is
the app's own private key (see "Signing key" below), so nobody else can build
an APK that installs over this one.

Every run (pull requests too) also keeps the APK for 30 days under the run's
**Artifacts** on the Actions tab, as a zip.

Android only. An iPhone install outside Expo Go needs an Apple developer
account and a build through Xcode or EAS.

## Signing key

Android only lets a new APK install over an installed app when both are
signed with the same key. Until version 0.2.0 the APK was signed with Expo's
public debug key, which anyone can download, so anyone could have built an
APK that installs over this app. From 0.2.0 on, release APKs are signed with
a private key that lives only in this repo's GitHub secrets and in your own
offline backup.

**How it's wired.** `plugins/withReleaseSigning.js` is an Expo config plugin.
On every build, `expo prebuild` regenerates `android/`, and the plugin makes
the release build type use a key read from environment variables
(`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
optional `ANDROID_KEY_PASSWORD`). The workflow unpacks the keystore from the
secrets into the runner's temp folder, builds, checks with `apksigner` that
the APK has one signer and that it isn't the debug key, then deletes the
keystore. The certificate's SHA-256 is printed on the run's summary page and
in the Latest APK release notes. Without the secrets the Build APK job stops
with an error; it never falls back to the debug key.

**The secrets.**

| Name | Kind | What |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | secret | the keystore file, base64 on one line |
| `ANDROID_KEYSTORE_PASSWORD` | secret | the keystore's password |
| `ANDROID_KEY_PASSWORD` | secret, optional | only for a JKS keystore with a separate key password |
| `ANDROID_KEY_ALIAS` | variable, optional | the key's alias, if not `garagedoortech` |
| `ANDROID_SIGNING_CERT_SHA256` | variable, optional | pins the certificate; a build with any other key fails |

**Making the keystore.** Do this on your own computer, never on a shared one.
It needs `keytool`, which comes with any Java JDK, or Docker:

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore garagedoortech-release.p12 -alias garagedoortech \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Garage Door Tech App"
```

With Docker instead of a local JDK:

```bash
docker run --rm -it -v "$PWD":/work -w /work eclipse-temurin:17-jdk \
  keytool -genkeypair -v -storetype PKCS12 \
  -keystore garagedoortech-release.p12 -alias garagedoortech \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Garage Door Tech App"
```

keytool asks for the password twice. Anything in `-dname` is readable by
anyone who has the APK, so keep it to the app's name. Then turn the file into
one line of text for the secret:

```bash
base64 -w0 garagedoortech-release.p12 > garagedoortech-release.p12.b64
```

(On a Mac: `base64 -i garagedoortech-release.p12 -o garagedoortech-release.p12.b64`.)

**Keep a backup.** If the keystore or its password is lost, no APK can ever
be installed over the current one again; every phone would have to uninstall
and reinstall, losing its saved inputs. Keep the `.p12` file and the password
in two places you control (a password manager plus an offline copy), not in
this repo and not in a chat.

**Changing keys means one reinstall.** Android refuses to install an APK
signed with a different key over an installed app ("App not installed"). So
going from the 0.1.0 APK (debug key) to 0.2.0 (own key) needs an uninstall of
the old app first, once per phone, and the inputs saved in it are lost. The
in-app banner on 0.1.0 still offers 0.2.0; its Install step fails until the
old app is uninstalled. Later APKs install over 0.2.0 as usual.

## Over-the-air updates (EAS Update)

Over-the-air (OTA) updates let a phone that already has the app pick up new
screens and math without installing a new APK. The app checks for an update
when it opens, and again each time it comes back to the screen (at most every
ten minutes), and downloads it in the background. Once an update has
downloaded, a yellow **Update ready** bar shows above the bottom tabs:
**Restart** switches to it right away, and **Later** hides the bar until the
app is next opened, which also switches to it. The app never restarts on its
own, so nobody loses their place mid-job, and saved inputs come back after a
restart (`src/components/UpdateReadyBar.tsx`, `src/lib/otaUpdate.ts`). If the
update server can't be reached, nothing breaks: the app keeps running the
version it has, offline.

**How it's wired.** `app.json` points the app at Expo's update server for
this project (`updates.url`) and asks for the `production` channel. On every
push to main, the workflow's "Publish OTA update" job runs
`eas update --branch production`, which uploads the new JavaScript. The APK
job still runs too, so a fresh APK is always on the Releases page.

**One-time setup (yours).**

1. In your Expo account, create an access token (expo.dev, Account settings,
   Access tokens).
2. In this GitHub repo, go to Settings, Secrets and variables, Actions, and
   add it as a repository secret named `EXPO_TOKEN`. It lives only there.
3. Install the first APK built after this change on each phone. APKs built
   before it don't know where to look for updates.

Until the secret exists, the OTA job just prints a warning and the rest of
the workflow carries on.

**What OTA can and can't carry.** It replaces the JavaScript and assets, which
is everything in this app so far: the screens, the spring math and the wire
and drum tables. Anything native still needs a new APK: a new library with
native code, an Expo SDK upgrade, or a change to native settings in
`app.json` (icon, package name, permissions).

**When a new APK is needed, the app says so.** Each build also puts a small
`version.json` on the Latest APK release, holding the `version` from
`app.json` and the APK's link. When the app opens, it reads that file
(`src/lib/apkUpdate.ts`, address in `src/config.ts`). If the version there is
newer than the installed APK's, a banner under the header offers
**Download**, which opens the APK so Android can show its Install screen,
or **Later**, which hides it until the app is opened again. It reads the file
again each time the app comes back to the screen, at most every ten minutes,
so a phone that keeps the app open still hears about it. With no signal,
or if the file can't be read, nothing shows and the app carries on. Inputs
saved on the phone survive the reinstall.

**The one rule: bump the version for native changes.** Each update only goes
to APKs with the same "runtime version", and here the runtime version is the
app's `version` in `app.json` (the `appVersion` policy). So when a change
touches native code, raise `version` (for example 0.1.0 to 0.2.0) in the same
change. The new APK then gets updates for 0.2.0, and phones still on the
0.1.0 APK keep the last update that works for them instead of getting one
they can't run. JavaScript-only changes keep the same version.

This policy was picked over Expo's automatic `fingerprint` policy because
the APK is built with Gradle here, not EAS Build, and a fingerprint computed
on the build runner and on the update runner could differ in ways that can't
be tested ahead of time. A version you set by hand always matches.

## What's on screen

Sections in the bar at the bottom: **Springs**, **Jobs**, **Manuals** and **Diagnose**. Springs has two tabs.

**Match old spring.** Wire by 20-coil length, caliper, or picked from the
list (with the color code); inside diameter; relaxed length; wind; one spring
or a pair; door height; drums; and, optionally, the free shaft beside the
spring. Results: the old spring (rate, turns, the door weight it balances,
cycle rating), then equal replacements in other stocked sizes, then
longer-life upgrades for 25,000 and 50,000 cycles.

**Size from door.** Door weight, height, drums, one spring or a pair, the
cycle rating wanted (10k, 25k, 50k), the inside diameters to consider, and
optionally the free shaft. Results: turns to wind, the rate needed per spring,
and up to 8 options, lightest first, each with the door-weight range it
balances.

Results update as you type; there is no Calculate button.

**Safety.** The safety banner sits above the results on both tabs and can't
be closed. Warnings come in three colors: red STOP, amber CHECK, grey NOTE. A
STOP in "Match old spring" (for example a 20-coil reading between two sizes)
hides the replacement and upgrade cards until it's fixed.

**Entering numbers.** Tapping a field opens a big keypad with fraction keys
(eighths, and a 16ths key that swaps in the odd sixteenths). Back removes a
whole fraction at once. Cancel keeps the old value. Caliper and weight fields
take decimals instead of fractions.

**Remembered inputs.** Each tab keeps its last inputs on the phone
(AsyncStorage), so closing the app mid-job loses nothing. "Clear all inputs"
resets a tab.

**Manuals.** A search box (brand, model or series; case, spaces and dashes
don't matter), a row to pick Residential or Commercial & gate, and a row of
brand buttons that shows only the makers in the market picked. Where the
maker's page lists its PDFs with plain links, the entry shows one button per
document (install manual, user's guide, quick start, Spanish versions and so
on) that opens the PDF straight away, plus a "More documents on the maker's
page" button. Openers have an entry per model or model family, current and
discontinued (LiftMaster, Chamberlain, Genie, Overhead Door and others), so an
older opener found on a job can be looked up by the number on its label. Door
makers have entries per door series. Other entries open the maker's own page in the phone's browser:
manual search pages, document finders and troubleshooting. Nothing is bundled
in the app; every PDF comes from the maker's own site (starred ones are
downloaded from there to the phone, see below). Before opening, the
app checks for a signal; with none it says so and offers Try again or Open
anyway. Each entry shows the day its links were last checked.

**Starred manuals work with no signal.** Each entry has a **Star** button.
Starred entries come first in the list, and their PDFs are downloaded to the
phone (`src/lib/useSavedManuals.ts`, `src/lib/manualFiles.ts`), so a document
button marked "Saved on this phone" opens in the phone's PDF viewer with no
signal check. A link that turns out to be a web page instead of a PDF (checked
by the file's first bytes, not its address) isn't kept and says it needs a
signal. Anything that couldn't download is tried again each time Manuals opens
and with **Try saving again**. Unstarring deletes the saved copies. This uses
`expo-file-system`, which the `expo` package already builds into the APK, so
it shipped over the air without a version bump; check with
`npx expo-modules-autolinking resolve -p android` before assuming the same of
another module.

The links live in `src/data/manuals.ts`. To add one, open the page in a
browser to be sure it loads, then add an entry with today's date in
`checked`. Mark a commercial door or operator with `markets: ['commercial']`
(gate links count as commercial & gate on their own). A new maker also goes in `BRANDS` with its own website hosts; the
tests fail on any link whose host isn't one of its maker's, so a mirror or a
manual-sharing site can't slip in. Direct PDFs go in an entry's `docs`, copied
from the maker's page, which stays in `url` as the "More documents" page. A
few makers keep their PDFs on a file store under another address (LiftMaster
on Chamberlain's Widen store, Clopay on literature.clopay.com, Chase on
assets.nlcnet.net); those go in the maker's `fileHosts`, and the tests refuse
a document anywhere else. A change there is plain JavaScript and reaches
phones over the air.

**Link check.** `npm run check-links` opens every page and PDF in the list
and names any that are gone (404), unreachable, or now open a web page instead
of a PDF. The "Manuals link check" GitHub workflow runs it every Monday, on
pull requests that change the list, and by hand from the Actions tab; a
failed run lists the broken links on its summary page. Sites that turn away
automated checks show as "check by hand", not as broken.

**Jobs.** Under the results on either Springs tab, **Save as a job** asks for
the customer, address, phone (optional) and notes, typed on the phone's own
keyboard, and saves them with the tab's inputs and its answer. The Jobs
section lists them, open jobs first and newest first, with a search box
(customer, address, phone, notes or spring size) and an Open / Done / All
switch. Tapping a job shows **Open in calculator**, which puts its inputs back
on the right tab, **Call** when there's a phone number, **Edit details**,
**Mark done** or **Reopen**, and **Delete job** (on a second tap). A tab
opened from a job says so above its save button and offers **Save changes**
(back to that job) or **New job**; Clear all inputs unlinks it. A job keeps
the inputs, not the result, so reopening it runs the current math. Jobs live
only on the phone (AsyncStorage, `src/lib/jobs.ts` and `src/lib/useJobs.tsx`),
with no account and no network; uninstalling the app deletes them.

**Look.** Near-black on white, bold type at 18 px and up, every button at
least 56 px tall for gloves. The app is portrait and light mode only.

## Code

- `App.tsx`: header, the Springs/Manuals sections and the two spring tabs.
  Every screen stays mounted, so switching keeps its inputs.
- `src/screens/`: `MatchScreen.tsx`, `DoorScreen.tsx`, `ManualsScreen.tsx`.
- `src/data/manuals.ts`: the makers, their manual links and direct PDFs.
- `scripts/check-links.mjs`: the link check (`npm run check-links`).
- `src/lib/manualSearch.ts`: search, ranking and the signal check.
- `src/components/`: `Keypad.tsx` (fraction keypad), `controls.tsx` (choice
  buttons, measurement fields), `results.tsx` (safety banner, warnings,
  spring cards).
- `src/lib/measure.ts`: reading "24 1/2" style entries, formatting inches,
  turns and numbers, and the keypad's key logic.
- `src/lib/forms.ts`: what each tab holds, and how it becomes a call to
  `matchOldSpring` or `sizeFromDoor`. Missing fields and math errors come
  back as values, so the screen never crashes on a bad entry.
- `src/springCalc.ts`: the only import of `../spring-calc/src`.
- `metro.config.js`: tells Metro to bundle `../spring-calc`.

## Tests

```bash
npm test            # Jest: keypad and form logic, and the screens (React Native Testing Library)
npm run typecheck   # TypeScript
npm run test:math   # the original Vitest suite in ../spring-calc (run npm ci there first)
```
