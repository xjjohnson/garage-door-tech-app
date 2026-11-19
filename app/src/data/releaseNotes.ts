/**
 * What changed in each release and what to check on the phone. Newest first.
 * Every PR that raises `extra.release` in app.json adds one entry here, from
 * its own summary: `changes` says what is new, `test` is the short list of
 * things to try. The Developer screen shows these (Changelog and the
 * "What to test" tick-list), so nothing is typed in twice.
 */
export interface ReleaseNote {
  release: string;
  title: string;
  changes: string[];
  /** Short things to try on the phone. */
  test: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    release: '0.6.20',
    title: 'Owner theme: money dashboard on Home',
    changes: ['Owner Home: Owed to you and Collected this week up top, a bar chart of money collected the last 7 days, then Open jobs, Unpaid and Visits done. Crew today shows what each tech is on, from Odoo. Today\'s visits follow below.'],
    test: ['Settings > Theme > Owner (Restart): does Home look like the Owner mock-up? Do the bars match what you collected each day?', 'Crew today lists each tech with On job, Next (time) or Nothing booked, from their jobs in Odoo. It cannot tell who is driving.'],
  },
  {
    release: '0.6.19',
    title: 'Themes: Job detail layouts and the Field day timeline',
    changes: [
      'Job detail: Dispatch puts the visit and a Reassign button above the steps. Office and Owner show Quote, Paid and Owed above the steps with an Open invoice button. Map puts a big Go · Directions button on top. Field and Simple keep the steps first with the one big next action.',
      'Field Jobs: each job shows its start time in a column on the left, like a day plan.',
    ],
    test: [
      'Settings > Theme > Office (Restart), open a job: do you see Quote, Paid and Owed above the steps? Try Dispatch (Reassign) and Map (Go · Directions).',
      'Settings > Theme > Field (Restart), open Jobs: are times down the left side?',
    ],
  },
  {
    release: '0.6.18',
    title: 'Themes: Customers and Tools get their own layouts',
    changes: [
      'Customers: Field and Simple show big rows with Call and Go on each row. Dispatch and Office show a table (jobs, open, owes). Owner shows who owes you, biggest first, with a bar. Map lists customers nearest your next stop first, with the distance.',
      'Tools: Field and Simple show six big tiles. Dispatch and Office show a compact list. Owner shows business tools first. Map puts Spring calc and Parts and truck as two big buttons on top.',
    ],
    test: [
      'Settings > Theme, pick Field, tap Restart, open Customers and Tools. Then try Office, Owner and Map. Does each look like the mock-up you approved?',
      'In Map, Customers sorts by distance from your next stop today. With no stop today it shows A to Z.',
      'Not in this release: the small map strip on Map Customers, Job detail layouts, and the Field Jobs timeline.',
    ],
  },
  {
    release: '0.6.17',
    title: 'Dispatch theme: technician lanes on an hour axis',
    changes: ['Dispatch: Jobs opens on the Team board, and each technician\'s day is drawn as blocks on an hour axis (as in the mock-up) instead of a list of chips. Tap a block to move it or change its time.'],
    test: ['Settings > Theme > Dispatch (then Restart), open Jobs. Do you see an hour row with one lane per tech and a block per job? Tap a block.', 'Sales, Customers and Tools still need their themed layouts; tell me what you want to see there.'],
  },
  {
    release: '0.6.16',
    title: 'Themes: Home now matches the mock-ups',
    changes: [
      'Dispatch and Map: Home is the map, filling the screen. Under it a small sheet shows Stops, Drive and Unpaid, a slim row of days and the picked stop with a Go button. Tap the sheet to see the stop list.',
      'Field: Home is the next job card, today as a short list, a Needs you list of unpaid jobs, and the one big On my way button pinned at the bottom. The extra tiles and buttons are gone.',
    ],
    test: [
      'Settings > Theme > Dispatch (then Restart): Home should be mostly map. Tap a pin, then Go. Tap the bar under the map for the stop list.',
      'Settings > Theme > Field (then Restart): Home should show the next job, today, Needs you, and one big green button at the bottom. Does it match the mock-up you picked?',
      'Tell me which themes and screens still do not match (Jobs and Sales are not changed in this release).',
    ],
  },
  {
    release: '0.6.15',
    title: 'Themes: six complete looks, one pick',
    changes: [
      'Settings > Theme: one pick replaces Shape, Size and Colors. A theme sets how every screen is laid out, how big things are, the corners and the colors. Light and dark stay their own switch. Classic is the app as it was and stays the default.',
      'Field (technicians): next job and a big On my way button on Home, edge-marked rows, jobs grouped by day, comfortable size.',
      'Dispatch: opens on the map and the Team board, thin rows, square and tight.',
      'Office: an action inbox on Home (follow-ups and unpaid invoices), Jobs as a table, Sales shows unpaid by age. Square and tight.',
      'Owner: money first on Home (owed, collected this week), jobs grouped by status, Sales shows a to-collect list with the longest overdue first.',
      'Map: Home and Jobs start with the route map, Sales groups invoices by what is owed.',
      'Simple: big text, today in large rows with a Go button, a New job button, jobs as two-column tiles.',
      'Colors: Company brand from Odoo still tints any theme if you pick it. The old Shape and Size picks are gone; each theme sets its own.',
    ],
    test: [
      'Settings > Theme: tap Field, tap Restart, and look at Home, Jobs and Sales. Then try Dispatch, Office, Owner, Map and Simple the same way.',
      'In every theme: are rows easy to tap with a thumb, and is any text clipped or crowded? Tell me the theme and the screen.',
      'Home in Field: does On my way start the next visit like before? In Owner: do the money boxes look right?',
      'Jobs in Office (table), Owner (headings by status) and Simple (tiles): tap a job and check it opens.',
      'Sales in Office (by age), Owner (to collect) and Map (grouped): tap an invoice and check it opens.',
      'Dispatch: does Jobs open on Team and Home on the map?',
      'Dark mode in each theme.',
      'Pick Company brand colors with a theme: do the header and buttons use your Odoo color?',
      'Back to Classic: everything returns to how it was.',
    ],
  },
  {
    release: '0.6.11',
    title: 'Looks: shape, size and company colors',
    changes: [
      'Settings > Look: pick Round or Square corners, a size (Legacy, Comfortable, Compact, Tight) and Johnsons green or the company brand color from Odoo. Legacy round is the default, so nothing changes until you pick.',
      'Compact sizes make buttons 48, 44 or 40 px and text smaller so more fits on a screen. Square looks use sharp corners, firmer borders and no shadows.',
      'Company brand colors are checked for contrast and nudged lighter or darker so white text stays readable.',
      'Management > Your business > Logo: use the company logo from Odoo on PDF reports instead of the built-in Johnsons logo. Read-only from Odoo; nothing is written to it.',
    ],
    test: [
      'Settings > Look: pick Square + Compact, tap Restart, and look through Today, Jobs, a job, Customers and Sales for clipped or crowded text.',
      'Try Comfortable and Tight too: are buttons still easy to hit?',
      'Pick Company brand: do the header and buttons use your Odoo color and stay readable? (If Odoo has none, it stays Johnsons green.)',
      'Dark mode with each look.',
      'Signature pad and the inspection tiles in a compact size.',
      'Management > Your business > Logo: switch to Logo from Odoo, wait a few minutes, make an inspection report PDF and check the logo.',
      'Tap Back to the legacy look: everything returns to how it was.',
    ],
  },
  {
    release: '0.6.10',
    title: 'Switch Odoo database from the Developer screen',
    changes: [
      'Developer > Database shows which Odoo database the phone is attached to, and lets you switch to another (a test copy, or back to live).',
      'A colored NOT LIVE strip shows on every screen whenever the phone is on a database that is not the live one.',
      'Each database keeps its own copy of the phone data. Unsent work stays with its own database and is never sent to another.',
    ],
    test: [
      'Developer > Database: see the current database name.',
      'Type a wrong database name: it should say it could not sign in and change nothing.',
      'Switch to a test database: the app restarts and the NOT LIVE strip shows.',
      'Switch back to live: your jobs and anything not yet sent are still there.',
    ],
  },
  {
    release: '0.6.8',
    title: 'More testing tools on the Developer screen',
    changes: [
      'Look at the app as Owner, Dispatcher, Office, Sales, Warehouse, Buyer or Tech.',
      'What to test in this release: a tick-list, and a Problem button that shares the log.',
      'Changelog of the last releases, with what is new since you last looked.',
      'Weak signal test (slow or dropping Odoo calls) and Pretend time of day.',
      'Setup check lists each red row with how to fix it.',
    ],
    test: [
      'Developer > Look at the app as: pick Buyer, check only Purchasing shows; pick Tech, check owner areas hide; switch off.',
      'Developer > What to test: tick an item, leave and come back, it stays ticked.',
      'Tap Problem on an item: the share sheet opens with the log.',
      'Weak signal > Slow: pull to refresh Today, it waits about 5 seconds. Then Drops some: some calls fail and the app keeps working. Switch to Normal.',
      'Pretend time: set 07:00, check the weather line and Who is working use that hour. Switch it off.',
      'Setup check: a red row shows a plain sentence saying how to fix it.',
    ],
  },
  { release: '0.6.7', title: 'One back control on the area screens', changes: ['Management, Warehouse, Purchasing, Dispatch, Office, Sales and Owner overview each have one back control.'], test: ['Open each area and use Back: it goes to the page before.'] },
  { release: '0.6.6', title: 'Warehouse and Purchasing rows', changes: ['Rows show parts, who ordered, what for, amount and the next step.'], test: ['Open Warehouse and Purchasing: each row shows who, what for and the next step.'] },
  { release: '0.6.5', title: 'Pick a vendor when ordering a part', changes: ['On a ticket, ordering a part that has no vendor in Odoo lets you pick one.'], test: ['Order a part with no vendor from a ticket: a vendor picker appears.'] },
  { release: '0.6.4', title: 'Office pages, Terms and renewals', changes: ['Left-out Office pages added, Terms, sturdier renewals and not-seen.'], test: ['Open Office and each page in it.'] },
  { release: '0.6.3', title: 'Inspection tiles', changes: ['Inspection page shows tiles in three columns with a pop-up per item.'], test: ['Open an inspection and tap a tile.'] },
];

/** The release the phone is running, and the ones newer than `seen`. */
export function newerThan(seen: string | null, notes: ReleaseNote[] = RELEASE_NOTES): ReleaseNote[] {
  if (!seen) return [];
  const i = notes.findIndex((n) => n.release === seen);
  return i < 0 ? [] : notes.slice(0, i);
}
