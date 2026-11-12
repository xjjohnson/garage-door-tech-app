/**
 * The phone's local database (expo-sqlite, in the APK from 0.5.0). It holds
 * the app's log now and is where the Odoo cache and the send queue move in
 * the next releases. Opened once, on first use.
 *
 * Where SQLite isn't there (tests, web, or code running on an older APK
 * before the new one is installed) this returns null and callers fall back to
 * keeping things in memory, so nothing ever crashes for lack of it.
 */
export interface Db {
  execSync(sql: string): void;
  runSync(sql: string, params: (string | number | null)[]): unknown;
  getAllSync<T>(sql: string, params: (string | number | null)[]): T[];
}

/** Each step runs once, in order; the number of steps done is kept in user_version. */
const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     t INTEGER NOT NULL,
     level TEXT NOT NULL,
     area TEXT NOT NULL,
     msg TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS log_t ON log (t);`,
];

let opened: Db | null | undefined;

/** Brings a database up to the newest layout. Exported for tests. */
export function migrate(db: Db): void {
  const row = db.getAllSync<{ user_version: number }>('PRAGMA user_version', [])[0];
  const done = row?.user_version ?? 0;
  for (let i = done; i < MIGRATIONS.length; i++) {
    db.execSync(MIGRATIONS[i]);
    db.execSync(`PRAGMA user_version = ${i + 1}`);
  }
}

export function getDb(): Db | null {
  if (opened !== undefined) return opened;
  try {
    const sqlite = require('expo-sqlite') as typeof import('expo-sqlite');
    if (typeof sqlite.openDatabaseSync !== 'function') throw new Error('no sqlite');
    const db = sqlite.openDatabaseSync('johnsons.db') as unknown as Db;
    migrate(db);
    opened = db;
  } catch {
    opened = null;
  }
  return opened;
}
