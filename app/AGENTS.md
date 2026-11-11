This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Navigation is **Expo Router** (`expo-router` ~58). Routes live in `src/app/` and stay thin; what a screen draws lives in `src/screens/`, shared code in `src/lib/` and `src/components/`. The four bottom sections are `src/app/(tabs)/` with their own header and bar (listed in `src/lib/sections.ts`); full pages such as `/quote/[id]` sit on the root stack. See README "Screens and routes".
- Docs: https://docs.expo.dev/router/introduction.md

## Spring math

- The math lives in `../spring-calc/src` and is imported only through `src/springCalc.ts`. `metro.config.js` adds that folder to `watchFolders`. Keep the math free of React and of any dependency so it stays testable with Vitest on its own. Avoid syntax that makes Babel import `@babel/runtime` helpers (tuple destructuring such as `const [a, b] = f()`): that folder has no node_modules for the app bundle to resolve them from. `src/__tests__/mathBundle.test.ts` checks this.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- **Every change that ships to phones raises the release number** (`expo.extra.release` in `app.json`): over-the-air only, add one to the last part (0.4.3 to 0.4.4) and leave `version` alone; a native change (new APK) raises `version` to the next `x.y.0` and sets `extra.release` to match. CI fails a PR that skips it (`scripts/check-release.mjs`). See README "Release numbers".

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
