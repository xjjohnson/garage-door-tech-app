/**
 * Switches for testing from the Developer screen. Kept in memory only, so a
 * restart always puts the app back to normal.
 */
let offline = false;
const listeners = new Set<() => void>();

/** When on, every Odoo call fails as if there were no signal. */
export function pretendOffline(): boolean {
  return offline;
}

export function setPretendOffline(on: boolean) {
  offline = on;
  listeners.forEach((l) => l());
}

export function onDevFlags(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
