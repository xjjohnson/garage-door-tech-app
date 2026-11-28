/**
 * The role the person last chose on the start screen, read at once (no waiting) so the first
 * screen already follows it. Kept in the same tiny start-up database as the theme choice.
 */
import { useEffect, useState } from 'react';
import { isRoleKey, RoleKey } from './roles';
import { readStartValue, writeStartValue } from './themeStart';

let active: RoleKey | null | undefined;
/** True once a role was chosen in this run of the app: the start screen shows on every launch until then. */
let pickedThisLaunch = false;
const listeners = new Set<() => void>();

export function getActiveRole(): RoleKey | null {
  if (active === undefined) {
    const v = readStartValue('activerole');
    active = isRoleKey(v) ? v : null;
  }
  return active;
}

export function setActiveRole(role: RoleKey | null) {
  active = role;
  if (role) pickedThisLaunch = true;
  writeStartValue('activerole', role);
  listeners.forEach((l) => l());
}

export function useActiveRole(): RoleKey | null {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return getActiveRole();
}

export function useLaunchPicked(): boolean {
  useActiveRole();
  return pickedThisLaunch;
}

/** For tests: forget that a role was chosen in this run. */
export function resetLaunchPicked() {
  pickedThisLaunch = false;
}
