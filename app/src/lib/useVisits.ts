import { useMemo } from 'react';
import { odooIdOfVisit } from './useStartJob';
import { Appointment } from './schedule';
import { Job } from './jobs';
import { useCustomersIfAny } from './useCustomers';
import { useJobs } from './useJobs';
import { useSchedule } from './useSchedule';

/**
 * The address to show for a visit: its own, else the address on the phone's
 * job for it (the one the job screen shows, including one fixed by hand
 * there), else the customer's. A visit pulled from Odoo whose place has no
 * street, or one whose job was corrected later, so still gets a pin and
 * directions.
 */
export function visitAddress(a: Appointment, jobs: Job[], customerAddress?: (id: string) => string | undefined): string {
  if (a.address.trim()) return a.address;
  const oid = odooIdOfVisit(a);
  const job = jobs.find((j) => (a.jobId && j.id === a.jobId) || (oid !== undefined && j.odooJob?.id === oid));
  if (job?.address.trim()) return job.address;
  return (a.customerId && customerAddress?.(a.customerId)?.trim()) || '';
}

/** The schedule with every visit's address filled in as above, for the screens that map, route or list visits. */
export function useVisits(): Appointment[] {
  const { appointments } = useSchedule();
  const { jobs } = useJobs();
  const customers = useCustomersIfAny()?.customers;
  return useMemo(() => {
    const addr = (id: string) => customers?.find((c) => c.id === id)?.address;
    return appointments.map((a) => {
      const address = visitAddress(a, jobs, addr);
      return address === a.address ? a : { ...a, address };
    });
  }, [appointments, jobs, customers]);
}
