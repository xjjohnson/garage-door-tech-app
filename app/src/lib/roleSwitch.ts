import { themeDef } from '../theme';
import { setActiveRole } from './activeRole';
import { parkPreviews } from './devFlags';
import { loadLook, saveLook } from './lookPref';
import { ROLE_CARDS, RoleKey } from './roles';
import { repaintRestart } from './useColorSchemeReload';

/**
 * Works as `role` from now on: remembers it, saves that role's theme and restarts the app once
 * so every screen is drawn in it (screens draw their look once at start). A Developer role
 * preview is kept through that restart. Returns whether it restarted. Never restarts in
 * development, and a restart is not repeated for the same pick within a moment.
 */
export async function switchRole(role: RoleKey, restart?: () => Promise<unknown>): Promise<boolean> {
  setActiveRole(role);
  const theme = ROLE_CARDS[role].theme;
  const current = await loadLook();
  if (current.theme !== theme) await saveLook({ theme, palette: current.palette }, true);
  if (themeDef.id === theme || __DEV__) return false;
  parkPreviews();
  return repaintRestart(`role-${role}-${Math.floor(Date.now() / 5000)}`, restart);
}
