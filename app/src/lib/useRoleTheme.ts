import { useEffect } from 'react';
import { themeDef } from '../theme';
import { loadLook, loadLookSource, saveLook } from './lookPref';
import { roleDefaultTheme, ThemeId } from './themes';
import { repaintRestart } from './useColorSchemeReload';
import { useDepartments } from './useDepartments';
import { useOdoo } from './useOdoo';

/**
 * Decides what to save as a role's theme: only when nothing is saved, or the saved one was
 * set by the app earlier (a role change). A theme the person picked is never touched.
 * Returns the theme to save, or null to leave things alone.
 */
export async function pendingRoleTheme(role: ThemeId | null): Promise<ThemeId | null> {
  if (!role) return null;
  const source = await loadLookSource();
  if (source === 'manual') return null;
  if (source === 'auto' && (await loadLook()).theme === role) return null;
  return role;
}

/**
 * Gives each signed-in role its own theme the first time Odoo says what the role is
 * (Settings still lets the person pick another, and that pick is kept). Screens draw
 * their look once at start, so after saving the app restarts once; the restart is
 * guarded so it can't repeat if it didn't take.
 */
export function useRoleTheme(restart?: () => Promise<unknown>) {
  const { client } = useOdoo();
  const { access, ready } = useDepartments();
  const role = client && ready ? roleDefaultTheme(access) : null;
  useEffect(() => {
    if (!role) return;
    let alive = true;
    pendingRoleTheme(role).then(async (theme) => {
      if (!alive || !theme) return;
      const current = await loadLook();
      await saveLook({ theme, palette: current.palette }, true);
      if (!alive || themeDef.id === theme || __DEV__) return;
      await repaintRestart(`theme-${theme}`, restart);
    });
    return () => {
      alive = false;
    };
  }, [role, restart]);
}
