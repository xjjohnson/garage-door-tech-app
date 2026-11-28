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

/** The roles Developer > Look at the app as can show. */
export type Preview = 'owner' | 'dispatcher' | 'office' | 'sales' | 'warehouse' | 'tech';
export const PREVIEWS: { id: Preview; label: string }[] = [
  { id: 'owner', label: 'Owner' },
  { id: 'dispatcher', label: 'Dispatcher' },
  { id: 'office', label: 'Office' },
  { id: 'sales', label: 'Sales' },
  { id: 'warehouse', label: 'Warehouse' },
  { id: 'tech', label: 'Tech' },
];

const PREVIEW_IDS = PREVIEWS.map((x) => x.id) as string[];

let previews: Preview[] = [];

/** Looking at the app as other roles: only what those roles open shows. Only the app's view changes; Odoo and its data are never touched. Memory only, so a restart clears it . */
export function rolePreviews(): Preview[] {
  return previews;
}

/** The first role being looked at, or null. Older code that only knows one role reads this. */
export function rolePreview(): Preview | null {
  return previews[0] ?? null;
}

export function setRolePreviews(list: Preview[]) {
  previews = [...new Set(list)];
  listeners.forEach((l) => l());
}

export function setRolePreview(p: Preview | null) {
  setRolePreviews(p ? [p] : []);
}

/** Weak-signal test: slow makes every Odoo call wait 5 seconds first; flaky makes every 4th call fail as if the signal dropped. Memory only. */
export type Signal = 'normal' | 'slow' | 'flaky';
export const SLOW_MS = 5000;
let signal: Signal = 'normal';
let flakyCount = 0;

export function weakSignal(): Signal {
  return signal;
}

export function setWeakSignal(s: Signal) {
  signal = s;
  flakyCount = 0;
  listeners.forEach((l) => l());
}

/** True when this call should fail under the flaky setting. */
export function flakyDrop(): boolean {
  if (signal !== 'flaky') return false;
  flakyCount += 1;
  return flakyCount % 4 === 0;
}

/** Pretend time: the phone's clock moved to a chosen time today, for the screens that ask devNow(). Never changes what is saved or sent. Memory only. */
let timeShift = 0;

export function devNow(): number {
  return Date.now() + timeShift;
}

/** Move "now" to hh:mm today, or null to go back to the real clock. */
export function setPretendTime(hhmm: string | null, real = Date.now()) {
  if (hhmm === null) timeShift = 0;
  else {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!m || +m[1] > 23 || +m[2] > 59) return;
    const d = new Date(real);
    d.setHours(+m[1], +m[2], 0, 0);
    timeShift = d.getTime() - real;
  }
  listeners.forEach((l) => l());
}

export function pretendTime(): number | null {
  return timeShift === 0 ? null : devNow();
}
