/**
 * Management editing: the lists the owner keeps in Odoo, read and saved
 * straight there with nothing kept on the phone. Job types are Field Service
 * templates (fsm.template, each with its order type), quote templates are
 * sale.order.template with their lines, and parts are products. Only fields
 * this Odoo has are written. "Delete" archives, so old jobs keep their link.
 * Kept free of React; the client is passed in, so tests use a fake.
 */
import { fetchFsmTemplates, FsmTemplate } from './fsmTemplates';
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call' | 'session'>;

export interface Choice {
  id: number;
  label: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const many2one = (v: unknown): number => (Array.isArray(v) && typeof v[0] === 'number' ? v[0] : typeof v === 'number' ? v : 0);

async function fieldsOf(c: Client, model: string): Promise<Record<string, unknown>> {
  try {
    return (await c.call(model, 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Keeps only the fields this Odoo's model has. */
const known = (fields: Record<string, unknown>, vals: Record<string, unknown>) => Object.fromEntries(Object.entries(vals).filter(([k]) => k in fields));

/* ---------------------------------------------------------------- Job types */

export interface JobTypeEdit {
  id?: number;
  name: string;
  instructions: string;
  /** Planned length in minutes; 0 for none. */
  minutes: number;
  /** The Field Service order type, if any. */
  typeId?: number;
}

/** The job types (Field Service templates) as they are in Odoo now. */
export async function listJobTypes(c: Client): Promise<FsmTemplate[]> {
  return fetchFsmTemplates(c);
}

/** The Field Service order types a job type can be mapped to. */
export async function orderTypes(c: Client): Promise<Choice[]> {
  if (c.session.kind !== 'oca') return [];
  try {
    const rows = (await c.call('fsm.order.type', 'search_read', [[]], { fields: ['name'], order: 'name asc', limit: 100 })) as { id: number; name?: string }[];
    return rows.map((r) => ({ id: r.id, label: str(r.name) })).filter((r) => r.label);
  } catch {
    return [];
  }
}

/** Creates or updates a job type in Odoo; the id of the saved template. */
export async function saveJobType(c: Client, e: JobTypeEdit): Promise<number> {
  const name = e.name.trim();
  if (!name) throw new Error('Give the job type a name.');
  const fields = await fieldsOf(c, 'fsm.template');
  const vals = known(fields, {
    name,
    instructions: e.instructions.trim(),
    duration: e.minutes > 0 ? e.minutes / 60 : 0,
    type_id: e.typeId ?? false,
  });
  if (e.id) {
    await c.call('fsm.template', 'write', [[e.id], vals]);
    return e.id;
  }
  return (await c.call('fsm.template', 'create', [vals])) as number;
}

/** Hides a job type: archived in Odoo, so jobs that used it keep it. */
export async function archiveJobType(c: Client, id: number): Promise<void> {
  const fields = await fieldsOf(c, 'fsm.template');
  if (!('active' in fields)) throw new Error("This Odoo can't archive job types. Remove it in Odoo.");
  await c.call('fsm.template', 'write', [[id], { active: false }]);
}

/* ---------------------------------------------------------- Quote templates */

export interface TemplateLineEdit {
  /** The line's id in Odoo; absent for a new line. */
  id?: number;
  productId: number;
  /** What the line says; the product's name when left alone. */
  name: string;
  qty: number;
}

export interface QuoteTemplateEdit {
  id?: number;
  name: string;
  lines: TemplateLineEdit[];
}

/** Every active quote template, by name. */
export async function listQuoteTemplates(c: Client): Promise<Choice[]> {
  const rows = (await c.call('sale.order.template', 'search_read', [[['active', '=', true]]], { fields: ['name'], order: 'name asc', limit: 300 })) as { id: number; name?: string }[];
  return rows.map((r) => ({ id: r.id, label: str(r.name).trim() })).filter((r) => r.label);
}

/** One quote template with its product lines (sections and notes are left alone). */
export async function loadQuoteTemplate(c: Client, id: number): Promise<QuoteTemplateEdit> {
  const [t] = (await c.call('sale.order.template', 'read', [[id]], { fields: ['name'] })) as { name?: string }[];
  const lines = (await c.call('sale.order.template.line', 'search_read', [[['sale_order_template_id', '=', id]]], {
    fields: ['product_id', 'name', 'product_uom_qty', 'display_type'],
    order: 'sequence asc, id asc',
  })) as Record<string, unknown>[];
  return {
    id,
    name: str(t?.name),
    lines: lines
      .filter((l) => !l.display_type && many2one(l.product_id))
      .map((l) => ({
        id: l.id as number,
        productId: many2one(l.product_id),
        name: str(l.name).split('\n')[0],
        qty: typeof l.product_uom_qty === 'number' && l.product_uom_qty > 0 ? l.product_uom_qty : 1,
      })),
  };
}

/**
 * Saves a quote template and its lines: lines that were taken off are
 * deleted, new ones added, the rest updated. The id of the saved template.
 */
export async function saveQuoteTemplate(c: Client, e: QuoteTemplateEdit): Promise<number> {
  const name = e.name.trim();
  if (!name) throw new Error('Give the template a name.');
  if (e.lines.some((l) => !l.productId)) throw new Error('Pick a product for every line.');
  const lineVals = (l: TemplateLineEdit) => ({ product_id: l.productId, ...(l.name.trim() ? { name: l.name.trim() } : {}), product_uom_qty: l.qty > 0 ? l.qty : 1 });
  const commands: unknown[] = [];
  if (e.id) {
    const before = await loadQuoteTemplate(c, e.id);
    const keep = new Set(e.lines.flatMap((l) => (l.id ? [l.id] : [])));
    for (const old of before.lines) if (!keep.has(old.id!)) commands.push([2, old.id, false]);
  }
  for (const l of e.lines) commands.push(l.id ? [1, l.id, lineVals(l)] : [0, 0, lineVals(l)]);
  const vals = { name, sale_order_template_line_ids: commands };
  if (e.id) {
    await c.call('sale.order.template', 'write', [[e.id], vals]);
    return e.id;
  }
  return (await c.call('sale.order.template', 'create', [vals])) as number;
}

/** Hides a quote template: archived in Odoo, so quotes already made from it stay as they are. */
export async function archiveQuoteTemplate(c: Client, id: number): Promise<void> {
  await c.call('sale.order.template', 'write', [[id], { active: false }]);
}

/* ------------------------------------------------------------------- Parts */

export interface PartEdit {
  /** The product (variant) id; absent for a new part. */
  id?: number;
  name: string;
  /** Internal reference. */
  code: string;
  /** Sales price in cents. */
  cents: number;
  /** A service (labor) rather than a part. */
  service: boolean;
}

/** Products that can be sold, for the Parts list. All of them for an empty search. */
export async function listParts(c: Client, search = '', limit = 60): Promise<(PartEdit & { id: number })[]> {
  const fields = await fieldsOf(c, 'product.product');
  const q = search.trim();
  const domain: unknown[] = [...('sale_ok' in fields ? [['sale_ok', '=', true]] : []), ...(q ? ['|', ['name', 'ilike', q], ['default_code', 'ilike', q]] : [])];
  const want = ['name', 'lst_price', 'default_code', 'type'].filter((f) => f in fields);
  const rows = (await c.call('product.product', 'search_read', [domain], { fields: want, limit, order: 'name asc' })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: str(r.name), code: str(r.default_code), cents: typeof r.lst_price === 'number' ? Math.round(r.lst_price * 100) : 0, service: r.type === 'service' }));
}

/**
 * Creates or updates a part in Odoo. The price is written on the product's
 * template, where Odoo keeps it. A new part is a goods product, or a service;
 * tracking stock is left to Odoo.
 */
export async function savePart(c: Client, e: PartEdit): Promise<number> {
  const name = e.name.trim();
  if (!name) throw new Error('Give the part a name.');
  if (!(e.cents >= 0)) throw new Error('Enter a price of zero or more.');
  const fields = await fieldsOf(c, 'product.template');
  const vals = known(fields, { name, default_code: e.code.trim() || false, list_price: e.cents / 100 });
  if (e.id) {
    const [p] = (await c.call('product.product', 'read', [[e.id]], { fields: ['product_tmpl_id'] })) as { product_tmpl_id?: unknown }[];
    const tmpl = many2one(p?.product_tmpl_id);
    if (!tmpl) throw new Error("Couldn't find that part in Odoo.");
    await c.call('product.template', 'write', [[tmpl], vals]);
    return e.id;
  }
  const create = { ...vals, ...known(fields, { type: e.service ? 'service' : 'consu', sale_ok: true }) };
  const tmpl = (await c.call('product.template', 'create', [create])) as number;
  const rows = (await c.call('product.product', 'search_read', [[['product_tmpl_id', '=', tmpl]]], { fields: ['id'], limit: 1 })) as { id: number }[];
  return rows[0]?.id ?? tmpl;
}

/** Hides a part: archived in Odoo, so old quotes and invoices keep it. */
export async function archivePart(c: Client, id: number): Promise<void> {
  const [p] = (await c.call('product.product', 'read', [[id]], { fields: ['product_tmpl_id'] })) as { product_tmpl_id?: unknown }[];
  const tmpl = many2one(p?.product_tmpl_id);
  await c.call('product.template', 'write', [[tmpl || id], { active: false }]);
}

/* -------------------------------------------------------------------- Techs */

export interface TechEdit {
  /** The Field Service worker's id; absent for a new tech. */
  id?: number;
  name: string;
  phone: string;
  email: string;
}

/** The Field Service workers (fsm.person), active ones by name. Empty when Field Service isn't there. */
export async function listTechs(c: Client): Promise<(TechEdit & { id: number })[]> {
  if (c.session.kind !== 'oca') return [];
  const fields = await fieldsOf(c, 'fsm.person');
  const want = ['name', 'phone', 'email'].filter((f) => f in fields);
  const rows = (await c.call('fsm.person', 'search_read', [[['active', '=', true]]], { fields: want, order: 'name asc', limit: 200 })) as Record<string, unknown>[];
  return rows.map((r) => ({ id: r.id as number, name: str(r.name), phone: str(r.phone), email: str(r.email) })).filter((r) => r.name);
}

/** Creates or updates a tech in Odoo; the id saved. A login is made in Odoo's Users, not here. */
export async function saveTech(c: Client, e: TechEdit): Promise<number> {
  const name = e.name.trim();
  if (!name) throw new Error('Give the tech a name.');
  const fields = await fieldsOf(c, 'fsm.person');
  const vals = known(fields, { name, phone: e.phone.trim() || false, email: e.email.trim() || false });
  if (e.id) {
    await c.call('fsm.person', 'write', [[e.id], vals]);
    return e.id;
  }
  return (await c.call('fsm.person', 'create', [vals])) as number;
}

/** Hides a tech: archived in Odoo, so their old jobs keep their name. */
export async function archiveTech(c: Client, id: number): Promise<void> {
  await c.call('fsm.person', 'write', [[id], { active: false }]);
}

/* ------------------------------------------------------------------- Trucks */

export interface TruckEdit {
  id?: number;
  name: string;
  /** The tech who drives it (Field Service Vehicles only). */
  personId?: number;
  /** The Inventory location holding its stock, when this Odoo links one to the vehicle. */
  locationId?: number;
}

/** Where trucks live: Field Service Vehicles when installed, else Inventory locations named like a truck. */
export type TruckSource = 'vehicle' | 'location' | 'none';

export async function truckSource(c: Client): Promise<TruckSource> {
  if (c.session.kind === 'oca' && Object.keys(await fieldsOf(c, 'fsm.vehicle')).length) return 'vehicle';
  return Object.keys(await fieldsOf(c, 'stock.location')).length ? 'location' : 'none';
}

/** Inventory locations a truck's stock can sit in. */
export async function stockLocations(c: Client): Promise<Choice[]> {
  try {
    const rows = (await c.call('stock.location', 'search_read', [[['usage', '=', 'internal'], ['active', '=', true]]], { fields: ['complete_name'], order: 'complete_name asc', limit: 200 })) as { id: number; complete_name?: string }[];
    return rows.map((r) => ({ id: r.id, label: str(r.complete_name) })).filter((r) => r.label);
  } catch {
    return [];
  }
}

/** The trucks as Odoo has them now. */
export async function listTruckEdits(c: Client, source: TruckSource): Promise<(TruckEdit & { id: number })[]> {
  if (source === 'vehicle') {
    const fields = await fieldsOf(c, 'fsm.vehicle');
    const want = ['name', 'person_id', 'inventory_location_id'].filter((f) => f in fields);
    const rows = (await c.call('fsm.vehicle', 'search_read', [[['active', '=', true]]], { fields: want, order: 'name asc', limit: 200 })) as Record<string, unknown>[];
    return rows.map((r) => ({ id: r.id as number, name: str(r.name), personId: many2one(r.person_id) || undefined, locationId: many2one(r.inventory_location_id) || undefined })).filter((r) => r.name);
  }
  if (source === 'location') {
    const rows = (await c.call('stock.location', 'search_read', [[['usage', '=', 'internal'], ['active', '=', true], ['name', 'ilike', 'truck']]], { fields: ['name'], order: 'name asc', limit: 200 })) as { id: number; name?: string }[];
    return rows.map((r) => ({ id: r.id, name: str(r.name) })).filter((r) => r.name);
  }
  return [];
}

/**
 * Creates or updates a truck. The stock side finds a tech's truck by name
 * ("Truck - <tech>"), so a Field Service vehicle with no stock location of
 * its own is only a label until it's linked.
 */
export async function saveTruck(c: Client, source: TruckSource, e: TruckEdit): Promise<number> {
  const name = e.name.trim();
  if (!name) throw new Error('Give the truck a name.');
  if (source === 'vehicle') {
    const fields = await fieldsOf(c, 'fsm.vehicle');
    const vals = known(fields, { name, person_id: e.personId ?? false, inventory_location_id: e.locationId ?? false });
    if (e.id) {
      await c.call('fsm.vehicle', 'write', [[e.id], vals]);
      return e.id;
    }
    return (await c.call('fsm.vehicle', 'create', [vals])) as number;
  }
  if (source === 'location') {
    if (e.id) {
      await c.call('stock.location', 'write', [[e.id], { name }]);
      return e.id;
    }
    return (await c.call('stock.location', 'create', [{ name, usage: 'internal' }])) as number;
  }
  throw new Error("This Odoo has no Field Service Vehicles or Inventory, so there's nowhere to keep trucks.");
}

/** Hides a truck: archived in Odoo, so its stock history stays. */
export async function archiveTruck(c: Client, source: TruckSource, id: number): Promise<void> {
  const model = source === 'vehicle' ? 'fsm.vehicle' : 'stock.location';
  await c.call(model, 'write', [[id], { active: false }]);
}
