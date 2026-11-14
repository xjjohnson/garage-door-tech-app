/**
 * Builds the inspection report page for a job from what's saved on the phone:
 * the photos tagged with a checklist item and the customer's signature.
 * Shared by the inspection screen and the invoice email.
 */
import { LOGO_DATA_URL } from '../data/logoPng';
import { Attachments, photosFor, signatureFor } from './attachments';
import type { DeviceMedia } from './deviceMedia';
import { photoPairs, photoReportHtml, PhotoReportInfo } from './photoReport';
import { inspectionHtml, ReportInfo, ReportPhoto } from './inspectionReport';
import type { Business } from './invoices';
import type { Job } from './jobs';

/** Photos in one report, so the PDF stays small enough to email and send to Odoo. */
export const MAX_REPORT_PHOTOS = 12;

export async function inspectionReportHtml(job: Job, attachments: Attachments, media: Pick<DeviceMedia, 'photoDataUrl'> | null, business: Business, info: Omit<ReportInfo, 'customer' | 'address'>): Promise<string> {
  if (!job.inspection) throw new Error('This job has no inspection.');
  const shots = photosFor(attachments, job.id)
    .filter((p) => p.item)
    .slice(0, MAX_REPORT_PHOTOS);
  const imgs: ReportPhoto[] = [];
  for (const p of shots) {
    const src = await media?.photoDataUrl?.(p.uri);
    if (src) imgs.push({ item: p.item, src });
  }
  return inspectionHtml(job.inspection, { customer: job.customer, address: job.address, ...info }, business, LOGO_DATA_URL, imgs, signatureFor(attachments, 'inspection', job.id));
}

/** The before/after photo report page for a job, or '' when it has no before or after photos on this phone. */
export async function beforeAfterReportHtml(job: Pick<Job, 'id' | 'customer' | 'address'>, attachments: Attachments, media: Pick<DeviceMedia, 'photoDataUrl'> | null, business: Business, info: Pick<PhotoReportInfo, 'reference'> = {}): Promise<string> {
  const shots = photosFor(attachments, job.id).filter((p) => p.kind === 'before' || p.kind === 'after');
  const loaded: { kind: 'before' | 'after'; at: number; src: string }[] = [];
  for (const p of shots) {
    const src = await media?.photoDataUrl?.(p.uri);
    if (src) loaded.push({ kind: p.kind as 'before' | 'after', at: p.at, src });
  }
  return photoReportHtml(photoPairs(loaded), { customer: job.customer, address: job.address, ...info }, business, LOGO_DATA_URL);
}
