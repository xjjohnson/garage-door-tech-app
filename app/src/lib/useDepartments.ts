import { useEffect, useState } from 'react';
import { Access, departmentAccess, NO_ACCESS } from './odooWarehouse';
import { useOdoo } from './useOdoo';

/** Which department areas the signed-in Odoo user may open. Nothing until Odoo answers, and for anyone not signed in. */
export function useDepartments(): { access: Access; ready: boolean } {
  const { client } = useOdoo();
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
  }, [client]);
  return state;
}
