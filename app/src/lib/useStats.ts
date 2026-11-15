import { useEffect, useMemo, useState } from 'react';
import { log } from './log';
import { odooSnapshot } from './odooStats';
import { Snapshot, snapshot } from './stats';
import { useInvoices } from './useInvoices';
import { useJobs } from './useJobs';
import { useOdoo } from './useOdoo';

/** The business numbers: from Odoo once signed in, from what's saved on the phone until then (or with no signal). */
export function useStats(now: () => number): { stats: Snapshot; fromOdoo: boolean } {
  const { jobs } = useJobs();
  const { invoices } = useInvoices();
  const { status, client } = useOdoo();
  const local = useMemo(() => snapshot(jobs, invoices, now()), [jobs, invoices, now]);
  const [remote, setRemote] = useState<Snapshot | null>(null);
  useEffect(() => {
    if (status !== 'signedIn' || !client) return;
    let live = true;
    odooSnapshot(client, now())
      .then((s) => live && setRemote(s))
      .catch((e) => log.warn('odoo', `business numbers: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      live = false;
    };
  }, [status, client, now]);
  return { stats: remote ?? local, fromOdoo: !!remote };
}
