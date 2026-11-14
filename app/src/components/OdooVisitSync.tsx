/**
 * Keeps every visit on the schedule in Odoo, in the background while signed
 * in: a visit with no job becomes an Odoo job (a Field Service order), and a
 * visit marked done or cancelled on the phone finishes or cancels that job.
 * Visits that belong to a phone job are sent by the job sync. Nothing booked
 * before this phone started sending is written to Odoo. Renders nothing.
 */
import { useCallback, useEffect, useRef } from 'react';
import { findCustomer } from '../lib/customers';
import { log } from '../lib/log';
import { canSendJobs, myId, partnerFor, visitId } from '../lib/odooJobs';
import { createVisitOrder, pushVisitStatus, visitOrder, visitsToCheck, visitsToClose, visitsToCreate } from '../lib/odooVisits';
import { readJobStates } from '../lib/odooJobs';
import { onSyncNow } from '../lib/syncNow';
import type { OdooPartner } from '../lib/customerSync';
import { useAppForeground } from '../lib/useAppForeground';
import { useCustomers } from '../lib/useCustomers';
import { useJobsSince } from '../lib/useJobsSince';
import { useOdoo } from '../lib/useOdoo';
import { useSchedule } from '../lib/useSchedule';

const EVERY_MS = 4 * 60_000;
const AFTER_CHANGE_MS = 4000;
const RETRY_MS = 10 * 60_000;
const BATCH = 10;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function OdooVisitSync({ now = Date.now }: { now?: () => number }) {
  const { status, client } = useOdoo();
  const schedule = useSchedule();
  const customersApi = useCustomers();
  const since = useJobsSince(now);
  const latest = useRef({ schedule, customersApi, since });
  latest.current = { schedule, customersApi, since };
  const running = useRef(false);
  const failed = useRef(new Map<string, number>());

  const online = status === 'signedIn' && !!client && canSendJobs(client) && schedule.loaded && customersApi.loaded && since !== null;

  const pass = useCallback(async () => {
    if (!client || running.current) return;
    running.current = true;
    try {
      const { schedule: S, customersApi: C, since: from } = latest.current;
      const retryable = (key: string) => now() - (failed.current.get(key) ?? 0) > RETRY_MS;

      // 1. Visits with no job become Odoo jobs, given to me so they stay on my schedule.
      // A worker is needed for that: without one the job would be unassigned and leave the schedule.
      let known: Promise<OdooPartner[]> | undefined;
      if (myId(client)) {
        for (const v of visitsToCreate(S.appointments, from).filter((x) => retryable(x.id)).slice(0, BATCH)) {
          try {
            const c = (v.customerId ? C.customers.find((x) => x.id === v.customerId) : undefined) ?? findCustomer(C.customers, { customer: v.name, address: v.address, phone: v.phone });
            let partnerId = c?.odooId;
            if (!partnerId) {
              known ??= client.partners();
              partnerId = await partnerFor(client, c ?? { name: v.name, phone: v.phone, email: '', address: v.address, notes: '' }, known);
              if (c) C.apply((prev) => prev.map((x) => (x.id === c.id ? { ...x, odooId: partnerId, syncedAt: x.updatedAt } : x)));
            }
            const ref = await createVisitOrder(client, partnerId, v);
            const t = now();
            latest.current.schedule.replace([v.id], [{ ...v, id: visitId(ref), odooName: ref.name, updatedAt: t, syncedAt: t }]);
            log.info('odoo', `visit ${v.id} sent as ${ref.model} ${ref.id}`);
          } catch (e) {
            failed.current.set(v.id, now());
            log.warn('odoo', `visit ${v.id} not sent: ${message(e)}`);
          }
        }
      }

      // 2. Visits marked done or cancelled on the phone finish or cancel their Odoo job.
      for (const v of visitsToClose(latest.current.schedule.appointments, from).filter((x) => retryable(`close:${x.id}`)).slice(0, BATCH)) {
        const ref = visitOrder(client, v);
        if (!ref) continue;
        try {
          await pushVisitStatus(client, ref, v);
          latest.current.schedule.markSynced(v.id, v.updatedAt);
        } catch (e) {
          failed.current.set(`close:${v.id}`, now());
          log.warn('odoo', `visit ${v.id} (${v.status}) not sent: ${message(e)}`);
        }
      }

      // 3. Visits whose Odoo job was deleted there leave the schedule.
      const check = visitsToCheck(latest.current.schedule.appointments);
      for (const model of ['fsm.order', 'project.task'] as const) {
        const mine = check.map((v) => ({ v, ref: visitOrder(client, v) })).filter((x) => x.ref?.model === model);
        if (!mine.length) continue;
        const states = await readJobStates(client, model, mine.map((x) => x.ref!.id));
        const gone = new Set(states.filter((s) => s.deleted).map((s) => s.id));
        const drop = mine.filter((x) => gone.has(x.ref!.id)).map((x) => x.v.id);
        if (drop.length) {
          latest.current.schedule.replace(drop, []);
          log.info('odoo', `${drop.length} visit(s) removed: their jobs were deleted in Odoo`);
        }
      }
    } catch (e) {
      log.warn('odoo', `visit sync: ${message(e)}`);
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

  useEffect(() => {
    if (!online) return;
    const t = setTimeout(pass, AFTER_CHANGE_MS);
    return () => clearTimeout(t);
  }, [online, pass, schedule.appointments]);

  useAppForeground(() => {
    if (online) pass();
  });

  useEffect(() => {
    if (!online) return;
    return onSyncNow(() => {
      failed.current.clear();
      return pass();
    });
  }, [online, pass]);

  return null;
}
