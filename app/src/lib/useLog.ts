import { useEffect, useState } from 'react';
import { log, LogEntry, Logger } from './log';

/** The log's last 7 days, read again whenever a line is added. */
export function useLog(logger: Logger = log): LogEntry[] {
  const [entries, setEntries] = useState<LogEntry[]>(() => logger.entries());
  useEffect(() => {
    let queued = false;
    const off = logger.subscribe(() => {
      // Many lines can arrive at once (a sync); read once after them.
      if (queued) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        setEntries(logger.entries());
      }, 250);
    });
    return off;
  }, [logger]);
  return entries;
}
