# Johnsons app (Expo)

The field app for Johnson's garage door work, from release 0.5.0 called
**Johnsons** on the phone. It started as the torsion spring calculator (the
tested math in `../spring-calc`, used unchanged) and is becoming the tech's
replacement for the Odoo web UI in the field: today's visits, jobs with their
steps, quotes, invoices and customers, synced with Odoo over JSON-RPC.
Everything works on the phone without signal and sends to Odoo when it can.

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
`eas update --branch beta`, which uploads the new JavaScript to the **beta**
channel. The APK job still runs too, so a fresh APK is always on the Releases
page.

**Beta updates (from 0.5.0).** Updates reach beta phones first. On the phone,
open Settings, tap the version 7 times to open the Developer screen, and turn
on **Beta updates**, then tap **Restart to switch**. That phone now asks the
`beta` channel (`src/lib/updateChannel.ts` sets the `expo-channel-name`
header; turning it off goes back to `production`). When an update has been
tried and is good, give it to everyone: in GitHub, Actions, Android APK, Run
workflow on main, set **Send the update to** to `production`. Both channels
are created by the workflow on first use.

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
they can't run. JavaScript-only changes keep the same version. Version 0.3.0 is such a
change: the move to Expo Router added native libraries (`expo-router`,
`react-native-screens`, `expo-linking`, `expo-constants`), so phones need
the 0.3.0 APK, and 0.2.0 APKs keep their last update. Version 0.4.0 added
the camera, PDF and share sheet (`expo-image-picker`, `expo-print`,
`expo-sharing`), `react-native-svg` for signatures and `expo-secure-store`
(for a future Odoo sign-in), so phones need the
0.4.0 APK for those and for every update after it; 0.3.0 APKs keep their last
update and show the new-APK banner. Version 0.5.0 added the local database
(`expo-sqlite`), the camera barcode scanner (`expo-camera`), voice notes
(`expo-audio`) and a web view for maps (`react-native-webview`), plus the new
name and icon, so phones need the 0.5.0 APK.

**Release numbers: every update gets one.** The number on the Settings
button (and at the top of Settings) is the release, `extra.release` in
`app.json`, not the APK's `version`. It goes up by one with every change
that ships, so each over-the-air update has its own number:

- **JavaScript-only change (over the air):** raise the last part of
  `extra.release` by one (0.4.3 to 0.4.4). Leave `version` alone, or the
  0.4.0 APKs stop getting it.
- **Native change (new APK):** raise `version` as above (0.4.0 to 0.5.0) and
  set `extra.release` to the same number (0.5.0).

