/**
 * Parts used on a job as real stock moves, with the Field Service Stock app
 * (OCA fieldservice_stock). Each part taken off the truck for a job becomes a
 * delivery (stock.picking) on that job's order, from the truck's Inventory
 * location to the job's site, validated so Odoo itself takes the part off
 * the truck. This replaces the "Parts used" note in the order's chatter.
 *
 * Safety rules:
 * - It only runs when this Odoo has the Field Service Stock fields (checked
 *   with fields_get). Without them the old note and truck count stay in use.
 * - It never turns on Track Inventory; a part Odoo doesn't track makes a
 *   move that changes no stock (the order still shows the part).
 * - One delivery per use, found again by its Source (origin), so a retry after a
 *   lost connection never takes a part off twice.
 * - Only uses made after this started (`PartUse.move`) come here; nothing
 *   older is written. The truck count sync leaves those uses out (see holdBack).
 * Kept free of React; the client is passed in, so tests use a fake server.
 */
import { OdooClient } from './odoo';
import { PartUse, usedOff } from './stock';

export type MovesSupport = { ok: true } | { ok: false; why: string };

const fieldsOf = async (client: OdooClient, model: string) => (await client.call(model, 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>;

/** Whether this Odoo can record parts used as stock moves on a Field Service order. */
export async function partMovesSupport(client: OdooClient): Promise<MovesSupport> {
  if (client.session.kind !== 'oca') return { ok: false, why: 'Jobs are not Field Service orders.' };
  try {
    const [move, picking, order] = await Promise.all([fieldsOf(client, 'stock.move'), fieldsOf(client, 'stock.picking'), fieldsOf(client, 'fsm.order')]);
    if (!('fsm_order_id' in move) || !('fsm_order_id' in picking)) return { ok: false, why: 'Field Service Stock is not installed.' };
    if (!('location_id' in order)) return { ok: false, why: 'Field Service orders have no location here.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message : String(e) };
  }
}

/** The Source text that finds the delivery for one use again. */
export const moveOrigin = (useId: string) => `Johnsons app parts used ${useId}`;

const m2o = (v: unknown): number | undefined => (Array.isArray(v) && typeof v[0] === 'number' ? v[0] : undefined);

/** Where the part goes: the job site's own inventory location when Field Service Stock gave it one, else Odoo's Customers location. */
async function siteLocation(client: OdooClient, orderId: number): Promise<number> {
  const [order] = (await client.call('fsm.order', 'read', [[orderId]], { fields: ['location_id'] })) as { location_id?: unknown }[];
  const loc = m2o(order?.location_id);
  if (loc) {
    try {
      const f = await fieldsOf(client, 'fsm.location');
      if ('inventory_location_id' in f) {
        const [row] = (await client.call('fsm.location', 'read', [[loc]], { fields: ['inventory_location_id'] })) as { inventory_location_id?: unknown }[];
        const inv = m2o(row?.inventory_location_id);
        if (inv) return inv;
      }
    } catch {
      // Fall through to the Customers location.
    }
  }
  const [customers] = (await client.call('stock.location', 'search', [[['usage', '=', 'customer']]], { limit: 1, order: 'id asc' })) as number[];
  if (!customers) throw new Error('Odoo has no Customers location to move the part to.');
  return customers;
}

/** The delivery operation type for the truck's warehouse, else any delivery, else any internal transfer. */
async function pickingType(client: OdooClient, truckLocationId: number): Promise<number> {
  let warehouse: number | undefined;
  try {
    const [loc] = (await client.call('stock.location', 'read', [[truckLocationId]], { fields: ['warehouse_id'] })) as { warehouse_id?: unknown }[];
    warehouse = m2o(loc?.warehouse_id);
  } catch {
    // The truck isn't under a warehouse: any delivery type will do.
  }
  for (const code of ['outgoing', 'internal']) {
    const base = [['code', '=', code]];
    if (warehouse) {
      const [id] = (await client.call('stock.picking.type', 'search', [[...base, ['warehouse_id', '=', warehouse]]], { limit: 1 })) as number[];
      if (id) return id;
    }
    const [id] = (await client.call('stock.picking.type', 'search', [base], { limit: 1 })) as number[];
    if (id) return id;
  }
  throw new Error('Odoo has no delivery operation type to record the part with.');
}

export interface RecordedMoves {
  /** Uses now on the order as done moves (or with nothing to move). */
  done: string[];
  /** Uses Odoo wouldn't take this time, with why; they are tried again. */
  problems: { useId: string; name: string; why: string }[];
}

/**
 * Puts each use on the job's order as a delivery from the truck, validated.
 * `products` maps a use's item to its Odoo product. A use that already has
 * its delivery (found by Source) is not made again, only finished if it
 * wasn't. Uses where the truck had fewer than were used move only what came
 * off the count; the rest is noted in the chatter, as before.
 */
export async function recordPartMoves(client: OdooClient, order: { id: number }, truckLocationId: number, uses: { use: PartUse; productId: number }[]): Promise<RecordedMoves> {
  const out: RecordedMoves = { done: [], problems: [] };
  if (uses.length === 0) return out;
  const moveFields = await fieldsOf(client, 'stock.move');
  const qtyField = 'quantity' in moveFields ? 'quantity' : 'quantity_done';
  let dest: number | undefined;
  let type: number | undefined;
  const short: PartUse[] = [];
  for (const { use, productId } of uses) {
    const qty = usedOff(use);
    try {
      if (use.qty > qty) short.push(use);
      if (qty <= 0) {
        out.done.push(use.id);
        continue;
      }
      const origin = moveOrigin(use.id);
      let [pid] = (await client.call('stock.picking', 'search', [[['origin', '=', origin], ['fsm_order_id', '=', order.id], ['state', '!=', 'cancel']]], { limit: 1 })) as number[];
      if (!pid) {
        dest ??= await siteLocation(client, order.id);
        type ??= await pickingType(client, truckLocationId);
        let uom: number | undefined;
        if ('product_uom' in moveFields) {
          const [p] = (await client.call('product.product', 'read', [[productId]], { fields: ['uom_id'] })) as { uom_id?: unknown }[];
          uom = m2o(p?.uom_id);
        }
        const line = {
          product_id: productId,
          product_uom_qty: qty,
          location_id: truckLocationId,
          location_dest_id: dest,
          fsm_order_id: order.id,
          ...('name' in moveFields ? { name: use.name } : {}),
          ...(uom ? { product_uom: uom } : {}),
        };
        pid = (await client.call('stock.picking', 'create', [{ picking_type_id: type, location_id: truckLocationId, location_dest_id: dest, origin, fsm_order_id: order.id, move_ids: [[0, 0, line]] }])) as number;
      }
      const [pick] = (await client.call('stock.picking', 'read', [[pid]], { fields: ['state'] })) as { state?: string }[];
      if (pick?.state !== 'done') {
        await client.call('stock.picking', 'action_confirm', [[pid]]);
        await client.call('stock.picking', 'action_assign', [[pid]]).catch(() => undefined);
        const moves = (await client.call('stock.move', 'search', [[['picking_id', '=', pid]]])) as number[];
        // Take exactly what was used, even where the truck's reservation fell short.
        if (moves.length) await client.call('stock.move', 'write', [moves, { [qtyField]: qty }]);
        const r = await client.call('stock.picking', 'button_validate', [[pid]], { context: { skip_backorder: true, skip_immediate: true, skip_sms: true } });
        // Odoo answers with a question (a wizard) when it wants a person to decide.
        if (r && typeof r === 'object') throw new Error('Odoo wants a person to finish this delivery. Open it on the job and validate it there.');
      }
      out.done.push(use.id);
    } catch (e) {
      out.problems.push({ useId: use.id, name: use.name, why: e instanceof Error ? e.message : String(e) });
    }
  }
  const noted = short.filter((u) => out.done.includes(u.id));
  if (noted.length) {
    const body = `Parts used, not on the truck count (from the app): ${noted.map((u) => `${u.qty - usedOff(u)} × ${u.name}`).join(', ')}`;
    await client.call('fsm.order', 'message_post', [[order.id]], { body, message_type: 'comment', subtype_xmlid: 'mail.mt_note' }).catch(() => undefined);
  }
  return out;
}
