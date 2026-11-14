/**
 * Doors and openers as Odoo equipment (OCA Field Service, fsm.equipment).
 * When a signed inspection report goes to the job's order, each door and each
 * opener on it is put on the house's Field Service location as an equipment
 * record, with what the tech typed (maker, size, installed, spring code) and
 * the warranty picked for the job, so the equipment and its warranty are in
 * Odoo for anyone. Kept free of React.
 *
 * Safe by design: only inspections signed after the phone started doing this
 * are sent (the caller passes the same `since` as the reports), a door or
 * opener already in Odoo is updated rather than doubled, and only the block
 * the app wrote in the Notes is replaced, so anything typed there in Odoo
 * stays. Odoo without the equipment app is skipped quietly.
 */
import type { Door, Inspection, Motor } from './inspection';
import { FollowUpSettings, warrantyFor, Warranty } from './followups';
import type { Invoice } from './invoices';
import type { Job } from './jobs';
import type { OdooJobRef } from './odooJobs';
import type { Signature } from './attachments';
import type { OdooClient } from './odoo';

type Caller = Pick<OdooClient, 'call'>;

export type EquipmentKind = 'door' | 'opener';

export interface EquipmentItem {
  /** The phone's id for it, written in the notes so a later visit finds it. */
  key: string;
  kind: EquipmentKind;
  name: string;
  /** The lines the app writes in the notes. */
  lines: string[];
}

const clean = (s: string) => s.trim().replace(/\s+/g, ' ');
const dateOf = (ms: number) => new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

/** "Garage door: Clopay 16x7", "Opener: LiftMaster". */
const nameOf = (kind: EquipmentKind, parts: string[], n: number, count: number) => {
  const base = kind === 'door' ? 'Garage door' : 'Opener';
  const what = parts.map(clean).filter(Boolean).join(' ');
  return `${base}${count > 1 ? ` ${n}` : ''}${what ? `: ${what}` : ''}`;
};

export function warrantyLines(w: Warranty | undefined, invoiceNumber?: string): string[] {
  if (!w || (!w.partsUntil && !w.laborUntil)) return [];
  const from = invoiceNumber ? ` (invoice ${invoiceNumber})` : '';
  return [
    ...(w.partsUntil ? [`Warranty on parts until ${dateOf(w.partsUntil)}${from}`] : []),
    ...(w.laborUntil ? [`Warranty on labor until ${dateOf(w.laborUntil)}${from}`] : []),
  ];
}

/** The doors and openers on an inspection, as equipment, with the job's warranty. */
export function equipmentFor(insp: Inspection, warranty: string[] = []): EquipmentItem[] {
  const out: EquipmentItem[] = [];
  const doors = insp.doors;
  const inspected = `Last inspected ${dateOf(insp.at)}`;
  doors.forEach((d: Door, i) => {
    const spring = [d.springCode ? `Spring ${clean(d.springCode)}` : '', d.springCycles ? `rated ${clean(d.springCycles)} cycles` : ''].filter(Boolean).join(', ');
    out.push({
      key: d.id,
      kind: 'door',
      name: nameOf('door', [d.maker, d.size], i + 1, doors.length),
      lines: [d.maker && `Maker: ${clean(d.maker)}`, d.size && `Size: ${clean(d.size)}`, d.age && `Installed: ${clean(d.age)}`, spring, inspected, ...warranty].filter((x): x is string => !!x),
    });
    d.motors.forEach((m: Motor, j) => {
      if (!m.maker && !m.built) return;
      out.push({
        key: m.id,
        kind: 'opener',
        name: nameOf('opener', [m.maker, m.built], j + 1, d.motors.length) + (doors.length > 1 ? ` (door ${i + 1})` : ''),
        lines: [m.maker && `Maker: ${clean(m.maker)}`, m.built && `Built: ${clean(m.built)}`, inspected, ...warranty].filter((x): x is string => !!x),
      });
    });
  });
  return out;
}

