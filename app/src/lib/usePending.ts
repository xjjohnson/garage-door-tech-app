import { useMemo } from 'react';
import { Pending, pendingSync } from './pending';
import { useCustomers } from './useCustomers';
import { useInvoices } from './useInvoices';
import { useJobs } from './useJobs';
import { useJobsSince } from './useJobsSince';

/** What's waiting to go to Odoo, kept up to date as data changes. */
export function usePending(): Pending {
  const { customers } = useCustomers();
  const { jobs } = useJobs();
  const { invoices } = useInvoices();
  const since = useJobsSince();
  return useMemo(() => pendingSync(customers, jobs, invoices, since), [customers, jobs, invoices, since]);
}
