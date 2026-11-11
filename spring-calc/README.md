# Spring calculator (torsion springs, standard lift)

Pure TypeScript, no dependencies, works offline. Drop `src/` into the Expo app
later. Tests: `npm install && npm test` (Vitest), types: `npm run typecheck`.
Status: 111 tests passing, Nov 11 2026.

## The math

All units are inches, pounds, inch-pounds.

1. **Rate (IPPT).** A torsion spring is a coiled beam in bending:
   `IPPT = E·π·d⁴ / (32·D·N)`, with d = wire, D = mean diameter (ID + d),
   N = active coils = length/d − dead coils (4 by default), E = 30,000,000 psi.
2. **Door torque.** `torque = door weight × cable radius` (2" on 4" drums).
3. **Turns.** `door height / drum circumference + 1`, rounded down to a quarter
   turn: 7½ for 7', 8½ for 8' on 4" drums.
4. **Lift.** A set of springs balances `total IPPT × turns / cable radius`.
5. **Cycle life.** Each wire has a maximum torque (MIP) for 10k, 15k, 25k, 50k
   and 100k cycles, from the Canimex chart. Life between points is
   interpolated on a log-log scale, never extrapolated. Below 2.5" ID the MIP
   is scaled down by the Wahl curvature factor, because tighter coils stress
   the wire more.
6. **Wire from 20 coils.** Matched to the DASMA 20-coil table within 1/16",
   flagged as ambiguous near the midpoint between two sizes.
7. **Growth.** A spring gets about one wire diameter longer per turn wound.
8. **Cable length.** Floor to shaft center + 8" for each cable on 400-8 and
   400-12 drums (the same rule from Service Spring, APCO, DNS, OMI and
   Torque Force). Shown when the tech enters floor to shaft center.

## How it checks against published charts

| Source | What was compared | Result |
|---|---|---|
| Canimex charts (IDC Spring), 2.5", 2.63", 3.75" | IPPT on 10 rows, rate constants, turns at life, weight | Within 1% (or print rounding) |
| American Garage Door Supply, 6 springs, 1¾" and 2" ID | IPPT | Within 1.5% |
| Same | Max torque at 10k–100k cycles | Within 3%. Ours is lower (more conservative) on 4 of 6 springs, and at most 1.7% higher on the .225s |
| DDM, .207×22 and .225×23.5 pairs | Door weight lifted | DDM rates about 8% less door than the formula |
| DDM, .207×22 and .218×24 | Cycle rating | DDM rates about 45% fewer cycles than Canimex |
| Canimex charts 1.75" and 2.00" | Rate constants, weight per inch, MIP | Within 0.5%. Our MIP below 2.5" ID is 0–4% under the chart, never over |
| Service Spring weight-per-inch chart, 13 wires × 3 IDs | Weight per inch | Within 0.5% (its .295 row runs 1.3% heavy; Canimex agrees with us) |
| DASMA color sheet #171, Service Spring sheet | Color per wire | All 14 match |
| Spring Engineering app worked example | IPPT of .218×2"×25" | 27.53 vs 27.74 (0.8%) |
| Canimex cable drum manual, D400-96 / D400-144 | Lift and life factors | Canimex sizes on the drum's high moment arm (2.275"); that explains both the 8% and 15% factors below |

### Disagreements and how they were resolved

- **Lift (about 8%).** Canimex and ADS print IPPT that matches the textbook
  formula. DDM's door-weight ranges are about 8% lower. Mode 2 aims a door at
  the middle (it orders a spring rated 4% stronger than the formula says is
  needed) and shows the door-weight range across both sources. In practice
  that's within a quarter turn of balance either way. Mode 1 is not affected,
  because it compares springs with each other.
- **Cycle life (about 45%).** DDM's ratings behave exactly as if torque were
  15% higher. The calculator shows DDM's (lower) figure as the rating and the
  Canimex figure as the optimistic end. With this, a .225×2"×24" pair on a 7'
  door rates 10,000 cycles, which is how the trade sells that spring.
