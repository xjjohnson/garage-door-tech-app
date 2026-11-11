/**
 * The safety check: a walk-around of the door and opener saved with the job,
 * and the repairs it turns up, which go onto every option of the job's quote
 * (and so onto its invoice). Kept free of React so it can be tested directly.
 */
import { formatJobDate } from './jobs';
import { cents, formatMoney, PriceSheet } from './prices';
import { Quote, QuoteLine } from './quote';

export type CheckStatus = 'ok' | 'fix' | 'na';
export const CHECK_LABEL: Record<CheckStatus, string> = { ok: 'OK', fix: 'Needs work', na: 'N/A' };

export interface CheckItem {
  id: string;
  label: string;
  /** What to look for, in a few words. */
  look: string;
  /** Touching it means working near spring tension: for a trained tech only. */
  pro?: boolean;
}

/** In the order a tech walks the door: hardware, springs and balance, then the opener's safety features. */
export const CHECK_ITEMS: CheckItem[] = [
  { id: 'cables', label: 'Lift cables', look: 'Frayed, rusted or kinked strands; cable sitting right on the drum', pro: true },
  { id: 'drums', label: 'Cable drums', look: 'Cracks; set screws tight; cable wraps even', pro: true },
  { id: 'bottom-brackets', label: 'Bottom brackets', look: 'Rust-through or bent; the cable is attached here under tension', pro: true },
  { id: 'springs', label: 'Springs and cones', look: 'Gaps or breaks in the coils, rust, cracked winding cones', pro: true },
  { id: 'bearings', label: 'Center and end bearings', look: 'Grinding, wobble or shaft rubbing the plate' },
  { id: 'rollers', label: 'Rollers', look: 'Worn, cracked or wobbling wheels; seized bearings' },
  { id: 'hinges', label: 'Hinges', look: 'Cracked or loose hinges and section joints' },
  { id: 'tracks', label: 'Tracks and brackets', look: 'Bent, loose or out of line; bolts tight' },
  { id: 'seal', label: 'Bottom seal and weatherstrip', look: 'Torn, flattened or missing' },
  { id: 'balance', label: 'Door balance', look: 'With the opener released, the door stays put about halfway up' },
  { id: 'opener', label: 'Opener, rail and drive', look: 'Rail straight and tight, chain or belt tension, strange noise' },
  { id: 'photo-eyes', label: 'Photo eyes', look: 'Door closing reverses when the beam is blocked; eyes 6" or less off the floor' },
  { id: 'auto-reverse', label: 'Auto-reverse', look: 'Door reverses on hitting a 1½" board (a 2×4 laid flat) under it' },
  { id: 'release', label: 'Emergency release', look: 'Red cord and handle there and working; door moves by hand' },
];

export interface CheckResult {
  status: CheckStatus;
  note: string;
}

export interface Repair {
  id: string;
  label: string;
  /** As typed on the keypad, like the price sheet: "45" or "42.50". */
  price: string;
  taxable: boolean;
}

export interface Inspection {
  /** When last changed. */
  at: number;
  results: Record<string, CheckResult>;
  /** Extra lines added to every option of the quote. */
  repairs: Repair[];
}

export function checkCounts(insp: Inspection | undefined): { done: number; fix: number; total: number } {
  const results = Object.entries(insp?.results ?? {}).filter(([id]) => CHECK_ITEMS.some((i) => i.id === id));
  return { done: results.length, fix: results.filter(([, r]) => r.status === 'fix').length, total: CHECK_ITEMS.length };
}

/** The job's repairs as quote lines; ones with no name or price are left off. */
export function repairLines(insp: Inspection | undefined): QuoteLine[] {
  return (insp?.repairs ?? []).filter((r) => r.label.trim() !== '' && cents(r.price) > 0).map((r) => ({ label: r.label.trim(), cents: cents(r.price), taxable: r.taxable }));
}

/** The quote with the repairs added to every option that can be priced, totals and tax worked out again. */
export function withRepairs(quote: Quote, insp: Inspection | undefined, sheet: PriceSheet): Quote {
  const extra = repairLines(insp);
  if (extra.length === 0 || quote.blocked) return quote;
  const taxRate = cents(sheet.taxPercent) / 10_000;
  return {
    ...quote,
    options: quote.options.map((o) => {
      if (!o.available) return o;
      const lines = [...o.lines, ...extra];
      const subtotal = lines.reduce((n, l) => n + l.cents, 0);
      const tax = Math.round(lines.filter((l) => l.taxable).reduce((n, l) => n + l.cents, 0) * taxRate);
      return { ...o, lines, subtotal, tax, total: subtotal + tax };
    }),
  };
}

/** A short report to send the customer: what was checked and what needs work. */
export function inspectionText(insp: Inspection, customer: string): string {
  const out = [`Garage door safety check${customer ? ` for ${customer}` : ''}, ${formatJobDate(insp.at)}`];
  const fix = CHECK_ITEMS.filter((i) => insp.results[i.id]?.status === 'fix');
  const ok = CHECK_ITEMS.filter((i) => insp.results[i.id]?.status === 'ok');
  if (fix.length > 0) {
    out.push('', 'Needs work:');
    for (const i of fix) out.push(`- ${i.label}${insp.results[i.id].note.trim() ? `: ${insp.results[i.id].note.trim()}` : ''}`);
  }
  if (ok.length > 0) out.push('', `Checked and OK: ${ok.map((i) => i.label).join(', ')}`);
  const lines = repairLines(insp);
  if (lines.length > 0) {
    out.push('', 'Recommended repairs:');
    for (const l of lines) out.push(`- ${l.label}: ${formatMoney(l.cents)}`);
  }
  return out.join('\n');
}

const STATUSES: CheckStatus[] = ['ok', 'fix', 'na'];

/** Reads a saved check; anything the wrong shape is dropped. */
export function parseInspection(v: unknown): Inspection | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const d = v as Record<string, unknown>;
  const results: Record<string, CheckResult> = {};
  if (d.results && typeof d.results === 'object') {
    for (const [id, r] of Object.entries(d.results as Record<string, unknown>)) {
      const x = r as Record<string, unknown> | null;
      if (x && STATUSES.includes(x.status as CheckStatus)) results[id] = { status: x.status as CheckStatus, note: typeof x.note === 'string' ? x.note : '' };
    }
  }
  const repairs = Array.isArray(d.repairs)
    ? d.repairs.flatMap((r): Repair[] => {
        const x = r as Record<string, unknown> | null;
        if (!x || typeof x.id !== 'string') return [];
        return [{ id: x.id, label: typeof x.label === 'string' ? x.label : '', price: typeof x.price === 'string' ? x.price : '', taxable: x.taxable !== false }];
      })
    : [];
  return { at: typeof d.at === 'number' ? d.at : 0, results, repairs };
}

export const EMPTY_INSPECTION = (now: number): Inspection => ({ at: now, results: {}, repairs: [] });
