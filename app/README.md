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

1. On the phone, open the repo on GitHub (signed in, since the repo is
   private), go to **Releases** and open **Latest APK**.
2. Tap the `spring-calc-<build>.apk` file to download it, then open it.
3. The first time, Android asks to allow installs from your browser or the
   GitHub app. Allow it, go back, and tap **Install**.

A newer APK installs over the old one and keeps the saved inputs, because
each build has a higher version code and the same signing key. That key is
Expo's standard debug key: fine for your own phones, not for the Play Store,
which needs a private key of your own.

Every run (pull requests too) also keeps the APK for 30 days under the run's
**Artifacts** on the Actions tab, as a zip.

Android only. An iPhone install outside Expo Go needs an Apple developer
account and a build through Xcode or EAS.

## Over-the-air updates (plan, not set up yet)

Over-the-air (OTA) updates let a phone that already has the app pick up new
screens and math without installing a new APK. The app checks for an update
when it opens, downloads it in the background, and switches to it the next
time it opens. If the update server can't be reached, nothing breaks: the
app keeps running the version it has, offline.

**What OTA can and can't carry.** It replaces the JavaScript and assets, which
is everything in this app so far: the screens, the spring math and the wire
and drum tables. Anything native still needs a new APK: a new library with
native code, an Expo SDK upgrade, or a change to native settings in
`app.json` (icon, package name, permissions). The update system tracks this
with a "runtime version": each update only goes to APKs with the same native
code, so a phone never gets an update it can't run.

**Why it isn't in this APK.** The address the app checks for updates is
built into the APK. Until the update host is chosen there's no address to
build in, so phones need one more APK install after OTA is set up. Every
change after that can go over the air.

**Two ways to host the updates.**

1. **EAS Update (Expo's hosted service).** It works with APKs built this way,
   without EAS Build. It needs a free Expo account (yours to create), an
   access token stored as a GitHub secret, and one workflow step that runs
   `eas update` on each push to main. The free plan includes updates up to
   a monthly limit; check current limits at expo.dev/pricing. Least upkeep.
2. **Self-hosted on your Proxmox box behind the Cloudflare tunnel.** Expo
   publishes the protocol (Expo Updates v1) and an example server. No third
   party, but you'd run and update that server, and the updates should be
   code-signed so a phone only accepts ones you published.

**Steps once the host is picked:** add the `expo-updates` library, set
`runtimeVersion` to the `fingerprint` policy (it changes whenever native code
changes, so incompatible updates can't reach a phone), set the update address
and channel in `app.json`, add the publish step to the workflow, then build
and install one new APK on each phone.

## What's on screen

Two tabs at the top.

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

**Look.** Near-black on white, bold type at 18 px and up, every button at
least 56 px tall for gloves. The app is portrait and light mode only.

## Code

- `App.tsx`: header and the two tabs. Both tabs stay mounted, so switching
  keeps each one's inputs.
- `src/screens/`: `MatchScreen.tsx`, `DoorScreen.tsx`.
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
