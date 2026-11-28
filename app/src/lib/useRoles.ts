import { useActiveRole, useLaunchPicked } from './activeRole';
import { effectiveRole, rolesFor, RoleKey } from './roles';
import { useAllAccess } from './useDepartments';
import { useOdoo } from './useOdoo';

/**
 * The roles the signed-in person can work in and the one in use. `needsPick` is true when they
 * have more than one role and haven't chosen yet in this run of the app (the start screen shows then, on every launch). Signed out
 * (phone-only use) or still waiting on Odoo, there is nothing to pick.
 */
export function useRoles(): { roles: RoleKey[]; current: RoleKey | null; last: RoleKey | null; needsPick: boolean; ready: boolean } {
  const { client } = useOdoo();
  const { access, ready } = useAllAccess();
  const active = useActiveRole();
  const roles = client && ready ? rolesFor(access) : (['tech'] as RoleKey[]);
  const picked = useLaunchPicked();
  const last = client && ready ? effectiveRole(access, active) : null;
  // More than one role: the start screen shows on every launch, with the last role as the big button.
  const needsPick = !!client && ready && roles.length > 1 && !picked;
  const current = needsPick ? null : last;
  return { roles, current, last, needsPick, ready };
}
