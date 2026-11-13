/**
 * Job photos go to the job in Odoo: each one is attached to the Field Service
 * order (or task) the job is, with a note in its chatter, so they're with the
 * job on Odoo's own screens and not only on this phone. Kept free of React.
 */
import type { JobPhoto } from './attachments';
import { PHOTO_LABEL } from './attachments';
import type { Job } from './jobs';
import type { OdooClient } from './odoo';
import type { OdooJobRef } from './odooJobs';

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };

/** Photos of jobs that are in Odoo and haven't gone there yet, oldest first. */
export function photosToSend(photos: JobPhoto[], jobs: Pick<Job, 'id' | 'odooJob'>[]): { photo: JobPhoto; ref: OdooJobRef }[] {
  const refs = new Map(jobs.flatMap((j) => (j.odooJob ? [[j.id, j.odooJob] as const] : [])));
  return photos
    .filter((p) => !p.odooId && refs.has(p.jobId))
    .sort((a, b) => a.at - b.at)
    .map((photo) => ({ photo, ref: refs.get(photo.jobId)! }));
}

/** "Before photo 2026-11-13 14.05.jpg". */
export function photoFileName(p: Pick<JobPhoto, 'kind' | 'at' | 'uri'>): string {
  const ext = (p.uri.split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] ?? 'jpg').toLowerCase();
  const d = new Date(p.at);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${PHOTO_LABEL[p.kind]} photo ${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}.${two(d.getMinutes())}.${ext}`;
}

/** Attaches one photo (base64, or a data URL) to the job in Odoo and returns the attachment's id. */
export async function sendPhoto(client: Pick<OdooClient, 'call'>, ref: OdooJobRef, photo: Pick<JobPhoto, 'kind' | 'at' | 'uri'>, data: string): Promise<number> {
  const name = photoFileName(photo);
  const ext = name.split('.').pop() ?? 'jpg';
  const datas = data.replace(/^data:[^,]*,/, '');
  const id = (await client.call('ir.attachment', 'create', [{ name, type: 'binary', datas, res_model: ref.model, res_id: ref.id, mimetype: MIME[ext] ?? 'image/jpeg' }])) as number;
  // The chatter note is a nicety: the photo is on the job either way.
  await client.call(ref.model, 'message_post', [[ref.id]], { body: `${PHOTO_LABEL[photo.kind]} photo from the app`, attachment_ids: [id], message_type: 'comment', subtype_xmlid: 'mail.mt_note' }).catch(() => undefined);
  return id;
}
