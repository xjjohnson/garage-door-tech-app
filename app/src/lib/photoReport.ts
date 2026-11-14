/**
 * The before/after photo report: one PDF page set that shows each "before"
 * photo beside its "after", built from the job photos saved on the phone and
 * emailed with Odoo's invoice. Kept free of React.
 */
import type { JobPhoto } from './attachments';
import type { Business } from './invoices';
import { formatJobDate } from './jobs';
import { escapeHtml } from './pdf';

/** Pairs in one report, so the PDF stays small enough to email. */
export const MAX_PHOTO_PAIRS = 6;

export interface PhotoShot {
  src: string;
  at: number;
}

export interface PhotoPair {
  before?: PhotoShot;
  after?: PhotoShot;
}

/** Before photos and after photos, oldest first, lined up one to one; "other" photos are left out. */
export function photoPairs<P extends Pick<JobPhoto, 'kind' | 'at'>>(photos: (P & { src: string })[]): PhotoPair[] {
  const pick = (kind: JobPhoto['kind']) => photos.filter((p) => p.kind === kind).sort((a, b) => a.at - b.at).map((p) => ({ src: p.src, at: p.at }));
  const before = pick('before');
  const after = pick('after');
  const out: PhotoPair[] = [];
  for (let i = 0; i < Math.max(before.length, after.length); i++) out.push({ ...(before[i] ? { before: before[i] } : {}), ...(after[i] ? { after: after[i] } : {}) });
  return out.slice(0, MAX_PHOTO_PAIRS);
}

const STYLE = `
body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#000;margin:28px;font-size:13px}
h1{font-size:24px;margin:0}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
.logo{height:64px}
.muted{color:#444}
.facts{display:grid;grid-template-columns:110px 1fr;row-gap:3px;margin:12px 0 16px}
.row{display:flex;gap:12px;margin-bottom:14px;page-break-inside:avoid}
.cell{flex:1;text-align:center}
.cell img{width:100%;border:1px solid #999}
.tag{font-weight:800;margin-bottom:3px}
.none{border:1px dashed #999;padding:40px 8px;color:#444}
.date{font-size:11px;color:#444}
`;

export interface PhotoReportInfo {
  customer: string;
  address: string;
  /** Odoo invoice or job number, when there is one. */
  reference?: string;
}

/** The report page, or '' when the job has no before or after photo. */
export function photoReportHtml(pairs: PhotoPair[], info: PhotoReportInfo, business: Business, logo: string): string {
  if (pairs.length === 0) return '';
  const e = escapeHtml;
  const cell = (label: string, s?: PhotoShot) =>
    `<div class="cell"><div class="tag">${label}</div>${s ? `<img src="${s.src}" alt=""><div class="date">${e(formatJobDate(s.at))}</div>` : `<div class="none">No ${label.toLowerCase()} photo</div>`}</div>`;
  const head =
    `<div class="top"><div>${logo ? `<img class="logo" src="${logo}" alt="">` : ''}<h1>Before and after photos</h1></div>` +
    `<div class="muted" style="text-align:right">${e(business.name || '')}${business.phone ? `<br>${e(business.phone)}` : ''}</div></div>` +
    `<div class="facts"><b>Customer</b><span>${e(info.customer || 'Customer')}</span>` +
    (info.address ? `<b>Location</b><span>${e(info.address)}</span>` : '') +
    (info.reference ? `<b>Reference</b><span>${e(info.reference)}</span>` : '') +
    `</div>`;
  const rows = pairs.map((p) => `<div class="row">${cell('Before', p.before)}${cell('After', p.after)}</div>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Before and after photos</title><style>${STYLE}</style></head><body>${head}${rows}</body></html>`;
}