Settings shows both when they differ, such as "Version 0.4.3 · APK 0.4.0".
Updates from before this was set up show the APK version (0.4.0). Counting
from the 0.4.0 APK, the Odoo sign-in fix (#41) was 0.4.1 and the Field
Service orders fix (#42) was 0.4.2; 0.4.3 is the first update that carries
its number. The Tests job fails a pull request that changes what ships
(`src/`, `assets/`, `app.json`, packages or `../spring-calc/src`) without
raising the release (`scripts/check-release.mjs`), and
`src/__tests__/buildInfo.test.ts` checks the release stays on the APK's
`x.y`.

This policy was picked over Expo's automatic `fingerprint` policy because
the APK is built with Gradle here, not EAS Build, and a fingerprint computed
on the build runner and on the update runner could differ in ways that can't
be tested ahead of time. A version you set by hand always matches.

## What's on screen

Sections in the bar at the bottom (from 0.5.0): **Today**, **Jobs**, **Sales**, **Customers** and **Tools**.

**Today.** A line at the top says whether Odoo has everything (or what's
not in Odoo yet, which opens the Developer screen), then the next visit with
Navigate and Start job, jobs under way, the rest of today's visits, and tiles
for money owed and follow-ups due. If the app closed on an error last time, a
notice offers to share the log.

**Today › Map** (from 0.5.3). **List | Map** at the top of Today. The map is
Leaflet with OpenStreetMap tiles in a WebView (`src/lib/mapHtml.ts`, no
Google key): today's visits as numbered pins in time order, joined by a line,
the next one in green and finished ones grey. **Show nearby** adds customers
within 10 miles of the route who owe money (**$**, from the phone's invoices
and, signed in, Odoo's unpaid posted invoices) or have an open quote (**Q**,
Odoo quotations in draft or sent). Tap a pin or a row for **Google Maps**,
**Waze**, and **Start job** / **Open job**; **Whole day in Google Maps** opens
the rest of the day as one route. Addresses are looked up with OpenStreetMap
Nominatim, one a second as its rules ask, and kept on the phone
(AsyncStorage `geocode/v1`; a miss is asked again after a day); contacts
Odoo already has pinned skip the lookup. An address that misses as typed is
tried again as street + ZIP (a city that doesn't match the ZIP is the usual
cause), then street + city, then the ZIP alone, which gives a dashed pin in
the middle of the ZIP. The yellow bar under the map says how many weren't
found or were placed by ZIP only; tap it to see which, with **Google Maps**
to check the address and **Try again** once it's fixed (from 0.5.7). The map needs signal (Leaflet and
the tiles load over the internet); the list under it works without.

**Job hub** (`/job/<id>`). One page per job with its steps: On my way (opens
the messages app with an on-my-way text, sent by hand), Arrived, Inspect,
Quote, Work and Paid, each worked out from what's saved on the job and its
invoice. The big button is always the next step. Below are the inspection,
spring calculator, quote, photos, invoice and customer. **+ New job** on
Today makes one from three answers: who, what's wrong, and now or later.

**Sales** has follow-ups, the price sheet, accepted quotes still to invoice,
and the invoices. **Tools** holds the spring calculator, door weight,
Diagnose, Manuals, truck stock, time and miles, the schedule, business
numbers, the Odoo team page and Settings.

**Odoo setup check** (`/setup`, opened from the Developer screen). Reads Odoo and marks each thing this
version needs as found or missing, with how to fix it: signed in, Field
Service, you as a Field Service worker, Sales and quotation templates,
Invoicing, a truck stock location and outgoing email. It changes nothing.

**Developer screen** (`/developer`, owner only: tap the version in Settings 7
times). What's running, the Odoo connection, what's waiting to send, Beta
updates, Check for update, Test Odoo, a Pretend offline switch, and the app's
log. The log (`src/lib/log.ts`) is kept on the phone for 7 days in the local
database, records each Odoo call by model and method (never what was sent),
and blanks out passwords, API keys and tokens before anything is kept.
**Share log** sends it as a text file. Errors nobody caught are logged as
crashes (`src/lib/crash.ts`); a crash inside Android itself leaves no line
(that would need a crash service such as Sentry).

**Spring calculator** (Tools, `/springs`) has four tabs: **Match old** and **From door** for torsion springs, **Extension**, and **High lift** for drums and cables.

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

**Extension.** Door height (7', 8', 9' or other), one spring a side or two,
and the door weight, or the old springs' tag rating or color, plus optionally
the old spring's length. Ratings follow DDM: each spring is rated for the
whole door (two per side add up to it), rounded down to 10 lb. Colors follow
DASMA TDS-171, which repeat every 100 lb, so a color alone is a STOP until the
door is weighed or the tag is read. Stock sizes: 25" × 42" for 7', 27" × 48"
(or 29") for 8', 39" × 54" for 9'; other heights order by a stretch of half
the door height. The math is in `spring-calc/src/extension.ts`.

**High lift.** Pick standard, high or vertical lift, then the door height,
the high lift (how far the track runs straight up past the opening), the
door weight and, optionally, floor to shaft center. It lists which Canimex
drums hold the door (cable capacity and load per drum) with each one's cable
length. On high lift with D400-54 drums it also gives the turns, the rate per
spring and spring options, from Canimex's D400-54 multiplier chart (15"
track, 6' to 10' doors, to 42" of high lift, 45" to 7'6"). On standard lift
with a door weight it also sizes springs on D525-216 drums for heavy
commercial sectional doors, from Canimex's D525-216 table (12" or 15" track,
6' to 19'3"), with one, two or four springs, 3 3/4" inside diameter, and
heavier wires to .331 from Canimex's 3.750" chart. Other high-lift
drums and vertical lift list the drums only: their turns come from the drum
maker's chart. The math is in `spring-calc/src/drums.ts`.

**Door weight estimate.** "No scale yet? Estimate the weight" under the
door weight on From door and Extension opens a page: width, height, how the
door is built (steel plain, steel insulated, steel both sides, wood newer or
older) and windows. It shows a weight range, marked ESTIMATE, for quoting
only; it never fills the calculator. Door makers don't publish weights by
size, so the ranges are worked out per square foot from the few published
doors (DDM, and Wayne Dalton figures quoted by a dealer), named on screen.
The math is in `spring-calc/src/doorWeight.ts`.

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

**Quotes.** A saved job's **Quote** button prices it three ways from the
price sheet: **Good** puts in 10,000-cycle springs (in Match old spring, the
same size as the old one), **Better** 25,000 and **Best** 50,000, each with
the spring labor, the service call and whichever add-ons the price sheet
includes in that option. Sales tax is charged on parts (springs and
add-ons), not labor. **Send as text** shares the quote as plain text
(text message, email, anything the phone offers), and **Customer picked**
records the option and its total on the job, shown in the Jobs list. An
option with no spring of that rating says so instead of a price, and a job
whose calculator shows a STOP gets no quote until it's fixed
(`src/lib/quote.ts`).

**Price sheet.** Opened from the top of Jobs or from a quote: service call,
spring labor, a price per spring for each option, add-ons (named freely,
each ticked for Good, Better and/or Best; add or remove any) and the tax
rate. Prices are entered on the keypad and saved on the phone as they're
typed (`src/lib/prices.ts`, AsyncStorage `price-sheet/v1`).

**Prices from Odoo.** When signed in to Odoo (Jobs > Team) and Odoo has
products, **Import prices from Odoo** at the top of the price sheet brings in
every product that can be sold (`sale_ok`) with its sales price
(`product.product` `lst_price`). Products not linked to a line yet become
add-ons ticked on no option, folded under **Show N more Odoo items** until a
tier is picked. Any line can be linked to an Odoo product (**Link to Odoo
product**, route `/odoo-product`); later imports update linked prices and
list products that are gone. Links are kept in the sheet's `odoo` map, by
line key. Offline, the sheet works as before.

**Customers.** **Customers** at the top of Jobs lists everyone a job was
saved for, most recent first, with a search box (name, phone, email, address,
notes, or the address or spring of one of their jobs). Every job belongs to a
customer: when a job is saved (or loaded from an older version, or restored
from a backup) it joins the customer with the same phone number, or else the
same name, or a new customer is made from its details. A customer's page
shows how to reach them (**Call**, **Text**, **Email**), their notes, how much
they've accepted in quotes, and every job at their place, newest first;
tapping one opens its quote. **Edit customer** changes the name, phone, email,
main address and notes, and copies a new name and phone onto their jobs. A
job's own address stays as typed, since the job site can differ. In the save
sheet, typing a name offers matching customers ("Repeat customer?") to fill in
their phone and address. A job's details show **Customer history**. Customers
are saved on the phone (`src/lib/customers.ts`, `src/lib/useCustomers.tsx`,
AsyncStorage `customers/v1`) and go into backups. Their fields (name, phone,
email, street, notes) are the ones an accounting system such as Odoo keeps for
a contact, so a later sync can map them directly.

**Customers in Odoo.** Signed in to Odoo, **Sync customers with Odoo** at
the top of Customers brings in Odoo customers (`res.partner` with
`customer_rank > 0`), linking ones already on the phone by phone number or
name, and creates the phone's new customers in Odoo marked as customers. A
customer changed on the phone since the last sync sends its name, phone and
email; one changed only in Odoo takes Odoo's details; when both changed the
phone wins (`src/lib/customerSync.ts`). Each customer keeps `odooId` and
`syncedAt`.

**Quotes and invoices in Odoo** (`src/lib/odooSales.ts`). With Sales
installed, a quote the customer picked has **Send to Odoo as a sales order**:
a confirmed `sale.order` for that option, saved on the job as `odooOrder`.
With Invoicing, an invoice has **Send to Odoo**: a posted `account.move`
(tied to the sales order's lines when there is one), then each payment taken
on the phone is registered with Odoo's Register Payment wizard (cash to a cash
journal, checks and the payment apps to the bank). **Sync with Odoo** later
sends new payments and reads back Odoo's paid status, amount owed and total
(Odoo adds its own product taxes). Lines use their linked Odoo product, or a
"Garage door service" product (`GDT-SERVICE`, no tax) made the first time
it's needed. A customer without an Odoo contact gets one on the first send.
The sales order's customer reference starts with the tier ("Better · 12 Elm
St"), so reports can tell which option sold. Once an invoice is in Odoo,
**Email the invoice and inspection report** makes both PDFs on the phone,
attaches them to the Odoo invoice and posts them to the customer's contact,
which Odoo sends by email (the contact needs an email address, and Odoo needs
an outgoing mail server).

**Quotation templates** (`src/lib/odooTemplates.ts`). Odoo quotation
templates named "Job type · Good", "· Better" and "· Best" (a dash or colon
works too) price jobs the spring calculator can't, like openers and tune-ups:
a job whose "What's wrong" is Opener gets its options from the "Opener ·"
templates, with each line's Odoo product, price and tax. They're saved on the
phone (`odoo-templates/v1`) and refreshed from Odoo every 10 minutes while
signed in. Spring jobs keep using the price sheet. A job that isn't about
springs (anything but Broken spring, New door or no type) and has no templates
never asks for spring measurements: the quote says which template names to
make in Odoo and, until then, is the service call plus the inspection's
repairs. **Add a line by hand** on any quote adds a typed line with a price
(taxed as a part, or not, as labor) to every option, so a job can always be
quoted; on a spring job missing its measurements, a named line turns the
quote into that service-call-and-lines quote (`quoteLines` on the job).

**Inspection add-ons.** Repairs added from the inspection (from Poor, Safety
risk, Fair and other items) show on the quote with that item's photos. Each
is on every option until the customer says no; tapping it takes it off.

**Business numbers.** The top of Jobs shows open jobs, what you're owed and
what was collected this week; tapping it opens **Business numbers**: the
oldest unpaid invoice, then this week and this month (collected, split by
cash / check / Cash App / Venmo / Zelle, invoiced, average ticket, jobs saved,
quotes accepted and the share of jobs that became one), and a bar chart of
collections over six months. Weeks start Monday. Void invoices aren't counted
(`src/lib/stats.ts`).

**Follow-ups and warranty.** **Follow-ups** at the top of Jobs (yellow, with a
count, when something is due within a week) lists repeat work from your
invoices, 45 days ahead and up to a year overdue: a **tune-up** a year after a
job, **springs near the end of their life** (the option's cycle rating at
your cycles a day, flagged six months early), and **spring warranty ending**
(a month before). Each has **Text the customer** with a message ready to edit
in the phone's messages app, and **Done** to clear it. Only the latest invoice
at an address counts. Settings at the bottom: cycles a day (4 by default),
tune-up interval, spring warranty by option (Good 12, Better 36, Best 60 months)
and labor warranty (12). An invoice shows its warranty dates and whether it's
covered now, for callbacks (`src/lib/followups.ts`, AsyncStorage
`followups/v1`, included in backups). The app sends nothing on its own.

**Schedule.** **Schedule** at the top of Jobs shows the next two booked
visits and opens a page with a row of days (yesterday to two weeks out) and
that day's visits in time order. **Book a visit** (also on a customer's page,
filled in with their name, phone and address) takes a customer, address,
phone, what it's for (Broken spring, Tune-up, Opener...), the day, a start time
from half-hour buttons between 7 am and 6 pm, and a length, and warns when it
overlaps another booked visit. Each visit has **Directions** (Google Maps),
**Call**, **On my way** (pick 15, 30, 45 or 60 minutes for a ready text),
**Remind** (a confirmation text for the day and time), **Done**, **Next day**
and **Cancel**. A visit keeps what a field-service system keeps (customer,
address, start, length, status), so a later Odoo sync can map it
(`src/lib/schedule.ts`, AsyncStorage `schedule/v1`, included in backups). The
app sends nothing on its own; texts open in the phone's messages app.

**Time and miles.** **Time and miles** at the top of Jobs (outlined, with the
hours so far, while on the clock) opens a page to **Start the day** and **End
the day**, each with the truck's odometer if wanted (the last reading is
shown). Miles are the difference, or typed in by hand on the day. The week
(this, last, or the one before; Monday to Sunday) shows hours, miles and the
mileage deduction at the tech's rate in cents a mile (70¢ by default, the IRS
2025 standard rate; set this year's). **Send this week (spreadsheet)** shares
a CSV with a row a day and a total, for taxes or an accountant
(`src/lib/worklog.ts`, AsyncStorage `worklog/v1`, included in backups).

**Truck stock.** **Truck stock** at the top of Jobs (outlined, with a count,
when something is low) lists what's on the truck by Springs, Parts, and
Openers and remotes, each with big **−** and **+** buttons. **Add common
items** starts a torsion-truck list at 0 to fill in. An item has a reorder
point and a fill-to count, a supplier, an optional part number and cost.
**To order** groups low items by supplier with the quantity to get back to
the fill-to count, and **Text order** or **Email order** opens a ready message
to that supplier (phone and email are set under **Suppliers**); **Got it, add
to stock** adds the order to the counts. An item keeps what an inventory
system keeps for a product (name, part number, on hand, reorder point, cost,
vendor), so a later Odoo sync can map it (`src/lib/stock.ts`, AsyncStorage
`stock/v1`, included in backups).

**Photos, signatures and PDFs** (from version 0.4.0). A quote has **Take
photos**, a page for that job's **Before**, **After** and **Other** photos,
from the camera or the gallery, each with **Share** and **Delete**. Photos are
copied into the app's own folder so they stay when the gallery is cleaned;
they aren't in backups (only their list is saved). Once the customer picks an
option, **Customer signs to approve** opens a pad to sign with a finger under
"I approve the Better option for $X"; an invoice has **Customer signs** for
"Work completed to my satisfaction." Signatures are saved as a few SVG
strokes and go into backups. **Send as PDF** on a quote or an invoice makes
a one-page PDF on the phone (business name and phone, the lines and totals,
QR codes to pay by Cash App or Venmo, the Zelle handle, the warranty and the
signature, or a line to sign) and opens the share sheet to text, email,
print or save it (`src/lib/pdf.ts`, `src/lib/attachments.ts`,
`src/lib/deviceMedia.ts`, AsyncStorage `attachments/v1`). **Send as text**
still sends the plain-text version.

**Team (Odoo).** **Team** next to **Back up or restore** signs in to the
business's Odoo (address, database, email, and a password or, better, an
API key from Odoo's My Preferences > Account Security). The key is kept in the
phone's keystore (`expo-secure-store`), never in AsyncStorage or backups, and
the app signs in again on its own when it opens. **My jobs** lists the open
jobs Odoo assigns to you, with Directions and Call; **Add to schedule** (or
**Put all on my schedule**) puts them on the Schedule as visits, and **Mark
done** closes a Field Service job the way Odoo's own button does.
**Dispatch** lists unassigned jobs with a button for each tech to give it to,
and **A tech's jobs** shows one tech's list with buttons to move a job to
someone else. Jobs are Odoo Field Service tasks when that app is installed,
and ordinary Project tasks otherwise; Odoo 16+ (`user_ids`) and older
(`user_id`) are both handled. It talks to Odoo's `/jsonrpc` endpoint
(`src/lib/odoo.ts`, `src/lib/useOdoo.tsx`, sign-in details in AsyncStorage
`odoo/v1`). Needs the 0.4.0 APK for the keystore.

**Jobs › Team (dispatch)** (from 0.5.3). For an Odoo Field Service
Dispatcher or Manager, or an Odoo admin (checked with `has_group` at
sign-in; techs never see it), Jobs gets a **Mine | Team** switch. Team is a
board for one day (‹ › to change it): **Not assigned** lists open Field
Service orders with no worker, then a lane per worker with that day's jobs
and when they're free. **Assign**, or tapping a job in a lane, opens a sheet
to pick the worker and a start time (half hours, 7 to 6); it writes
`person_id` and `scheduled_date_start` on the `fsm.order` straight away.
**Assign and text the customer** also opens the phone's messages app with
the booking filled in, to send by hand (`src/screens/DispatchScreen.tsx`).

**Phone jobs in Odoo** (from 0.5.9). While signed in, every open job made on
the phone (with a customer or address) becomes a Field Service order, or a
Project task without OCA Field Service, so it shows on Jobs › Team (under
**Not assigned** when it has no worker). The order gets the customer's Field
Service location (made on their contact if they have none) and the job type
and notes as its description. A job with a booked visit is given to you;
the visit then takes the order's id (`odoo-<id>`). Booking or moving the
visit on the phone (the job's **Visit** row, or **Later** on New job, opens
the Schedule for that job) writes `scheduled_date_start` and
`scheduled_duration`; a time or worker set in Odoo (Jobs › Team) comes back
to the phone's visit, and a job given to someone else leaves this phone's
schedule. It runs in the background shortly after a change, when the app
comes back, and every 3 minutes (`src/lib/odooJobs.ts`,
`src/components/OdooJobSync.tsx`). Jobs not sent yet count in the Today
"waiting to go to Odoo" line.

**Inspection.** A job's **Inspection** (in its details, or on its quote) is
the checklist that replaces SafetyCulture. Each **door** gets its maker, size,
year, spring date code and cycles, and 18 items (balance, springs and cables,
bearings, hinges, fixtures, rollers, track, panels, seal...) rated **Good**,
**Fair**, **Poor**, **Safety risk** or **N/A**. Each door has one or more
**motors** (drive, force and limits, safety eyes, logic board, keypad,
remotes, wall button), rated Compliant / Non-compliant or Pass / Fail. A
**gate** adds the UL 325 and ASTM F2200 items. Poor, Safety risk,
Non-compliant and Fail are **flagged** and open a note, an action, photos
for that item and **Add as repair**. The score is the share of points
available, N/A left out. Voice notes are recorded on the phone (expo-audio).
The customer signs, then **Share PDF report** makes the report (logo, score,
flagged items first, every section, photos, signature), and **Save report to
Odoo** attaches the PDF to the job's Field Service order, else its sales
order, else the customer, with a note in the chatter
(`src/lib/inspection.ts`, `src/lib/inspectionReport.ts`, `src/lib/odooReports.ts`).
A 0.4 safety check opens as Door 1 and Motor 1. Repairs with a price go onto
every option of the job's quote, and so onto its invoice.

**Invoices.** Once the customer has picked an option on a quote, **Make
invoice** turns it into an invoice, numbered from 1001 up, with the option's
lines and totals copied in, so later price changes don't alter it. (If prices
changed after the customer picked, the quote says so before the invoice is
made.) The invoice page shows what's owed and, under **Scan to pay**, a QR code
the customer scans with their phone camera: Cash App or Venmo opens with the
amount (and, for Venmo, the invoice number) filled in. Zelle has no such link,
so the invoice shows the email or phone to send to. **Record a payment** takes
the method (Cash, Check, Cash App, Venmo, Zelle), the amount (it starts at
what's still owed) and a check number or note; the invoice then shows UNPAID,
PART PAID or PAID. Payments are removed, and invoices voided, only on a second
tap. **Send as text** shares the invoice as text with the payment links.
**Invoices** at the top of Jobs lists them, owed first, with the total owed;
jobs and customer pages show their invoices and what's owed.

**Your business.** At the top of Jobs: business name and phone (on invoices),
Cash App $cashtag, Venmo username and Zelle email or phone. A **review link**
(your Google review link, or Yelp) adds **Ask for a review** to paid invoices:
it opens a text to the customer with a thank-you and the link. It shows the QR
codes so they can be checked with another phone. QR codes are drawn with
plain views from `qrcode-generator` (plain JavaScript, so this shipped over
the air). Invoices and business details are saved on the phone
(`src/lib/invoices.ts`, `src/lib/useInvoices.tsx`, AsyncStorage `invoices/v1`,
`business/v1`) and go into backups. An invoice keeps what an accounting
system keeps (number, customer, lines, tax, total, payments, amount due), so
a later Odoo sync can map it to an invoice there.

**Back up and restore.** **Back up or restore** at the top of Jobs opens a
page that saves every job, customer, invoice and booked visit, the price sheet and the business details to one file,
`garage-door-backup-YYYY-MM-DD.json`, in a folder the tech picks with the
phone's own folder picker (Downloads, or Google Drive to keep it off the
phone), and shows the day of the last backup. **Restore from a backup** picks
such a file and says what it holds (how many jobs are new to this phone and
how many are newer than the phone's copy) before anything changes; **Restore**
then merges the jobs, deleting nothing and keeping whichever copy of a job was
changed last, and replaces the price sheet with the backup's. The file is
plain JSON with a format name and version (`src/lib/backup.ts`), so later
versions, or a sync with another system, can still read it. It uses
`expo-file-system`'s pickers (`src/lib/backupFiles.ts`), already in the 0.3.0
APK, so it ships over the air to 0.3.0.

**Look.** Near-black on white, bold type at 18 px and up, every button at
least 56 px tall for gloves. The app is portrait and light mode only.

**Diagnose.** Three modes: by symptom, by blink or beep code, and
**Program**, step-by-step guides per opener family for remotes, keypads,
travel limits, force and erasing all remotes. All of it is bundled and works
offline. Programming guides live in `src/data/programming.ts`; a task with no
`checked` date shows "Not checked against the maker's manual yet" with the
points to confirm, and each family links its manuals from the Manuals library.

## Screens and routes

Navigation is Expo Router, with routes in `src/app/` (from version 0.3.0):

| File | Address | What |
|---|---|---|
| `_layout.tsx` | | Saved data for every screen (jobs, customers, prices, invoices, schedule, time and miles, truck stock, photos and signatures, Odoo team), then a stack: the sections, with full pages on top |
| `(tabs)/_layout.tsx` | | Header (with the house mark, Settings button and version), update banners, the sections and the bottom bar |
| `(tabs)/index.tsx` | `/` | Today, as a list or a map |
| `(tabs)/jobs.tsx` | `/jobs` | Saved jobs; Mine / Team (dispatch board) for dispatchers |
| `(tabs)/sales.tsx` | `/sales` | Follow-ups, price sheet, quotes to invoice, invoices |
| `(tabs)/customers.tsx` | `/customers` | The customer list |
| `(tabs)/tools.tsx` | `/tools` | Every tool and setting |
| `(tabs)/springs.tsx` | `/springs` | Springs: Match old, From door, Extension and High lift (Tools stays lit) |
| `(tabs)/manuals.tsx` | `/manuals` | Manuals (Tools stays lit) |
| `(tabs)/diagnose.tsx` | `/diagnose` | Diagnose (Tools stays lit) |
| `job/[id].tsx` | `/job/<job id>` | The job hub |
| `new-job.tsx` | `/new-job` | A new job in three answers |
| `setup.tsx` | `/setup` | Odoo setup check |
| `developer.tsx` | `/developer` | Developer screen (7 taps on the version) |
| `price-sheet.tsx` | `/price-sheet` | The price sheet, a full page |
| `odoo-product.tsx` | `/odoo-product?line=…` | Pick the Odoo product a price-sheet line follows |
| `quote/[id].tsx` | `/quote/<job id>` | One job's quote, a full page |
| `backup.tsx` | `/backup` | Back up and restore jobs and prices, a full page |
| `customer/[id].tsx` | `/customer/<id>` | One customer and their jobs, a full page |
| `invoices.tsx` | `/invoices` | Every invoice and the total owed, a full page |
| `invoice/[id].tsx` | `/invoice/<id>` | One invoice: payments and QR codes to pay, a full page |
| `business.tsx` | `/business` | Business name and payment handles, a full page |
| `inspection/[id].tsx` | `/inspection/<job id>` | One job's inspection, report and repairs, a full page |
| `stats.tsx` | `/stats` | Business numbers, a full page |
| `follow-ups.tsx` | `/follow-ups` | Tune-ups, worn springs and warranty ends due, a full page |
| `schedule.tsx` | `/schedule` | Booked visits by day; `?book=<customer id>` opens booking for them, a full page |
| `time-log.tsx` | `/time-log` | Clock in and out, miles and the week's totals, a full page |
| `stock.tsx` | `/stock` | Truck stock (synced with the tech's own Odoo Inventory location, e.g. "Truck - Justin Johnson", Truck 1 as fallback), barcode scan, tomorrow's pick list, supplier purchase orders, a full page |
| `end-of-day.tsx` | `/end-of-day` | Wrap up the day: jobs done, money by method, hours, miles, close the day, a full page |
| `scorecard.tsx` | `/scorecard` | Tech scorecard, owner only (Odoo admin or Field Service manager), a full page |
| `photos/[id].tsx` | `/photos/<job id>` | One job's before and after photos, a full page |
| `team.tsx` | `/team` | Odoo sign-in, my assigned jobs and dispatch, a full page |
| `settings.tsx` | `/settings` | App version, update channel and a Check for update button, plus links to Your business, the price sheet, the Odoo sign-in and backups; opened from the Settings button (with the version on it) at the top right of every section |

A section stays mounted once opened, so switching keeps its inputs and
search; Manuals and Diagnose aren't drawn until first opened. The bottom bar
and header are the app's own (`src/lib/sections.ts` lists the sections and
the tool pages that keep Tools lit, with a "‹ Tools" back button); the
navigator's tab bar is hidden. Full pages have a Close button that goes back.

**Adding a screen.** Put what it draws in `src/screens/`, then a thin route
file in `src/app/`: a new file there becomes a page at its own address, and
`router.push('/that-address')` opens it. A new bottom section also needs a
line in `src/lib/sections.ts` and a file in `src/app/(tabs)/`.

**Tests** render the real routes with `renderApp()` (`src/testing/renderApp.tsx`,
built on `expo-router/testing-library`). It runs Jest on fake timers, so read
saved data straight after an action instead of with an async `waitFor`.

## Code

- `src/app/`: the screens and routes (Expo Router). Each file is an
  address; see "Screens and routes" below.
- `src/screens/`: what each screen draws (`MatchScreen.tsx`,
  `DoorScreen.tsx`, `JobsScreen.tsx`, `QuoteScreen.tsx`,
  `PriceSheetScreen.tsx`, `ManualsScreen.tsx`, `DiagnoseScreen.tsx`). Route
  files stay thin and call these.
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