- **Why the factors exist.** Canimex's drum manual sizes springs on the
  drum's high moment arm (2.275" on a D400-96, 2.293" on a D400-144), not
  2", and winds a 7' door 7.6 turns on 12" track or 7.9 on 15". That rates a
  spring set for 0.88–0.93× the door the plain formula gives, which is the
  lift gap, and puts full-wind torque 14% above door weight × 2", which is
  the life gap. RATE_FACTOR_LOW (0.92) matches 15" track and runs about 3%
  high for 12" track.
- **20 coils of .234.** DASMA and Service Spring print 4-5/8", but 20 coils
  of .2343" wire are 4.69" long. DDM prints 4-11/16", and so does the table.
- **Wire names.** ".218" is really .2187" and ".225" is .2253". The code uses
  the actual diameters; using the nominal ones throws IPPT off by up to 2.4%.

## Out of scope for v1

High-lift, vertical-lift and tapered drums; 525 and larger drums; wire above
.295"; extension springs; TorqueMaster and EZ-Set. Each needs its maker's
chart before it can be added.

## Sources

- Canimex spring charts RCI2_50, RCI2_63, RCI3_75, hosted by IDC Spring.
- American Garage Door Supply product pages (IPPT and turns-vs-cycles tables).
- DDM Garage Doors product pages and "How many turns do you wind a torsion spring".
- DASMA torsion spring table, in Controlled Products' Spring Reference Chart.
- Canimex spring charts for 1.75" and 2.00" coil diameter, and the Canimex
  Torque Force cable drum and torsion spring manual.
- Service Spring Corp weight-per-inch chart and spring ordering sheet.
- DASMA torsion and extension spring color sheet #171 (Rev. 9/2015).
- DDM Garage Doors, "How to measure torsion springs" (10- and 20-coil table).
- Cable length formula and drum cross-reference (Service Spring, APCO, DNS,
  OMI, Torque Force part numbers).
- Service Spring, "Understanding 3 impacts of the garage door drum".
- Richard Kinch, truetex.com garage door spring page (torque and turns).
- Dr. Drang, "Let's twist again", leancrew.com (IPPT and stress derivation).

## Screen proposal

**One screen per mode, two tabs at the top: "Match old spring" and "Size from door".**

Field rules for both: tap targets at least 56 px, numbers entered on a
keypad with fraction buttons (¼ ½ ¾ ⅛ ⅜ ⅝ ⅞ and 1/16), large high-contrast
text readable in sun, works with gloves (no tiny steppers), everything runs
on the phone with no signal, last inputs remembered per tab.

**Safety banner (always visible above results, cannot be dismissed):**
"Torsion springs store enough energy to cause serious injury. Results are
estimates from published charts and must be checked against the spring
maker's data. Only trained technicians should wind or unwind springs. Use
proper winding bars, never screwdrivers."

**Match old spring:** wire (caliper reading, or length of 20 coils with a
picture showing how to measure), inside diameter (1¾, 2, 2⅝, other),
relaxed length (coils only, no cones), wind (left, right, not sure), one
spring or a pair, door height, drum (400-8, 400-12). Optional: free shaft
length. Results card: wire size and color, IPPT, turns, door weight it
balances, cycle rating; then "Equal replacement" (same rate in other IDs or
wires) and "Longer life" (25k and 50k) cards, each with length, growth at
full wind and weight.

**Size from door:** door weight (from a scale), height, drum, one or two
springs, cycle target (10k, 25k, 50k), ID to use. Results: turns to wind,
then up to 8 options with length, IPPT, cycle rating and door-weight range.

**Warnings** show in three colors: red stops the result (for example, an
ambiguous wire measurement, or no spring fits), amber needs a look, grey is
information. Red results hide the order details until fixed.

## App setup plan

- **Expo (React Native), TypeScript**, same as the math game. One codebase
  for Android and iPhone; the calculator runs fully offline.
- **Data on the phone:** wire and drum tables ship inside the app. Saved jobs
  live in SQLite on the phone (expo-sqlite).
- **Backend later, for accounts:** sign-in, a company account with techs
  under it, sync of saved jobs, and the private price sheet per company.
  Supabase or Firebase would cover that without running a server; your
  Proxmox box could host it too but then it must stay up for every tech.
- **Manuals:** link to each maker's own page rather than hosting PDFs.
