import { useEffect } from 'react';
import { applyTheme, themeDef } from '../theme';
import { useActiveRole } from './activeRole';
import { loadLook, saveLook } from './lookPref';
import { ROLE_CARDS, effectiveRole } from './roles';
import { roleDefaultTheme, ThemeId } from './themes';
import { useAllAccess } from './useDepartments';
import { useOdoo } from './useOdoo';

/**
 * Decides what to save as the theme: the role's theme, unless it is already saved.
 * Themes are set by role now (there is no theme picker), so nothing saved by hand is kept.
 * Returns the theme to save, or null to leave things alone.
 */
export async function pendingRoleTheme(role: ThemeId | null): Promise<ThemeId | null> {
  if (!role) return null;
  return (await loadLook()).theme === role ? null : role;
}

/**
 * Keeps the theme in step with the role in use (the one picked on the start screen, the only one
 * a person has, or, before a pick, the first that fits): saves it for the next start and changes
 * the running app to it at once, so the first launch needs no restart either.
 */
export function useRoleTheme() {
  const { client } = useOdoo();
  const { access, ready } = useAllAccess();
  const active = useActiveRole();
  const role = effectiveRole(access, active);
  const theme: ThemeId | null = client && ready ? (role ? ROLE_CARDS[role].theme : roleDefaultTheme(access)) : null;
  useEffect(() => {
    if (!theme) return;
    let alive = true;
    pendingRoleTheme(theme).then(async (pending) => {
      if (!alive) return;
      if (pending) {
        const current = await loadLook();
        await saveLook({ theme: pending, palette: current.palette }, true);
      }
      if (alive && themeDef.id !== theme) applyTheme(theme);
    });
    return () => {
      alive = false;
    };
  }, [theme]);
}
