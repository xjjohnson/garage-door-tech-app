/**
 * Runs one thing at a time that looks for or makes Odoo contacts. The job
 * sync, the visit sync and the customer sync can all notice the same new
 * customer in the same moment; without this each one looks, finds nothing,
 * and makes its own copy. One at a time, the second one looks again and
 * finds the contact the first one just made.
 */
let tail: Promise<unknown> = Promise.resolve();

export function withContactLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.catch(() => undefined);
  return run;
}
