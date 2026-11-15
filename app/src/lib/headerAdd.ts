/**
 * The Add pill in the header (Customers) tells the screen under it to open its
 * Add sheet. The screen subscribes while it is on show.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onHeaderAdd(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function requestHeaderAdd(): void {
  listeners.forEach((fn) => fn());
}
