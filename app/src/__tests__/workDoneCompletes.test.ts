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

import { workDoneLabel } from '../lib/jobSteps';

describe('workDoneLabel', () => {
  const inv = (total: number, paid: number) => ({ id: 'i', total, payments: paid ? [{ id: 'p', method: 'cash', amount: paid, at: 1, reference: '' }] : [] }) as never;
  const withTicket = { status: 'done', steps: { workDoneAt: 2 }, ticket: { lines: [{}] } } as never;
  it('is empty until the work is done', () => expect(workDoneLabel({ status: 'open', steps: {} } as never, [])).toBeUndefined());
  it('says Estimate for an estimate with no invoice, never Waiting for payment', () => expect(workDoneLabel(withTicket, [])).toBe('Estimate'));
  it('says Waiting for payment only with an unpaid invoice', () => expect(workDoneLabel(withTicket, [inv(100, 0)])).toBe('Waiting for payment'));
  it('says Done when paid or nothing to bill', () => {
    expect(workDoneLabel(withTicket, [inv(100, 100)])).toBe('Done');
    expect(workDoneLabel({ status: 'done', steps: {} } as never, [])).toBe('Done');
  });
});
