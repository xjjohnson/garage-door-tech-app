import { useEffect, useState } from 'react';
import { onDevFlags, rolePreview } from './devFlags';
import { Access, departmentAccess, NO_ACCESS } from './odooWarehouse';
import { useOdoo } from './useOdoo';

/** Which department areas the signed-in Odoo user may open. Nothing until Odoo answers, and for anyone not signed in. */
export function useDepartments(): { access: Access; ready: boolean } {
  const { client } = useOdoo();
  // Look as a tech turns on or off while the app is open: ask again.
  const [flagTick, setFlagTick] = useState(0);
  useEffect(() => onDevFlags(() => setFlagTick((n) => n + 1)), []);
  const [state, setState] = useState<{ access: Access; ready: boolean }>({ access: NO_ACCESS, ready: false });
  useEffect(() => {
    let alive = true;
    if (!client) {
      setState({ access: NO_ACCESS, ready: true });
      return;
    }
    setState({ access: NO_ACCESS, ready: false });
    departmentAccess(client).then(
      (access) => alive && setState({ access, ready: true }),
      () => alive && setState({ access: NO_ACCESS, ready: true }),
    );
    return () => {
      alive = false;
    };
  }, [client, flagTick]);
  return state;
}

/**
 * Whether to show the owner's screens. Signed out (phone-only use) it is
 * the one person using the phone, so yes. Signed in, only the owner; a tech
 * and the "Look as a tech" preview get no. Not ready until Odoo answers.
 */
export function useOwner(): { owner: boolean; ready: boolean } {
  const { status, client } = useOdoo();
  const { access, ready } = useDepartments();
  if (status === 'loading' || status === 'signingIn') return { owner: false, ready: false };
  if (!client) return { owner: (rolePreview() ?? 'owner') === 'owner', ready: true };
  return { owner: access.owner, ready };
}

/**
 * True for a plain technician: signed in (or looking as one) with none of the
 * owner, dispatch, office or sales roles. Techs get a short bottom bar (Home,
 * Jobs, Tools) and Needs you only for their own jobs. Not true until Odoo has
 * answered, so the full bar never flickers into the short one.
 */
export function useTech(): boolean {
  const { status, client } = useOdoo();
  const { access, ready } = useDepartments();
  if (status === 'loading' || status === 'signingIn' || !ready) return false;
  if (!client) {
    const p = rolePreview();
    return p !== null && p !== 'owner' && p !== 'dispatcher' && p !== 'office' && p !== 'sales';
  }
  return !(access.owner || access.dispatch || access.office || access.sales);
}
