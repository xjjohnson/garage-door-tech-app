import { useActiveRole } from './activeRole';
import { effectiveRole, rolesFor, RoleKey } from './roles';
import { useAllAccess } from './useDepartments';
import { useOdoo } from './useOdoo';

/**
 * The roles the signed-in person can work in and the one in use. `needsPick` is true when they
 * have more than one role and haven't chosen yet (the start screen shows then). Signed out
 * (phone-only use) or still waiting on Odoo, there is nothing to pick.
 */
export function useRoles(): { roles: RoleKey[]; current: RoleKey | null; needsPick: boolean; ready: boolean } {
  const { client } = useOdoo();
  const { access, ready } = useAllAccess();
  const active = useActiveRole();
  const roles = client && ready ? rolesFor(access) : (['tech'] as RoleKey[]);
  const current = client && ready ? effectiveRole(access, active) : null;
  return { roles, current, needsPick: !!client && ready && roles.length > 1 && current === null, ready };
}
