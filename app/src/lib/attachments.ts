/**
 * Photos and signatures attached to jobs, quotes and invoices. They're kept in
 * their own store, by job or invoice id, so jobs and invoices keep their
 * shape. Photos are files in the app's own folder (only their list is saved
 * here); signatures are a few short SVG paths. Kept free of React.
 */
export const ATTACHMENTS_STORAGE_KEY = 'attachments/v1';

export type PhotoKind = 'before' | 'after' | 'other';
export const PHOTO_KINDS: PhotoKind[] = ['before', 'after', 'other'];
export const PHOTO_LABEL: Record<PhotoKind, string> = { before: 'Before', after: 'After', other: 'Other' };

export interface JobPhoto {
  id: string;
  jobId: string;
  /** A file in the app's document folder. */
  uri: string;
  kind: PhotoKind;
  at: number;
  /** The inspection item it shows ("d:<door>:rollers"), when taken from the inspection. */
  item?: string;
  /** The copy on the job in Odoo (an ir.attachment id), once sent. */
  odooId?: number;
}

export type SignedFor = 'quote' | 'invoice' | 'inspection';

export interface Signature {
  id: string;
  for: SignedFor;
  /** The job id for a quote, the invoice id for an invoice. */
  refId: string;
  /** Who signed, as typed. */
  name: string;
  /** SVG path data, one per stroke, in a box `w` by `h`. */
  paths: string[];
  w: number;
  h: number;
  at: number;
}

export interface Attachments {
  photos: JobPhoto[];
  signatures: Signature[];
}

export const EMPTY_ATTACHMENTS: Attachments = { photos: [], signatures: [] };

export function photosFor(a: Attachments, jobId: string): JobPhoto[] {
  return a.photos.filter((p) => p.jobId === jobId).sort((x, y) => x.at - y.at);
}

/** The latest signature for a quote or an invoice. */
export function signatureFor(a: Attachments, kind: SignedFor, refId: string): Signature | undefined {
  return a.signatures.filter((s) => s.for === kind && s.refId === refId).sort((x, y) => y.at - x.at)[0];
}

type Point = { x: number; y: number };

/** One stroke as SVG path data, rounded to keep it small. */
export function strokePath(points: Point[]): string {
  if (points.length === 0) return '';
  const r = (n: number) => Math.round(n * 10) / 10;
  const [first, ...rest] = points;
  // A tap is a dot: a tiny line so it still shows.
  if (rest.length === 0) return `M${r(first.x)} ${r(first.y)}L${r(first.x + 0.5)} ${r(first.y + 0.5)}`;
  return `M${r(first.x)} ${r(first.y)}` + rest.map((p) => `L${r(p.x)} ${r(p.y)}`).join('');
}

/** A signature as a standalone SVG, black on white, for a PDF. */
export function signatureSvg(s: Pick<Signature, 'paths' | 'w' | 'h'>, width = 260): string {
  const height = Math.round((width * s.h) / Math.max(1, s.w));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.w} ${s.h}" width="${width}" height="${height}"><g fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${s.paths
    .filter((d) => /^[MLml0-9.\s-]+$/.test(d))
    .map((d) => `<path d="${d}"/>`)
    .join('')}</g></svg>`;
}

const s0 = (v: unknown) => (typeof v === 'string' ? v : '');
const n0 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function parseAttachments(raw: string | null | unknown): Attachments {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return EMPTY_ATTACHMENTS;
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return EMPTY_ATTACHMENTS;
  const d = data as Record<string, unknown>;
  const photos = (Array.isArray(d.photos) ? d.photos : []).flatMap((x): JobPhoto[] => {
    const p = (x ?? {}) as Record<string, unknown>;
    if (typeof p.id !== 'string' || typeof p.jobId !== 'string' || typeof p.uri !== 'string' || !p.uri) return [];
    return [{ id: p.id, jobId: p.jobId, uri: p.uri, kind: PHOTO_KINDS.includes(p.kind as PhotoKind) ? (p.kind as PhotoKind) : 'other', at: n0(p.at), ...(typeof p.item === 'string' && p.item ? { item: p.item } : {}), ...(typeof p.odooId === 'number' && p.odooId > 0 ? { odooId: p.odooId } : {}) }];
  });
  const signatures = (Array.isArray(d.signatures) ? d.signatures : []).flatMap((x): Signature[] => {
    const s = (x ?? {}) as Record<string, unknown>;
    if (typeof s.id !== 'string' || typeof s.refId !== 'string' || (s.for !== 'quote' && s.for !== 'invoice' && s.for !== 'inspection') || !Array.isArray(s.paths)) return [];
    const paths = s.paths.filter((p): p is string => typeof p === 'string' && p !== '');
    if (paths.length === 0) return [];
    return [{ id: s.id, for: s.for, refId: s.refId, name: s0(s.name), paths, w: n0(s.w) || 300, h: n0(s.h) || 150, at: n0(s.at) }];
  });
  return { photos, signatures };
}

/** Puts a backup's signatures together with the phone's (photos are files and stay on the phone). */
export function mergeSignatures(current: Attachments, incoming: Signature[]): Attachments {
  const have = new Set(current.signatures.map((s) => s.id));
  return { ...current, signatures: [...current.signatures, ...incoming.filter((s) => !have.has(s.id))] };
}
