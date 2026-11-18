/**
 * Files Odoo holds for a job: every attachment on its Field Service order, its
 * sales order and its invoices, from any phone or from Odoo's own screens. Read
 * only; photos taken here still go up through odooPhotos.ts. Kept free of React;
 * the client is passed in.
 */
import type { OdooClient } from './odoo';

type Client = Pick<OdooClient, 'call'>;

export type FileKind = 'image' | 'pdf' | 'other';

export interface OdooFile {
  id: number;
  name: string;
  kind: FileKind;
  /** When it was added to Odoo, ms (0 when unknown). */
  at: number;
  /** Bytes (0 when unknown). */
  size: number;
}

export interface FileTarget {
  model: string;
  id: number;
}

/** Biggest picture the grid will pull down to show as a thumbnail. */
export const THUMB_MAX_BYTES = 3 * 1024 * 1024;
/** Most thumbnails fetched for one job. */
export const THUMB_MAX_COUNT = 12;

export function kindOf(mime: unknown, name: unknown): FileKind {
  const m = typeof mime === 'string' ? mime.toLowerCase() : '';
  const n = typeof name === 'string' ? name.toLowerCase() : '';
  if (m.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/.test(n)) return 'image';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  return 'other';
}

/** Odoo stores "2026-11-17 14:05:00" in UTC. */
function utcMs(v: unknown): number {
  if (typeof v !== 'string') return 0;
  const t = Date.parse(`${v.replace(' ', 'T')}Z`);
  return Number.isFinite(t) ? t : 0;
}

/** The files on these records, newest first. Hidden app files (settings, plan data) are left out. */
export async function listFiles(client: Client, targets: FileTarget[]): Promise<OdooFile[]> {
  const t = targets.filter((x) => x.id > 0);
  if (t.length === 0) return [];
  const byModel = new Map<string, number[]>();
  for (const x of t) byModel.set(x.model, [...(byModel.get(x.model) ?? []), x.id]);
  const groups = [...byModel.entries()];
  // Odoo's prefix domain: (n - 1) "|" signs, then each model's "&" pair.
  const domain: unknown[] = [...Array<string>(groups.length - 1).fill('|'), ...groups.flatMap(([model, list]) => ['&', ['res_model', '=', model], ['res_id', 'in', list]])];
  const rows = (await client.call('ir.attachment', 'search_read', [domain], { fields: ['name', 'mimetype', 'create_date', 'file_size', 'type'], order: 'id desc', limit: 200 })) as Record<string, unknown>[];
  return rows
    .filter((r) => typeof r.id === 'number' && r.type !== 'url' && typeof r.name === 'string' && !/\.json$/i.test(r.name as string))
    .map((r) => ({ id: r.id as number, name: r.name as string, kind: kindOf(r.mimetype, r.name), at: utcMs(r.create_date), size: typeof r.file_size === 'number' ? r.file_size : 0 }));
}

/** One file as base64. */
export async function fileData(client: Client, id: number): Promise<string> {
  const [a] = (await client.call('ir.attachment', 'read', [[id]], { fields: ['datas'] })) as { datas?: unknown }[];
  if (typeof a?.datas !== 'string' || !a.datas) throw new Error('Odoo sent an empty file.');
  return a.datas;
}

/** A picture as a data URL the Image component can show. */
export async function imageUrl(client: Client, f: Pick<OdooFile, 'id' | 'name'>): Promise<string> {
  const ext = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'jpeg').toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${await fileData(client, f.id)}`;
}

const ids = (rows: unknown): number[] => (Array.isArray(rows) ? rows.flatMap((r) => (typeof (r as { id?: unknown })?.id === 'number' ? [(r as { id: number }).id] : [])) : []);

/**
 * Every record of one customer that can hold files: their contact, each job at
 * their houses, their sales orders and their invoices. A model this Odoo lacks
 * (or won't let this login read) is skipped rather than failing the list.
 */
export async function customerTargets(client: Client, partnerId: number, jobModel: 'fsm.order' | 'project.task' | null): Promise<FileTarget[]> {
  const safe = async (model: string, domain: unknown[]): Promise<FileTarget[]> => {
    try {
      return ids(await client.call(model, 'search_read', [domain], { fields: ['id'], limit: 300 })).map((id) => ({ model, id }));
    } catch {
      return [];
    }
  };
  let jobs: FileTarget[] = [];
  if (jobModel === 'fsm.order') {
    const places = ids(await client.call('fsm.location', 'search_read', [['|', ['partner_id', '=', partnerId], ['owner_id', '=', partnerId]]], { fields: ['id'], limit: 200 }).catch(() => []));
    jobs = places.length ? await safe('fsm.order', [['location_id', 'in', places]]) : [];
  } else if (jobModel === 'project.task') {
    jobs = await safe('project.task', [['partner_id', '=', partnerId]]);
  }
  const [orders, bills] = await Promise.all([safe('sale.order', [['partner_id', '=', partnerId]]), safe('account.move', [['partner_id', '=', partnerId], ['move_type', 'in', ['out_invoice', 'out_refund']]])]);
  return [{ model: 'res.partner', id: partnerId }, ...jobs, ...orders, ...bills];
}
