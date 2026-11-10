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
Once it's open, every calculation runs on the phone with no signal. An
install that works with no computer at all needs a real build (EAS Build,
which needs a free Expo account); that hasn't been set up.

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
