import { useEffect } from 'react';
import { themeDef } from '../theme';
import { useActiveRole } from './activeRole';
import { parkPreviews } from './devFlags';
import { loadLook, saveLook } from './lookPref';
import { ROLE_CARDS, effectiveRole } from './roles';
import { roleDefaultTheme, ThemeId } from './themes';
import { repaintRestart } from './useColorSchemeReload';
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
 * Keeps the saved theme in step with the role in use (the one picked on the start screen, the
 * only one a person has, or, before a pick, the first that fits). Screens draw their look once
 * at start, so after saving the app restarts once; the restart is guarded so it can't repeat if
 * it didn't take.
 */
export function useRoleTheme(restart?: () => Promise<unknown>) {
  const { client } = useOdoo();
  const { access, ready } = useAllAccess();
  const active = useActiveRole();
  const role = effectiveRole(access, active);
  const theme: ThemeId | null = client && ready ? (role ? ROLE_CARDS[role].theme : roleDefaultTheme(access)) : null;
  useEffect(() => {
    if (!theme) return;
    let alive = true;
    pendingRoleTheme(theme).then(async (pending) => {
      if (!alive || !pending) return;
      const current = await loadLook();
      await saveLook({ theme: pending, palette: current.palette }, true);
      if (!alive || themeDef.id === pending || __DEV__) return;
      parkPreviews();
      await repaintRestart(`theme-${pending}`, restart);
    });
    return () => {
      alive = false;
    };
  }, [theme, restart]);
}
