/**
 * Odoo's Field Service templates (OCA fsm.template): the kinds of job, with
 * their instructions, planned length, order type and categories. New job
 * offers them as "What's wrong", and a job sent to Odoo carries its template
 * the way picking it in Odoo's own form does. Kept free of React; the client
 * is passed in, so tests use a fake.
 */
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call' | 'session'>;

export const FSM_TEMPLATES_STORAGE_KEY = 'fsm-templates/v1';

export interface FsmTemplate {
  id: number;
  name: string;
  /** What to do, copied to the order's instructions. */
  instructions: string;
  /** Planned length, if the template has one. */
  minutes?: number;
  /** The Field Service order type (fsm.order.type). */
  typeId?: number;
  categoryIds?: number[];
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const TEMPLATE_OPTIONAL = ['instructions', 'duration', 'type_id', 'category_ids', 'active'];

/** The templates, by name. None when this Odoo has no Field Service templates. */
export async function fetchFsmTemplates(c: Client): Promise<FsmTemplate[]> {
  if (c.session.kind !== 'oca') return [];
  let fields: Record<string, unknown>;
  try {
    fields = (await c.call('fsm.template', 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;
  } catch {
    return [];
  }
  const want = TEMPLATE_OPTIONAL.filter((f) => f in fields && f !== 'active');
  const rows = (await c.call('fsm.template', 'search_read', ['active' in fields ? [['active', '=', true]] : []], { fields: ['name', ...want], order: 'name asc', limit: 200 })) as Record<string, unknown>[];
  return rows.map(toTemplate).filter((t) => t.name);
}

function toTemplate(r: Record<string, unknown>): FsmTemplate {
  return {
    id: r.id as number,
    name: str(r.name).trim(),
    instructions: str(r.instructions).trim(),
    ...(typeof r.duration === 'number' && r.duration > 0 ? { minutes: Math.round(r.duration * 60) } : {}),
    ...(Array.isArray(r.type_id) ? { typeId: r.type_id[0] as number } : {}),
    ...(Array.isArray(r.category_ids) && r.category_ids.length ? { categoryIds: (r.category_ids as unknown[]).filter((x): x is number => typeof x === 'number') } : {}),
  };
}

/** The template with this name (case and spacing aside), read from Odoo. */
export async function templateNamed(c: Client, name: string): Promise<FsmTemplate | undefined> {
  const n = name.trim();
  if (!n || c.session.kind !== 'oca' || !c.session.fields.includes('template_id')) return undefined;
  const all = await fetchFsmTemplates(c).catch(() => []);
  return all.find((t) => t.name.toLowerCase() === n.toLowerCase());
}

/**
 * What a template puts on a new order: the template itself, its instructions,
 * type and categories, and its length when the phone didn't book a visit with
 * its own. Only fields this Odoo's orders have.
 */
export function templateVals(c: Pick<Client, 'session'>, t: FsmTemplate, booked: boolean): Record<string, unknown> {
  const has = (f: string) => c.session.fields.includes(f);
  return {
    ...(has('template_id') ? { template_id: t.id } : {}),
    ...(has('todo') && t.instructions ? { todo: t.instructions } : {}),
    ...(has('type') && t.typeId ? { type: t.typeId } : {}),
    ...(has('category_ids') && t.categoryIds?.length ? { category_ids: [[6, 0, t.categoryIds]] } : {}),
    ...(!booked && has('scheduled_duration') && t.minutes ? { scheduled_duration: t.minutes / 60 } : {}),
  };
}

export function parseSavedTemplates(raw: string | null): FsmTemplate[] {
  try {
    const d = raw ? JSON.parse(raw) : null;
    return Array.isArray(d) ? d.filter((t) => t && typeof t.id === 'number' && typeof t.name === 'string' && t.name).map((t) => ({ instructions: '', ...t })) : [];
  } catch {
    return [];
  }
}
