# Johnsons app: short guide for AI agents

Garage door tech app ("Johnsons", brand green #002D04). Expo / React Native phone app (`app/`) plus plain-TypeScript spring math (`spring-calc/`). Read this first; don't grep the whole repo. Expo-specific rules (fetch current docs, `npx expo install`, EAS, routing) are in `app/AGENTS.md`.

## Commands (run from the folder shown)
- Install: `cd app && npm ci` and `cd spring-calc && npm ci`
- Typecheck: `cd app && npm run typecheck` (also `cd spring-calc && npm run typecheck`)
- Lint: no lint script exists. Typecheck is the gate. Don't add a linter without asking.
- App tests (quiet): `cd app && npm test -- --ci --silent 2>&1 | tail -n 30`
- One test file: `cd app && npx jest src/__tests__/<name>.test.tsx --silent 2>&1 | tail -n 30`
- Math tests (quiet): `cd spring-calc && npm test 2>&1 | tail -n 15`
- Build/APK: CI only (`.github/workflows/android-apk.yml`). Never build locally.
- Re-run only what failed while fixing. Don't re-run a passing suite if nothing changed.

## Directory map
- `app/src/app/`: Expo Router routes, thin. `(tabs)/` holds Today, Jobs, Sales, Customers, Tools.
- `app/src/screens/`: what each screen draws. `app/src/components/`: shared UI.
- `app/src/lib/`: all logic. Odoo layer is `odoo*.ts` (`odoo.ts` is the client; `odooJobs`, `odooSales`, `odooStock`, `odooSettings`, `odooPurchasing` ...). `use*.ts(x)` are React hooks.
- Offline and sync: `db.ts` (local SQLite), `pending.ts` (what Odoo doesn't have yet), `syncNow.ts`, `customerSync.ts`, `useTruckSync.ts`, `settingsSync.ts`, `backup.ts`.
- Job workflow, six steps: `jobSteps.ts` (On my way, Arrived, Inspect, Ticket, Work, Paid). Tickets: `ticket.ts`, `ticketSections.ts`, `quote.ts`, `invoices.ts`.
- Spring math: `spring-calc/src/` (`springMath.ts`, `extension.ts`, `doorWeight.ts`, `drums.ts`, `data.ts`), imported only via `app/src/springCalc.ts`.
- Tests: `app/src/__tests__/`, helper `app/src/testing/renderApp.tsx`. Plans and handoffs live in the project's shared files, not here.
- Heavy files, open only if the task needs them: `app/src/data/manuals.ts`, `spring-calc/src/data.ts`, `app/src/data/diagnostics.ts`, any `package-lock.json`.

## Rules that must hold
1. **Odoo is the source of truth.** Odoo (OCA Field Service on Odoo 19: `res.partner`, `fsm.order`, `sale.order`, `account.move`) owns the data. The phone shows Odoo data and keeps local copies only so techs can work offline; changes made offline queue and sync back cleanly. Anything saved in the app runs through Odoo. Settings and lists come from Odoo, not hard-coded.
2. **Never bulk-write old phone data to Odoo in an over-the-air update.** The app never turns on Odoo settings (for example Track Inventory) by itself.
3. **Jobs can close before payment.** Paid is the last step, but not required to close a job.
4. **Money:** no card payments (check, Cash App, Venmo, Zelle, cash). Sales tax on parts only, and Odoo applies it. No automatic texting.
5. **Name and look:** the app is "Johnsons". Customer-facing text uses the business info stored on the Odoo company. Brand green #002D04.
6. **Spring math** must come from published charts, and every data row names its source. Covers torsion springs (the Doorvana chart), extension and high-lift, the door weight estimator and heavy commercial springs. Keep `spring-calc/` free of React and of dependencies.
7. **Release number:** every change that ships to phones raises `extra.release` in `app/app.json` (next free 0.5.x); leave `version` alone unless a new APK is needed. CI fails the PR otherwise (`app/scripts/check-release.mjs`).
8. Use `npx expo install` for packages, never plain `npm install <pkg>`.

## Code review
Flag only real bugs: Odoo sync or queue conflicts, data loss, calculation regressions, and rule breaks above. Skip style and formatting.

## PRs
Branch from main. **Ship one bigger PR per feature, not many small ones**: Justin tests after large batches merge. Tests go in the same PR.
The "Tests" check is the gate. `.github/workflows/auto-merge.yml` merges a non-draft PR only after its Android APK run passes, then starts the APK workflow on main. Merges to main reach the beta channel only; never send an update to production (a manual run by Justin). Use a draft PR for work that isn't ready to merge.
