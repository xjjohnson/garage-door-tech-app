import { useEffect, useState } from 'react';
import { customerTypeOf, typesFor } from './customerTypes';
import { useInvoices } from './useInvoices';
import { useOdoo } from './useOdoo';

/** The customer's type, read from their tag in Odoo; undefined when unknown (offline, no tag, no Odoo contact). */
export function useCustomerType(partnerId: number | undefined): { type: string | undefined; setType: (t: string | undefined) => void } {
  const { client } = useOdoo();
  const { business } = useInvoices();
  const [type, setType] = useState<string | undefined>();
  const all = typesFor(business).join('|');
  useEffect(() => {
    if (!client || !partnerId) return setType(undefined);
    let live = true;
    customerTypeOf(client, partnerId, all.split('|'))
      .then((t) => live && setType(t))
      .catch(() => live && setType(undefined));
    return () => {
      live = false;
    };
  }, [client, partnerId, all]);
  return { type, setType };
}
