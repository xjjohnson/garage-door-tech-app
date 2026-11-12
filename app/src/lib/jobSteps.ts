/**
 * The job hub's steps, in the order a visit goes: On my way, Arrived,
 * Inspect, Ticket (the step id stays "quote"), Work, Paid. Each step's state comes from what's saved on
 * the job (and its invoice), so the hub never disagrees with the rest of
 * the app. Kept free of React so it can be tested directly.
 */
import { Invoice, invoiceStatus } from './invoices';
import { Job } from './jobs';

export type StepId = 'onMyWay' | 'arrived' | 'inspect' | 'quote' | 'work' | 'paid';

export interface Step {
  id: StepId;
  label: string;
  done: boolean;
  /** One line on what happened, e.g. "9:58 am" or "Better, $485". */
  detail?: string;
}

export const STEP_LABEL: Record<StepId, string> = {
  onMyWay: 'On my way',
  arrived: 'Arrived',
  inspect: 'Inspect',
  quote: 'Ticket',
  work: 'Work',
  paid: 'Paid',
};

/** The live invoice made from this job, newest first. */
export function jobInvoice(job: Pick<Job, 'id'>, invoices: Invoice[]): Invoice | undefined {
  return invoices.filter((i) => i.jobId === job.id && !i.voidedAt).sort((a, b) => b.createdAt - a.createdAt)[0];
}

export function jobSteps(job: Job, invoices: Invoice[]): Step[] {
  const inv = jobInvoice(job, invoices);
  const s = job.steps ?? {};
  const paid = inv ? invoiceStatus(inv) === 'paid' : false;
  return [
    { id: 'onMyWay', label: STEP_LABEL.onMyWay, done: !!s.onMyWayAt || !!s.arrivedAt },
    { id: 'arrived', label: STEP_LABEL.arrived, done: !!s.arrivedAt },
    { id: 'inspect', label: STEP_LABEL.inspect, done: !!job.inspection },
    { id: 'quote', label: STEP_LABEL.quote, done: !!job.accepted || (job.ticket?.lines.length ?? 0) > 0 },
    { id: 'work', label: STEP_LABEL.work, done: !!s.workDoneAt || job.status === 'done' },
    { id: 'paid', label: STEP_LABEL.paid, done: paid },
  ];
}

/** The first step not done yet, or null when the job is finished. */
export function nextStep(steps: Step[]): Step | null {
  return steps.find((x) => !x.done) ?? null;
}

/** "0:24" since arriving, for the header. */
export function onSiteFor(arrivedAt: number | undefined, now: number): string | null {
  if (!arrivedAt || now < arrivedAt) return null;
  const mins = Math.floor((now - arrivedAt) / 60000);
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
}

/** An sms: link with the text filled in, for texting by hand. */
export function smsLink(phone: string, body: string): string | undefined {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.replace(/\+/g, '').length < 3) return undefined;
  return `sms:${digits}?body=${encodeURIComponent(body)}`;
}
