import { router } from 'expo-router';
import { useCallback } from 'react';
import { DEFAULT_MATCH_FORM } from './forms';
import { Job } from './jobs';
import { log } from './log';
import { Appointment } from './schedule';
import { useJobs } from './useJobs';
import { useSchedule } from './useSchedule';

/**
 * Opens the job hub for a visit on the schedule, making the job the first
 * time (so the visit and its job stay tied together).
 */
export function useStartJob() {
  const { jobs, add } = useJobs();
  const { update } = useSchedule();
  return useCallback(
    (a: Appointment): Job => {
      const existing = a.jobId ? jobs.find((j) => j.id === a.jobId) : undefined;
      if (existing) {
        router.push({ pathname: '/job/[id]', params: { id: existing.id } });
        return existing;
      }
      const job = add({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: a.name, address: a.address, phone: a.phone, notes: '' }, { title: '' }, { what: a.what, customerId: a.customerId });
      update(a.id, { jobId: job.id });
      log.info('job', `made ${job.id} for visit ${a.id}`);
      router.push({ pathname: '/job/[id]', params: { id: job.id } });
      return job;
    },
    [jobs, add, update],
  );
}
