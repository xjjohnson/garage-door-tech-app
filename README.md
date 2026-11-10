# Garage door tech app

An app that helps garage door technicians in the field. Work starts on the spring calculator.

- `spring-calc/`: the torsion spring math in plain TypeScript, with its own tests (Vitest). No dependencies.
- `app/`: the Expo (React Native) phone app built on that math. See `app/README.md` to try it with Expo Go or install the APK.
- `.github/workflows/android-apk.yml`: builds an installable Android APK on every change to main (see Releases, "Latest APK").
