import { router } from 'expo-router';
import { useCallback } from 'react';
import { DEFAULT_MATCH_FORM } from './forms';
import { Job } from './jobs';
import { log } from './log';
import type { OdooTask } from './odoo';
import type { OdooJobRef } from './odooJobs';
import { Appointment } from './schedule';
import { useJobs } from './useJobs';
import { useOdoo } from './useOdoo';
import { useSchedule } from './useSchedule';

/** The Odoo job number in a visit pulled from Odoo ("odoo-12"), if it is one. */
export const odooIdOfVisit = (a: Pick<Appointment, 'id'>): number | undefined => {
  const m = /^odoo-(\d+)$/.exec(a.id);
  return m ? Number(m[1]) : undefined;
};

/**
 * The phone's job for an Odoo job: the one already tied to it, or a new one
 * made from it and tied to it, so the ticket, photos and inspection have
 * somewhere to live and the sync doesn't send it to Odoo again.
 */
export function useJobForOdoo() {
  const { jobs, add, setOdooJob } = useJobs();
  return useCallback(
    (ref: OdooJobRef, from: { customer: string; address: string; phone: string; what: string; notes?: string }): Job => {
      const existing = jobs.find((j) => j.odooJob?.id === ref.id && j.odooJob.model === ref.model);
      if (existing) return existing;
      const job = add({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: from.customer, address: from.address, phone: from.phone, notes: from.notes ?? '' }, { title: '' }, { what: from.what });
      setOdooJob(job.id, ref);
      log.info('job', `made ${job.id} for Odoo ${ref.name}`);
      return job;
    },
    [jobs, add, setOdooJob],
  );
}

/** Which Odoo model jobs are on this Odoo. */
export const jobModel = (kind: 'oca' | 'task' | 'none'): OdooJobRef['model'] => (kind === 'oca' ? 'fsm.order' : 'project.task');

/** Opens the job page for a job in Odoo's list. */
export function useOpenOdooJob() {
  const jobFor = useJobForOdoo();
  const { client } = useOdoo();
  return useCallback(
    (t: OdooTask): Job => {
      const ref: OdooJobRef = { model: jobModel(client?.session.kind ?? 'oca'), id: t.id, name: t.name };
      const job = jobFor(ref, { customer: t.customer, address: t.address, phone: t.phone, what: firstLine(t.notes), notes: t.notes });
      router.push({ pathname: '/job/[id]', params: { id: job.id } });
      return job;
    },
    [jobFor, client],
  );
}

const firstLine = (t: string) => t.split('\n').map((l) => l.trim()).find((l) => l && !/^App job /.test(l)) ?? '';

/**
 * Opens the job hub for a visit on the schedule, making the job the first
 * time (so the visit and its job stay tied together). A visit that came from
 * Odoo gets a job tied to that Odoo job.
 */
export function useStartJob() {
  const { jobs, add } = useJobs();
  const { update } = useSchedule();
  const jobFor = useJobForOdoo();
  const { client } = useOdoo();
  return useCallback(
    (a: Appointment): Job => {
      const existing = a.jobId ? jobs.find((j) => j.id === a.jobId) : undefined;
      if (existing) {
        router.push({ pathname: '/job/[id]', params: { id: existing.id } });
        return existing;
      }
      const odooId = odooIdOfVisit(a);
      const job =
        odooId !== undefined
          ? jobFor({ model: jobModel(client?.session.kind ?? 'oca'), id: odooId, name: a.odooName ?? '' }, { customer: a.name, address: a.address, phone: a.phone, what: a.what })
          : add({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: a.name, address: a.address, phone: a.phone, notes: '' }, { title: '' }, { what: a.what, customerId: a.customerId });
      update(a.id, { jobId: job.id });
      log.info('job', `made ${job.id} for visit ${a.id}`);
      router.push({ pathname: '/job/[id]', params: { id: job.id } });
      return job;
    },
    [jobs, add, update, jobFor, client],
  );
}
