/**
 * Keeps the phone's jobs and Odoo's Field Service orders in step, in the
 * background while signed in: new jobs go to Odoo (so they show on Jobs ›
 * Team), a visit booked or moved on the phone moves the order, and an order
 * given a time or a worker in Odoo moves or removes the phone's visit. Runs
 * shortly after a change, when the app comes back, and every few minutes.
 * Renders nothing.
 */
import { useCallback, useEffect, useRef } from 'react';
import { log } from '../lib/log';
import { applyState, canSendJobs, createOdooJob, myId, readJobStates, visitId, writeVisit } from '../lib/odooJobs';
import { Appointment } from '../lib/schedule';
import { useAppForeground } from '../lib/useAppForeground';
import { useCustomers } from '../lib/useCustomers';
import { useJobs } from '../lib/useJobs';
import { useOdoo } from '../lib/useOdoo';
import { useSchedule } from '../lib/useSchedule';

const EVERY_MS = 3 * 60_000;
const AFTER_CHANGE_MS = 4000;
/** A job Odoo refused isn't tried again for this long. */
const RETRY_MS = 10 * 60_000;
/** Jobs sent in one pass, so a phone full of old jobs doesn't hold Odoo up. */
const BATCH = 10;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function OdooJobSync({ now = Date.now }: { now?: () => number }) {
  const { status, client } = useOdoo();
  const jobsApi = useJobs();
  const schedule = useSchedule();
  const customersApi = useCustomers();
  const latest = useRef({ jobsApi, schedule, customersApi });
  latest.current = { jobsApi, schedule, customersApi };
  const running = useRef(false);
  const failed = useRef(new Map<string, number>());

  const online = status === 'signedIn' && !!client && canSendJobs(client) && jobsApi.loaded && schedule.loaded;

  const pass = useCallback(async () => {
    if (!client || running.current) return;
    running.current = true;
    try {
      const { jobsApi: J, schedule: S, customersApi: C } = latest.current;
      const visits: Appointment[] = [...S.appointments];
      const bookedFor = (jobId: string) => visits.find((a) => a.jobId === jobId && a.status === 'booked');

      // 1. New jobs become Odoo jobs.
      const toSend = J.jobs.filter((j) => j.status === 'open' && !j.odooJob && (j.customer.trim() || j.address.trim()) && now() - (failed.current.get(j.id) ?? 0) > RETRY_MS).slice(0, BATCH);
      for (const job of toSend) {
        // Started from a visit that came from Odoo: it's that Odoo job already.
        const fromOdoo = visits.find((a) => a.jobId === job.id && /^odoo-\d+$/.test(a.id));
        if (fromOdoo) {
          J.setOdooJob(job.id, { model: client.session.kind === 'oca' ? 'fsm.order' : 'project.task', id: Number(fromOdoo.id.slice(5)), name: fromOdoo.what || fromOdoo.name });
          continue;
        }
        try {
          const c = C.customers.find((x) => x.id === job.customerId);
          let partnerId = c?.odooId;
          if (!partnerId) {
            partnerId = await client.createPartner(c ?? { name: job.customer.trim() || job.address.trim(), phone: job.phone, email: '', address: job.address, notes: '' });
            if (c) C.apply((prev) => prev.map((x) => (x.id === c.id ? { ...x, odooId: partnerId, syncedAt: x.updatedAt } : x)));
          }
          const visit = bookedFor(job.id);
          const ref = await createOdooJob(client, partnerId, { customer: job.customer, address: job.address, phone: job.phone, what: job.what ?? '', notes: job.notes }, visit);
          J.setOdooJob(job.id, ref);
          if (visit) {
            const t = now();
            S.replace([visit.id], [{ ...visit, id: visitId(ref), updatedAt: t, syncedAt: t }]);
          }
          log.info('odoo', `job ${job.id} sent as ${ref.model} ${ref.id}`);
        } catch (e) {
          failed.current.set(job.id, now());
          log.warn('odoo', `job ${job.id} not sent: ${message(e)}`);
        }
      }

      // 2. Visits booked or moved on the phone for jobs already in Odoo.
      const fresh = latest.current;
      for (const job of fresh.jobsApi.jobs) {
        const ref = job.odooJob;
        if (!ref) continue;
        const v = fresh.schedule.appointments.find((a) => a.jobId === job.id && a.status === 'booked');
        if (!v) continue;
        const unsent = v.id !== visitId(ref) || v.updatedAt > (v.syncedAt ?? 0);
        if (!unsent) continue;
        try {
          await writeVisit(client, ref, v);
          const t = now();
          if (v.id !== visitId(ref)) fresh.schedule.replace([v.id], [{ ...v, id: visitId(ref), updatedAt: t, syncedAt: t }]);
          else fresh.schedule.markSynced(v.id, v.updatedAt);
        } catch (e) {
          log.warn('odoo', `visit for job ${job.id} not sent: ${message(e)}`);
        }
      }

      // 3. What Odoo says now: the time and worker set by whoever dispatches.
      const sent = latest.current.jobsApi.jobs.filter((j) => j.odooJob && j.status === 'open');
      if (sent.length === 0) return;
      const model = sent[0].odooJob!.model;
      const states = await readJobStates(client, model, sent.filter((j) => j.odooJob!.model === model).map((j) => j.odooJob!.id));
      const me = myId(client);
      const add: Appointment[] = [];
      const drop: string[] = [];
      const S2 = latest.current.schedule;
      for (const st of states) {
        const job = sent.find((j) => j.odooJob!.id === st.id)!;
        const id = `odoo-${st.id}`;
        const v = S2.appointments.find((a) => a.id === id);
        if (v && v.updatedAt > (v.syncedAt ?? 0)) continue; // the phone's change goes first, next pass
        if (!v) {
          // Given a time and given to me in Odoo: put it on my schedule.
          if (st.start !== undefined && (!st.personId || st.personId === me) && !st.done) {
            const t = now();
            add.push({ id, start: st.start, minutes: st.minutes ?? 60, jobId: job.id, ...(job.customerId ? { customerId: job.customerId } : {}), name: job.customer, address: job.address, phone: job.phone, what: job.what ?? '', status: 'booked', createdAt: t, updatedAt: t, syncedAt: t });
          }
          continue;
        }
        const next = applyState(v, st, me, now());
        if (!next) continue;
        if (next.keep) add.push(next.keep);
        else drop.push(v.id);
      }
      if (add.length || drop.length) S2.replace(drop, add);
    } catch (e) {
      log.warn('odoo', `job sync: ${message(e)}`);
    } finally {
      running.current = false;
    }
  }, [client, now]);

  useEffect(() => {
    if (!online) return;
    pass();
    const t = setInterval(pass, EVERY_MS);
    return () => clearInterval(t);
  }, [online, pass]);

  // Shortly after jobs or visits change on the phone.
  useEffect(() => {
    if (!online) return;
    const t = setTimeout(pass, AFTER_CHANGE_MS);
    return () => clearTimeout(t);
  }, [online, pass, jobsApi.jobs, schedule.appointments]);

  useAppForeground(() => {
    if (online) pass();
  });

  return null;
}
