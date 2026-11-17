/**
 * Odoo calls trace: the last 50 calls the phone made to Odoo, by model and
 * method only (never what was sent or answered), with how long each took.
 * For hunting slow screens from the Developer screen. Kept in memory, so a
 * restart clears it.
 */
export interface TracedCall {
  t: number;
  model: string;
  method: string;
  ms: number;
  ok: boolean;
}

export const TRACE_SIZE = 50;

let calls: TracedCall[] = [];
const listeners = new Set<() => void>();

export function recordCall(c: TracedCall) {
  calls = [...calls.slice(-(TRACE_SIZE - 1)), c];
  listeners.forEach((l) => l());
}

/** Oldest first. */
export function callTrace(): TracedCall[] {
  return calls;
}

export function clearCallTrace() {
  calls = [];
  listeners.forEach((l) => l());
}

export function onCallTrace(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The slowest calls first, for "which one is slow". */
export function slowest(list: TracedCall[], n = 5): TracedCall[] {
  return [...list].sort((a, b) => b.ms - a.ms).slice(0, n);
}