/** A short fingerprint of what would be sent, so an unchanged inspection isn't sent again. */
export const equipmentKey = (items: EquipmentItem[]) => items.map((i) => `${i.key}|${i.name}|${i.lines.join('/')}`).join('\n');

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

/** Whether this Odoo has equipment, and the type of its notes. Null when it doesn't. */
export async function equipmentReady(client: Caller): Promise<{ htmlNotes: boolean } | null> {
  try {
    const f = (await client.call('fsm.equipment', 'fields_get', [], { attributes: ['type'] })) as Record<string, { type?: string }>;
    if (!f.location_id || !f.name) return null;
    return { htmlNotes: f.notes?.type === 'html' };
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
 * it before (found by the key in its notes), else one with the same name at
 * the location, else makes one. Returns how many were written.
 */
export async function sendEquipment(client: Caller, locationId: number, items: EquipmentItem[], htmlNotes: boolean): Promise<number> {
  if (!items.length) return 0;
  const there = (await client.call('fsm.equipment', 'search_read', [[['location_id', '=', locationId]]], { fields: ['name', 'notes'], limit: 200 })) as { id: number; name?: unknown; notes?: unknown }[];
  const notesOf = (r: { notes?: unknown }) => (htmlNotes ? fromHtml(plain(r.notes)) : plain(r.notes));
  let n = 0;
  const used = new Set<number>();
  for (const item of items) {
    const free = there.filter((r) => !used.has(r.id));
    const match = free.find((r) => notesOf(r).includes(marker(item.key))) ?? free.find((r) => plain(r.name) === item.name);
    if (match) used.add(match.id);
    const text = mergeNotes(match ? notesOf(match) : '', item);
    const notes = htmlNotes ? toHtml(text) : text;
    if (match) {
      await client.call('fsm.equipment', 'write', [[match.id], { notes }]);
    } else {
      await client.call('fsm.equipment', 'create', [{ name: item.name, location_id: locationId, notes }]);
    }
    n += 1;
  }
  return n;
}


/**
 * Jobs whose doors and openers should go to Odoo now: in Odoo, signed since
 * the phone started (so an update never sends old inspections), with a door
 * or opener typed in, and not already sent as they are now (a new signing,
 * or a changed warranty on the job's invoice, sends it again).
 */
export function equipmentToSend<J extends Pick<Job, 'id' | 'inspection' | 'odooJob'>>(
  jobs: J[],
  signatures: Pick<Signature, 'for' | 'refId' | 'at'>[],
  invoices: Pick<Invoice, 'jobId' | 'number' | 'createdAt' | 'voidedAt' | 'warranty' | 'source' | 'tier'>[],
  settings: FollowUpSettings,
  since: number,
): { job: J & { inspection: Inspection; odooJob: OdooJobRef }; items: EquipmentItem[]; key: string }[] {
  const out: { job: J & { inspection: Inspection; odooJob: OdooJobRef }; items: EquipmentItem[]; key: string }[] = [];
  for (const job of jobs) {
    if (!job.inspection || !job.odooJob || job.odooJob.model !== 'fsm.order') continue;
    const signed = Math.max(0, ...signatures.filter((x) => x.for === 'inspection' && x.refId === job.id).map((x) => x.at));
    if (!signed || signed < since) continue;
    const inv = invoices.filter((i) => i.jobId === job.id && !i.voidedAt).sort((a, b) => b.createdAt - a.createdAt)[0];
    const lines = inv ? warrantyLines(warrantyFor(inv as Invoice, settings), inv.number) : [];
    const items = equipmentFor(job.inspection, lines);
    if (!items.length) continue;
    const key = equipmentKey(items);
    if (job.inspection.equipment?.key === key) continue;
    out.push({ job: job as J & { inspection: Inspection; odooJob: OdooJobRef }, items, key });
  }
  return out;
}
