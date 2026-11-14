/**
 * Quick discounts on a ticket or estimate. Two kinds: a percent off (Odoo's own
 * line discount field, put on every line) and a dollar amount off (one
 * "Discount" line with a negative price). Odoo works out the totals; the
 * phone only keeps what was picked. Presets (Senior 10%, $25 off...) are
 * edited in Management > Discounts and kept with the company's business
 * details, so every phone shows the same list. Kept free of React.
 */

/** A discount picked on a ticket: a percent off, or a dollar amount off (cents), never both. */
export interface Discount {
  label: string;
  pct?: number;
  cents?: number;
}

/** A named discount in the owner's list. */
export type DiscountPreset = Discount;

/** What a new company starts with, until the owner changes the list. */
export const DEFAULT_DISCOUNTS: DiscountPreset[] = [
  { label: 'Senior', pct: 10 },
  { label: 'Military', pct: 10 },
  { label: '$25 off', cents: 2500 },
];

/** The most that can come off in percent (more than 100 would pay the customer). */
export const MAX_PCT = 100;

/** Reads a percent as typed ("10", "7.5", "10%"); undefined unless it is above 0 and at most 100. */
export function parsePct(text: string): number | undefined {
  const n = Number(text.replace('%', '').trim());
  return text.trim() && Number.isFinite(n) && n > 0 && n <= MAX_PCT ? Math.round(n * 100) / 100 : undefined;
}

/** Reads dollars as typed ("25", "$12.50") into cents; undefined unless above 0. */
export function parseDollars(text: string): number | undefined {
  const n = Number(text.replace('$', '').trim());
  return text.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : undefined;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
const pctText = (pct: number) => `${Number.isInteger(pct) ? pct : String(pct)}%`;

/** "10% off" or "$25 off". */
export const discountAmountText = (d: Discount) => (d.pct ? `${pctText(d.pct)} off` : `${money(d.cents ?? 0)} off`);

/** What the tech reads: "Senior, 10% off", or just "10% off" for a custom one. */
export function discountText(d: Discount): string {
  const amount = discountAmountText(d);
  return d.label && d.label !== amount ? `${d.label}, ${amount}` : amount;
}

/** The name of the negative line a dollar discount becomes in Odoo. */
export const discountLineName = (d: Discount) => `Discount: ${d.label || 'quick discount'}`;

/** A well-formed discount, or undefined. A percent wins if both are somehow present. */
export function parseDiscount(v: unknown): Discount | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const d = v as Record<string, unknown>;
  const label = typeof d.label === 'string' ? d.label.trim() : '';
  if (typeof d.pct === 'number' && d.pct > 0 && d.pct <= MAX_PCT) return { label, pct: d.pct };
  if (typeof d.cents === 'number' && d.cents > 0) return { label, cents: Math.round(d.cents) };
  return undefined;
}

/** The owner's saved list, or undefined when none was ever saved (then the standard list is used). An empty list is a choice. */
export function parseDiscounts(v: unknown): DiscountPreset[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.flatMap((x) => {
    const d = parseDiscount(x);
    return d && d.label ? [d] : [];
  });
}

/** The presets to offer: the owner's list, or the standard one until they save their own. */
export const presetsFor = (saved: DiscountPreset[] | undefined): DiscountPreset[] => saved ?? DEFAULT_DISCOUNTS;

/** A fingerprint of a discount, so a ticket's saved totals go stale when it changes. */
export const discountKey = (d: Discount | undefined) => (d ? `${d.pct ?? ''}:${d.cents ?? ''}:${d.label}` : '');
