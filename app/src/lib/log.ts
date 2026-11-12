/**
 * The app's own log, so when something goes wrong in the field there's a
 * record of what the app tried and what Odoo answered. It lives on the phone
 * (the local database, src/lib/db.ts) for 7 days, and the owner can share it
 * from the hidden Developer screen.
 *
 * Nothing secret is written: passwords, API keys and tokens are blanked out
 * before a line is kept (see redact), and Odoo calls are logged by model and
 * method only, never with what was sent.
 */
import { Db, getDb } from './db';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  t: number;
  level: LogLevel;
  /** What part of the app: app, sync, odoo, update, crash... */
  area: string;
  msg: string;
}

export const KEEP_MS = 7 * 24 * 3600 * 1000;
/** How many lines the screen keeps in memory (the database keeps the full 7 days). */
const MEMORY_LINES = 1000;
const MAX_MSG = 2000;

/** Where lines go. The database one, or memory in tests. */
export interface LogStore {
  add(e: LogEntry): void;
  all(since: number): LogEntry[];
  prune(before: number): void;
  clear(): void;
}

export function memoryStore(): LogStore {
  let lines: LogEntry[] = [];
  return {
    add: (e) => {
      lines.push(e);
      if (lines.length > 20000) lines = lines.slice(-10000);
    },
    all: (since) => lines.filter((e) => e.t >= since),
    prune: (before) => {
      lines = lines.filter((e) => e.t >= before);
    },
    clear: () => {
      lines = [];
    },
  };
}

export function dbStore(db: Db): LogStore {
  return {
    add: (e) => db.runSync('INSERT INTO log (t, level, area, msg) VALUES (?, ?, ?, ?)', [e.t, e.level, e.area, e.msg]),
    all: (since) => db.getAllSync<LogEntry>('SELECT t, level, area, msg FROM log WHERE t >= ? ORDER BY id ASC', [since]),
    prune: (before) => db.runSync('DELETE FROM log WHERE t < ?', [before]),
    clear: () => db.runSync('DELETE FROM log', []),
  };
}

const SECRET_KEYS = /("?(?:password|passwd|secret|api[_-]?key|apikey|token|authorization|access[_-]?token)"?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}&]+)/gi;
/** Odoo API keys are 40 hex characters; long hex runs are blanked wherever they appear. */
const LONG_HEX = /\b[0-9a-f]{32,}\b/gi;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g;

/** Blanks out anything that looks like a password, key or token. */
export function redact(text: string): string {
  // Bearer first, so "Authorization: Bearer x" loses x and not just the word Bearer.
  return text.replace(BEARER, '$1 [hidden]').replace(SECRET_KEYS, '$1[hidden]').replace(LONG_HEX, '[hidden]');
}

/** "Error: x" with the first lines of its stack, for errors of any shape. */
export function describeError(e: unknown, stackLines = 6): string {
  if (e instanceof Error) {
    const stack = (e.stack ?? '').split('\n').slice(1, stackLines + 1).map((l) => l.trim()).filter(Boolean);
    return [`${e.name}: ${e.message}`, ...stack].join('\n');
  }
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export class Logger {
  private recent: LogEntry[] = [];
  private listeners = new Set<() => void>();
  private failed = false;

  constructor(
    private readonly store: () => LogStore,
    private readonly now: () => number = Date.now,
  ) {}

  info(area: string, msg: string) {
    this.add('info', area, msg);
  }

  warn(area: string, msg: string) {
    this.add('warn', area, msg);
  }

  error(area: string, msg: string | unknown) {
    this.add('error', area, typeof msg === 'string' ? msg : describeError(msg));
  }

  private add(level: LogLevel, area: string, msg: string) {
    const e: LogEntry = { t: this.now(), level, area, msg: redact(msg).slice(0, MAX_MSG) };
    this.recent.push(e);
    if (this.recent.length > MEMORY_LINES) this.recent = this.recent.slice(-MEMORY_LINES);
    if (!this.failed) {
      try {
        this.store().add(e);
      } catch {
        // The log must never break the app; keep going in memory.
        this.failed = true;
      }
    }
    this.listeners.forEach((l) => l());
  }

  /** The last 7 days, oldest first: from the database when it's there, otherwise what's in memory. */
  entries(): LogEntry[] {
    const since = this.now() - KEEP_MS;
    if (!this.failed) {
      try {
        return this.store().all(since);
      } catch {
        this.failed = true;
      }
    }
    return this.recent.filter((e) => e.t >= since);
  }

  /** Drops lines older than 7 days. Run once at start. */
  prune() {
    try {
      this.store().prune(this.now() - KEEP_MS);
    } catch {
      this.failed = true;
    }
  }

  clear() {
    this.recent = [];
    try {
      this.store().clear();
    } catch {
      this.failed = true;
    }
    this.listeners.forEach((l) => l());
  }

  subscribe(l: () => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

let fallback: LogStore | null = null;
function defaultStore(): LogStore {
  const db = getDb();
  if (db) return dbStore(db);
  return (fallback ??= memoryStore());
}

/** The app's one log. */
export const log = new Logger(defaultStore);

const pad = (n: number) => String(n).padStart(2, '0');

/** "11-12 09:58:02", in the phone's time zone. */
export function stamp(t: number): string {
  const d = new Date(t);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** The log as plain text, for sharing: a header saying what's running, then one line per entry. */
export function formatLog(entries: LogEntry[], header: string[]): string {
  const lines = entries.map((e) => `${stamp(e.t)} ${e.level === 'info' ? '     ' : e.level.toUpperCase().padEnd(5)} ${e.area.padEnd(6)} ${e.msg.replace(/\n/g, '\n                      ')}`);
  return [...header, '', ...lines, ''].join('\n');
}
