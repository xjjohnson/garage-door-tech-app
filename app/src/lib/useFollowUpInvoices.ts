import { useMemo } from 'react';
import { asFollowUpInvoice, notOnPhone } from './odooFollowUps';
import { useOdooInvoiceRows } from './odooInvoiceCache';
import { Invoice } from './invoices';
import { useCustomers } from './useCustomers';
import { useInvoices } from './useInvoices';

/** The invoices follow-ups are worked out from: the phone's, plus Odoo's own that the phone has no copy of. */
export function useFollowUpInvoices(): Invoice[] {
  const { invoices } = useInvoices();
  const { customers } = useCustomers();
  const rows = useOdooInvoiceRows();
  return useMemo(() => {
    const extra = notOnPhone(rows, invoices).map((r) => asFollowUpInvoice(r, customers.find((c) => c.odooId === r.partnerId)?.id));
    return extra.length ? [...invoices, ...extra] : invoices;
  }, [invoices, customers, rows]);
}
