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
