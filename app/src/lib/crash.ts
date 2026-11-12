/**
 * Catches errors nobody else caught, writes them to the log (src/lib/log.ts)
 * with their stack, then lets React Native carry on as it would have. A
 * fatal one still closes the app, but the log line is written first (the
 * local database writes straight away), so the next launch can say what
 * happened and offer to share it.
 *
 * This sees errors in the app's own code. A crash inside Android itself
 * leaves no line; catching those needs a crash service such as Sentry.
 */
import { describeError, LogEntry, Logger } from './log';

type Handler = (error: unknown, isFatal?: boolean) => void;
interface ErrorUtilsLike {
  getGlobalHandler(): Handler;
  setGlobalHandler(h: Handler): void;
}

let installed = false;

export function installCrashHandler(logger: Logger, errorUtils: ErrorUtilsLike | undefined = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils): boolean {
  if (installed || !errorUtils) return false;
  installed = true;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    try {
      logger.error('crash', `${isFatal ? 'App closed: ' : ''}${describeError(error, 12)}`);
    } catch {
      // Never let logging get in the way of the real handler.
    }
    previous(error, isFatal);
  });
  return true;
}

/** For tests. */
export function resetCrashHandler() {
  installed = false;
}

/** The newest crash line after a given time, if any. */
export function lastCrash(entries: LogEntry[], after = 0): LogEntry | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.t <= after) return undefined;
    if (e.area === 'crash' && e.level === 'error') return e;
  }
  return undefined;
}
