import { useEffect, useState } from 'react';
import { DEFAULT_LIMITS, DeptLimits, readLimits } from './deptLimits';
import { useOdoo } from './useOdoo';

/** The department limits from Odoo (the defaults until Odoo answers). */
export function useLimits(): DeptLimits {
  const { client } = useOdoo();
  const [limits, setLimits] = useState<DeptLimits>(DEFAULT_LIMITS);
  useEffect(() => {
    let alive = true;
    if (client) readLimits(client).then((l) => alive && setLimits(l));
    return () => {
      alive = false;
    };
  }, [client]);
  return limits;
}
