/**
 * The tech's saved theme choice, readable at once (no waiting) so the very first
 * screen is drawn in the right colors. It sits in its own tiny database, kept in
 * step with the async copy in themePref.ts. Nothing here can throw: with no
 * database (tests, web) the app just follows the phone.
 */
type Choice = 'light' | 'dark';
type Sql = { execSync(s: string): void; getFirstSync<T>(s: string): T | null; runSync(s: string, p: unknown[]): unknown };

let db: Sql | null | undefined;
function open(): Sql | null {
  if (db !== undefined) return db;
  try {
    const sqlite = require('expo-sqlite') as typeof import('expo-sqlite');
    const d = sqlite.openDatabaseSync('theme.db') as unknown as Sql;
    d.execSync('CREATE TABLE IF NOT EXISTS pref (k TEXT PRIMARY KEY, v TEXT)');
    db = d;
  } catch {
    db = null;
  }
  return db;
}

/** 'light' or 'dark' when the tech chose one; null for "match the phone" or when nothing is saved. */
export function readStartChoice(): Choice | null {
  try {
    const row = open()?.getFirstSync<{ v: string }>("SELECT v FROM pref WHERE k = 'theme'");
    return row?.v === 'light' || row?.v === 'dark' ? row.v : null;
  } catch {
    return null;
  }
}

export function writeStartChoice(choice: Choice | null): void {
  try {
    const d = open();
    if (!d) return;
    if (choice) d.runSync("INSERT OR REPLACE INTO pref (k, v) VALUES ('theme', ?)", [choice]);
    else d.runSync("DELETE FROM pref WHERE k = 'theme'", []);
  } catch {
    // Not saved here; the async copy still holds the choice.
  }
}

/** Other small start-up values (shape, size, palette, brand color), read the same way. Nothing here throws. */
export function readStartValue(key: string): string | null {
  try {
    const row = open()?.getFirstSync<{ v: string }>(`SELECT v FROM pref WHERE k = '${key.replace(/[^a-z]/gi, '')}'`);
    return typeof row?.v === 'string' ? row.v : null;
  } catch {
    return null;
  }
}

export function writeStartValue(key: string, value: string | null): void {
  try {
    const d = open();
    if (!d) return;
    const k = key.replace(/[^a-z]/gi, '');
    if (value) d.runSync(`INSERT OR REPLACE INTO pref (k, v) VALUES ('${k}', ?)`, [value]);
    else d.runSync(`DELETE FROM pref WHERE k = '${k}'`, []);
  } catch {
    // Not saved here; the async copy still holds it.
  }
}
