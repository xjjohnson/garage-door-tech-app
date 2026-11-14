/**
 * Doors and openers Justin sells as Odoo equipment (OCA Field Service,
 * fsm.equipment). A part sold on an invoice that the tech ticked under
 * "Track as equipment" (on the warranty card) becomes an equipment record on the house's
 * Field Service location, with the warranty picked for the job written on
 * it. Equipment comes from what is sold, not from the inspection sheet.
 * Kept free of React.
 *
 * Safe by design: the caller sends only invoices made after the phone started
 * doing this, a sold item already in Odoo is updated rather than doubled
 * (found by a key in its notes), and only the block the app wrote in the
 * Notes is replaced, so anything typed there in Odoo stays. Odoo without
 * the equipment app is skipped quietly.
 */
import { FollowUpSettings, warrantyFor, Warranty } from './followups';
import { Invoice, trackKey } from './invoices';
import type { OdooClient } from './odoo';

type Caller = Pick<OdooClient, 'call'>;

export interface EquipmentItem {
  /** The phone's id for it, written in the notes so a later visit finds it. */
  key: string;
  name: string;
  /** The Odoo product it was sold as. */
  productId?: number;
  /** The lines the app writes in the notes. */
  lines: string[];
}

const dateOf = (ms: number) => new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

export function warrantyLines(w: Warranty | undefined, invoiceNumber?: string): string[] {
  if (!w || (!w.partsUntil && !w.laborUntil)) return [];
  const from = invoiceNumber ? ` (invoice ${invoiceNumber})` : '';
  return [
    ...(w.partsUntil ? [`Warranty on parts until ${dateOf(w.partsUntil)}${from}`] : []),
    ...(w.laborUntil ? [`Warranty on labor until ${dateOf(w.laborUntil)}${from}`] : []),
  ];
}

const START = '--- Johnsons app ---';
const END = '--- end ---';
const marker = (key: string) => `johnsons-equipment:${key}`;

/** The notes with the app's block replaced (or added at the end); whatever else was typed stays. */
export function mergeNotes(existing: string, item: Pick<EquipmentItem, 'key' | 'lines'>): string {
  const block = [START, marker(item.key), ...item.lines, END].join('\n');
  const a = existing.indexOf(START);
  const b = existing.indexOf(END);
  if (a >= 0 && b > a) return existing.slice(0, a) + block + existing.slice(b + END.length);
  return existing.trim() ? `${existing.trim()}\n\n${block}` : block;
}

/** Whether this Odoo has equipment, and what its records can hold. Null when it doesn't. */
export async function equipmentReady(client: Caller): Promise<{ htmlNotes: boolean; product: boolean } | null> {
  try {
    const f = (await client.call('fsm.equipment', 'fields_get', [], { attributes: ['type'] })) as Record<string, { type?: string }>;
    if (!f.location_id || !f.name) return null;
    return { htmlNotes: f.notes?.type === 'html', product: !!f.product_id };
  } catch {
    return null;
  }
}

/** The location a Field Service order is at. */
export async function orderLocation(client: Caller, orderId: number): Promise<number | undefined> {
  const [r] = (await client.call('fsm.order', 'read', [[orderId], ['location_id']])) as { location_id?: unknown }[];
  return Array.isArray(r?.location_id) ? (r.location_id[0] as number) : undefined;
}

const plain = (v: unknown) => (typeof v === 'string' ? v : '');
const toHtml = (t: string) => t.split('\n').map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || '<br>'}</p>`).join('');
const fromHtml = (h: string) => h.replace(/<\/p>\s*<p>/g, '\n').replace(/<br\s*\/?>/g, '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * Puts each item on the location: updates the equipment this phone made for
 * it before (found by the key in its notes), else makes one. Returns how
 * many were written.
 */
export async function sendEquipment(client: Caller, locationId: number, items: EquipmentItem[], ready: { htmlNotes: boolean; product: boolean }): Promise<number> {
  if (!items.length) return 0;
  const there = (await client.call('fsm.equipment', 'search_read', [[['location_id', '=', locationId]]], { fields: ['name', 'notes'], limit: 200 })) as { id: number; name?: unknown; notes?: unknown }[];
  const notesOf = (r: { notes?: unknown }) => (ready.htmlNotes ? fromHtml(plain(r.notes)) : plain(r.notes));
  let n = 0;
  for (const item of items) {
    const match = there.find((r) => notesOf(r).includes(marker(item.key)));
    const text = mergeNotes(match ? notesOf(match) : '', item);
    const notes = ready.htmlNotes ? toHtml(text) : text;
    if (match) {
      await client.call('fsm.equipment', 'write', [[match.id], { notes }]);
    } else {
      await client.call('fsm.equipment', 'create', [{ name: item.name, location_id: locationId, notes, ...(ready.product && item.productId ? { product_id: item.productId } : {}) }]);
    }
    n += 1;
  }
  return n;
}

const MAX_PER_LINE = 6;

/**
 * The equipment an invoice sells: each line the tech ticked under "Track as
 * equipment" on the job's warranty card (one record per unit), with the
 * warranty picked for the job. Nothing is guessed from categories.
 */
export function soldEquipment(inv: Pick<Invoice, 'id' | 'number' | 'lines' | 'createdAt' | 'warranty' | 'source' | 'tier'>, settings: FollowUpSettings): EquipmentItem[] {
  const tracked = inv.warranty?.tracked ?? [];
  if (!tracked.length) return [];
  const warranty = warrantyLines(warrantyFor(inv as Invoice, settings), inv.number);
  const out: EquipmentItem[] = [];
  inv.lines.forEach((l, i) => {
    if (!tracked.includes(trackKey(l))) return;
    const units = Math.min(MAX_PER_LINE, Math.max(1, Math.round(l.qty ?? 1)));
    for (let u = 0; u < units; u++) {
      out.push({
        key: `${inv.id}:${i}:${u}`,
        name: units > 1 ? `${l.label} ${u + 1}` : l.label,
        ...(l.productId ? { productId: l.productId } : {}),
        lines: [`Sold: ${dateOf(inv.createdAt)} (invoice ${inv.number})`, ...warranty],
      });
    }
  });
  return out;
}

/** A short fingerprint of what would be sent, so an unchanged invoice isn't sent again. */
export const equipmentKey = (items: EquipmentItem[]) => items.map((i) => `${i.key}|${i.name}|${i.lines.join('/')}`).join('\n');
