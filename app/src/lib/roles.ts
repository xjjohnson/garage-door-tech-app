/**
 * The roles a person can work in, one bubble each on the start screen. Each role has its own
 * theme and bottom bar. Kept free of React. Tech is Odoo's Field Service User group (a dispatcher doesn't
 * count as a tech, though Odoo gives them the group); a person with no role at all is a tech; the owner holds every role;
 * Buyer is part of Warehouse (the warehouse does all the buying).
 */
import type { Access } from './odooWarehouse';
import { NO_ACCESS } from './odooWarehouse';
import type { ThemeId } from './themes';

export type RoleKey = 'tech' | 'dispatch' | 'office' | 'sales' | 'warehouse' | 'owner';

export const ROLE_KEYS: readonly RoleKey[] = ['tech', 'dispatch', 'office', 'sales', 'warehouse', 'owner'];

export const ROLE_CARDS: Record<RoleKey, { label: string; color: string; icon: string; theme: ThemeId }> = {
  tech: { label: 'Tech', color: '#0F3D26', icon: '🔧', theme: 'field' },
  dispatch: { label: 'Dispatch', color: '#1F6FB5', icon: '🗺️', theme: 'dispatch' },
  office: { label: 'Office', color: '#2E7D57', icon: '🧾', theme: 'office' },
  sales: { label: 'Sales', color: '#3F3D9E', icon: '💬', theme: 'sales' },
  warehouse: { label: 'Warehouse', color: '#B8620A', icon: '📦', theme: 'warehouse' },
  owner: { label: 'Owner', color: '#8A6A12', icon: '⭐', theme: 'owner' },
};

export function isRoleKey(v: unknown): v is RoleKey {
  return typeof v === 'string' && (ROLE_KEYS as readonly string[]).includes(v);
}

/** The roles this access can work in, in bubble order. Just Tech for someone with no role (no picker is shown for one role). */
export function rolesFor(a: Access): RoleKey[] {
  const held = new Set<RoleKey>();
  if (a.owner) ROLE_KEYS.forEach((r) => held.add(r));
  if (a.dispatch) held.add('dispatch');
  if (a.office) held.add('office');
  if (a.sales) held.add('sales');
  if (a.warehouse || a.purchasing) held.add('warehouse');
  if (a.tech) held.add('tech');
  // A person with no role at all is a tech: nobody is left without one.
  if (held.size === 0) held.add('tech');
  return ROLE_KEYS.filter((r) => held.has(r));
}

/** What the app opens while working as `role`: only that role's areas (the owner keeps everything). */
export function accessForRole(role: RoleKey, real: Access): Access {
  switch (role) {
    case 'owner':
      return real.owner ? real : { ...real, owner: true };
    case 'dispatch':
      return { ...NO_ACCESS, dispatch: true };
    case 'office':
      return { ...NO_ACCESS, office: true };
    case 'sales':
      return { ...NO_ACCESS, sales: true };
    case 'warehouse':
      return { ...NO_ACCESS, warehouse: true, purchasing: true };
    default:
      return { ...NO_ACCESS, tech: true };
  }
}

/** The access to use: narrowed to the chosen role when it is one this person holds, else everything they hold. */
export function narrowAccess(real: Access, active: RoleKey | null): Access {
  if (!active || !rolesFor(real).includes(active)) return real;
  return accessForRole(active, real);
}

/** The role in use: the chosen one if held, the only one if there is just Tech, else none yet (show the start screen). */
export function effectiveRole(real: Access, active: RoleKey | null): RoleKey | null {
  const roles = rolesFor(real);
  if (active && roles.includes(active)) return active;
  return roles.length === 1 ? roles[0]! : null;
}
