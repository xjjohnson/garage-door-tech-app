import { setActiveRole } from './activeRole';
import { loadLook, saveLook } from './lookPref';
import { ROLE_CARDS, RoleKey } from './roles';
import { applyTheme, themeDef } from '../theme';

/**
 * Works as `role` from now on: remembers it, saves that role's theme for the next start and
 * changes the running app to it at once (every screen redraws in the new look; no restart).
 */
export async function switchRole(role: RoleKey): Promise<void> {
  setActiveRole(role);
  const theme = ROLE_CARDS[role].theme;
  const current = await loadLook();
  if (current.theme !== theme) await saveLook({ theme, palette: current.palette }, true);
  if (themeDef.id !== theme) applyTheme(theme);
}
