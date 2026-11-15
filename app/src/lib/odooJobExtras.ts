/**
 * The extra rows on a job that live on its Field Service order in Odoo: Job
 * Tags (fsm.tag on the order's tag_ids) and Job Inputs (the order's template,
 * switchable). Summary of work is the order's description, which the job's
 * notes already sync; Tasks are Odoo to-dos (see odooFollowUps). Kept free of
 * React; the client is passed in so tests use a fake.
 */
import { FsmTemplate, templateVals } from './fsmTemplates';
import type { OdooClient } from './odoo';

type Caller = Pick<OdooClient, 'call' | 'session'>;

export interface Tag {
  id: number;
  name: string;
}

async function hasField(c: Caller, model: string, field: string): Promise<boolean> {
  try {
    const f = (await c.call(model, 'fields_get', [[field]], { attributes: ['type'] })) as Record<string, unknown>;
    return field in f;
  } catch {
    return false;
  }
}

/** Every tag Odoo offers and the ones on this order; none when this Odoo's orders have no tags. */
export async function fetchJobTags(c: Caller, orderId: number): Promise<{ all: Tag[]; on: number[] } | null> {
  if (c.session.kind !== 'oca' || !(await hasField(c, 'fsm.order', 'tag_ids'))) return null;
  const [all, [order]] = await Promise.all([
    c.call('fsm.tag', 'search_read', [[]], { fields: ['name'], order: 'name asc', limit: 200 }) as Promise<{ id: number; name?: unknown }[]>,
    c.call('fsm.order', 'read', [[orderId]], { fields: ['tag_ids'] }) as Promise<{ tag_ids?: unknown }[]>,
  ]);
  return {
    all: all.map((t) => ({ id: t.id, name: typeof t.name === 'string' && t.name ? t.name : `#${t.id}` })),
    on: Array.isArray(order?.tag_ids) ? (order.tag_ids as unknown[]).filter((x): x is number => typeof x === 'number') : [],
  };
}

/** Puts exactly these tags on the order. */
export async function setJobTags(c: Caller, orderId: number, ids: number[]): Promise<void> {
  await c.call('fsm.order', 'write', [[orderId], { tag_ids: [[6, 0, ids]] }]);
}

/** The id of the template the order was made from, if any. */
export async function currentTemplate(c: Caller, orderId: number): Promise<number | undefined> {
  if (c.session.kind !== 'oca' || !c.session.fields.includes('template_id')) return undefined;
  const [o] = (await c.call('fsm.order', 'read', [[orderId]], { fields: ['template_id'] })) as { template_id?: unknown }[];
  return Array.isArray(o?.template_id) && typeof o.template_id[0] === 'number' ? o.template_id[0] : undefined;
}

/** Switches the order to another template, the way picking it in Odoo's form does: its instructions, type and categories replace the old ones. */
export async function switchTemplate(c: Caller, orderId: number, t: FsmTemplate): Promise<void> {
  const vals = templateVals(c, t, true);
  if (!('template_id' in vals)) throw new Error("This Odoo's jobs have no template field.");
  await c.call('fsm.order', 'write', [[orderId], vals]);
}
