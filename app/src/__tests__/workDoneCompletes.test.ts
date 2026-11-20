import { jobSteps, nextStep } from '../lib/jobSteps';
import type { Job } from '../lib/jobs';

const job = { id: 'j', status: 'done', steps: { arrivedAt: 1, workDoneAt: 2 } } as unknown as Job;

describe('after Work done', () => {
  it('only Paid is left to do, not skipped steps like Inspect', () => {
    expect(nextStep(jobSteps(job, []))?.id).toBe('paid');
  });
  it('is finished once paid steps are done too', () => {
    expect(nextStep(jobSteps(job, [])?.map((s) => (s.id === 'paid' ? { ...s, done: true } : s)))).toBeNull();
  });
});
