/**
 * Hand-off between the "Your business" screen and the background settings
 * sync: the owner's edits wait here until they are sent to Odoo. Kept free of React.
 */
import type { Business } from './invoices';

let pending: Business | null = null;
const listeners = new Set<() => void>();

/** The owner's latest edit, not yet in Odoo. */
export const pendingBusiness = () => pending;
export const clearPending = (b: Business) => {
  if (pending === b) pending = null;
};

/** Called by the screen on every edit by the owner. */
export function queueBusiness(b: Business) {
  pending = b;
  listeners.forEach((l) => l());
}

export function onQueued(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
