import { useRoleTheme } from '../lib/useRoleTheme';

/** Gives each role its own theme the first time the role is known (see useRoleTheme). Draws nothing. */
export function RoleThemeSync() {
  useRoleTheme();
  return null;
}
