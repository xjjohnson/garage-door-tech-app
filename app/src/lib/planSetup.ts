/**
 * Setting a maintenance plan up in Odoo once the customer accepts it: an
 * agreement for the customer (a record of the plan and its dates), a repeating
 * Field Service visit at their house with the plan's schedule, and a note on
 * the quotation. Odoo's own scheduled action then makes each visit about
 * `daysAhead` days before it is due; the phone never invents visits. Kept free
 * of React; the client is passed in.
 */
import type { OdooClient } from './odoo';
import type { TicketPlan } from './ticket';
import { createAgreement, createRepeat, fetchAgreements, recurringSupport } from './odooRecurring';

type Client = Pick<OdooClient, 'call' | 'session'>;

/** What was made before a failure, so trying again doesn't make it twice. */
export interface PlanProgress {
  repeatId?: number;
  agreementId?: number;
}

export class PlanSetupError extends Error {
  constructor(
    message: string,
    readonly progress: PlanProgress,
  ) {
    super(message);
  }
}

/** A date this many months later (the same day of the month, or the month's last day). */
export function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}

/** The end of the plan's term, or undefined for an ongoing plan. */
export const planEnd = (p: Pick<TicketPlan, 'termMonths'>, start: number): number | undefined => (p.termMonths > 0 ? addMonths(start, p.termMonths) : undefined);

const fieldsOf = async (c: Client, model: string): Promise<string[]> => {
  try {
    return Object.keys((await c.call(model, 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>);
  } catch {
    return [];
  }
};

/**
 * Odoo's frequency set for a plan: one named for the plan's schedule, made the
 * first time and reused after. Each visit is created `daysAhead` days early.
 */
export async function planFrequencySet(c: Client, p: Pick<TicketPlan, 'everyMonths' | 'daysAhead'>): Promise<number> {
  const name = p.everyMonths === 12 ? 'Every year' : p.everyMonths === 1 ? 'Every month' : `Every ${p.everyMonths} months`;
  const setName = `Maintenance plan: ${name}, ${p.daysAhead} days ahead`;
  const found = (await c.call('fsm.frequency.set', 'search', [[['name', '=', setName]]], { limit: 1 })) as number[];
  if (found[0]) return found[0];
  const have = await fieldsOf(c, 'fsm.frequency.set');
  const rule = await fieldsOf(c, 'fsm.frequency');
  if (!have.includes('fsm_frequency_ids') || !rule.includes('interval_type')) throw new Error('Odoo has no repeat frequencies to use. In Odoo, Field Service > Configuration > Frequencies, check that the app is installed.');
  const yearly = p.everyMonths % 12 === 0;
  return (await c.call('fsm.frequency.set', 'create', [
    {
      name: setName,
      ...(have.includes('buffer_early') ? { buffer_early: p.daysAhead } : {}),
      fsm_frequency_ids: [[0, 0, { name, interval_type: yearly ? 'yearly' : 'monthly', ...(rule.includes('interval') ? { interval: yearly ? p.everyMonths / 12 : p.everyMonths } : {}) }]],
    },
  ])) as number;
}

const planNotesText = (p: TicketPlan) => [`Maintenance plan: ${p.name}.`, p.description, `Visit every ${p.everyMonths} months${p.termMonths ? `, for ${p.termMonths} months` : ', ongoing'}. Plan #${p.id}.`].filter(Boolean).join(' ');

/**
 * Makes the plan for the customer. `order` is the accepted quotation: a note
 * is posted on it. Pass `prior` from an earlier failed try to carry on from it.
 */
export async function setUpPlan(c: Client, partnerId: number, who: { customer: string; address: string }, plan: TicketPlan, now: number, opts: { orderId?: number; prior?: PlanProgress } = {}): Promise<PlanProgress> {
  const done: PlanProgress = { ...opts.prior };
  try {
    const support = await recurringSupport(c);
    if (!support.repeats && !support.agreements) throw new Error('Odoo needs the Field Service Recurring or Agreement app to set up a plan.');
    const end = planEnd(plan, now);
    if (support.repeats && !done.repeatId) {
      const every = await planFrequencySet(c, plan);
      done.repeatId = await createRepeat(c, partnerId, { customer: who.customer, address: who.address, every, start: addMonths(now, plan.everyMonths), what: plan.name, templateId: plan.jobTypeId, end });
    }
    if (support.agreements && !done.agreementId) {
      done.agreementId = await createAgreement(c, partnerId, { name: plan.name, notes: planNotesText(plan), start: now, end, repeatId: done.repeatId });
    }
  } catch (e) {
    throw new PlanSetupError(e instanceof Error ? e.message : String(e), done);
  }
  if (opts.orderId) {
    await c
      .call('sale.order', 'message_post', [[opts.orderId]], { body: `Maintenance plan set up: ${plan.name}. Visits every ${plan.everyMonths} months.`, message_type: 'comment', subtype_xmlid: 'mail.mt_note' })
      .catch(() => undefined);
  }
  return done;
}

export interface ActivePlan {
  name: string;
  end?: string;
}

/** The plan this customer is on now: an agreement that has not ended and is named for one of the plans. */
export async function activePlanFor(c: Client, partnerId: number, planNames: string[], today: string): Promise<ActivePlan | undefined> {
  const names = planNames.map((n) => n.toLowerCase());
  const rows = await fetchAgreements(c, partnerId, 50);
  const on = rows.find((a) => a.active && names.includes(a.name.toLowerCase()) && (!a.end || a.end >= today));
  return on ? { name: on.name, end: on.end } : undefined;
}
