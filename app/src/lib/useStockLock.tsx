import { useDepartments } from './useDepartments';
import { useOdoo } from './useOdoo';
import { useStock } from './useStock';
import { useEffect } from 'react';

/**
 * Whether this person may change truck counts by hand: the warehouse manager
 * and the owner (from their Odoo groups, the last known role kept offline).
 * Signed out (phone-only use) there is just the one person, so yes. A tech,
 * and Developer > Look as a tech, may look but not change.
 */
export function useCanAdjustStock(): boolean {
  const { client } = useOdoo();
  const { access, ready } = useDepartments();
  return !client || (ready && access.warehouse);
}

/** Renders nothing: tells the stock store when hand edits are off, so no screen can slip one through. */
export function StockLock() {
  const can = useCanAdjustStock();
  const { setLocked } = useStock();
  useEffect(() => setLocked(!can), [can, setLocked]);
  return null;
}
