/**
 * Turns a saved job and the price sheet into a good / better / best quote.
 * Each option puts in springs of a higher cycle rating (10k, 25k, 50k) and
 * whatever add-ons the price sheet includes in it. Kept free of React so it
 * can be tested directly.
 */
import { formatLife, springName } from './springNames';
import { runDoor, runDrums, runExtension, runMatch } from './forms';
import { JobInputs } from './jobs';
import { formatNumber } from './measure';
import { AddOn, cents, formatMoney, PriceSheet, Tier, TIER_CYCLES, TIER_LABEL, TIERS } from './prices';
import { ExtensionResult, ExtensionSpring, SpringSpec } from '../springCalc';

export interface QuoteLine {
  label: string;
  /** Total for the line, in cents. */
  cents: number;
  taxable: boolean;
  /** The price-sheet line it came from (see priceLines), so it can be matched to an Odoo product. */
  key?: string;
  /** How many, when the line is a price each times a count (springs). */
  qty?: number;
  /** The Odoo product, when the line came from an Odoo quotation template. */
  productId?: number;
}

export interface QuoteOption {
  tier: Tier;
  /** False when no spring of this rating fits; the reason says why. */
  available: boolean;
  reason?: string;
  spring?: SpringSpec;
  /** On an extension spring job: the springs on each side, instead of `spring`. */
  extension?: ExtensionSpring[];
  springCount: number;
  lines: QuoteLine[];
  subtotal: number;
  tax: number;
  total: number;
}

export interface Quote {
  /** Set when the calculator can't give springs at all (missing input or a STOP). */
  blocked?: string;
  options: QuoteOption[];
}

/** The spring each option puts in, or why there isn't one. */
function tierSprings(inputs: Exclude<JobInputs, { mode: 'extension' }>): { blocked?: string; springs: Record<Tier, SpringSpec | string> } {
  const none = { good: '', better: '', best: '' };
  if (inputs.mode === 'match') {
    const out = runMatch(inputs.form);
    if (out.status === 'incomplete') return { blocked: `Missing: ${out.missing.join(', ')}`, springs: none };
    if (out.status === 'error') return { blocked: out.message, springs: none };
    const stop = out.result.warnings.find((w) => w.level === 'stop');
    if (stop) return { blocked: stop.message, springs: none };
    const { old, upgrades } = out.result;
    const pick = (t: Tier): SpringSpec | string => {
      const target = TIER_CYCLES[t];
      if (t === 'good') return old;
      const up = upgrades.find((u) => u.targetCycles === target)?.spring;
      if (up) return up;
      if (old.life.cycles >= target || old.life.atOrAboveMaximum) return old;
      return `No ${formatNumber(target)}-cycle spring fits`;
    };
    return { springs: { good: pick('good'), better: pick('better'), best: pick('best') } };
  }
  const springs = { ...none } as Record<Tier, SpringSpec | string>;
  if (inputs.mode === 'drums') {
    for (const t of TIERS) {
      const out = runDrums({ ...inputs.form, targetCycles: TIER_CYCLES[t] });
      if (out.status === 'incomplete') return { blocked: `Missing: ${out.missing.join(', ')}`, springs: none };
      if (out.status === 'error') return { blocked: out.message, springs: none };
      const hl = out.result.highLift ?? out.result.heavy;
      if (!hl) return { blocked: out.result.noTurns ?? 'No turns for this door', springs: none };
      // A tier with no spring is shown as unavailable; any other STOP blocks the quote.
      const stop = hl.warnings.find((w) => w.level === 'stop' && !/fits/.test(w.message));
      if (stop) return { blocked: stop.message, springs: none };
      springs[t] = hl.options[0] ?? `No ${formatNumber(TIER_CYCLES[t])}-cycle spring fits`;
    }
    return { springs };
  }
  for (const t of TIERS) {
    const out = runDoor({ ...inputs.form, targetCycles: TIER_CYCLES[t] });
    if (out.status === 'incomplete') return { blocked: `Missing: ${out.missing.join(', ')}`, springs: none };
    if (out.status === 'error') return { blocked: out.message, springs: none };
    const stop = out.result.warnings.find((w) => w.level === 'stop');
    if (stop) return { blocked: stop.message, springs: none };
    springs[t] = out.result.options[0] ?? `No ${formatNumber(TIER_CYCLES[t])}-cycle spring fits`;
  }
  return { springs };
}

function addOnsFor(tier: Tier, addOns: AddOn[]): QuoteLine[] {
  return addOns.filter((a) => a.tiers[tier] && a.name.trim() !== '').map((a) => ({ label: a.name.trim(), cents: cents(a.price), taxable: true, key: `addOn.${a.id}` }));
}

function taxOf(lines: QuoteLine[], sheet: PriceSheet): number {
  const taxRate = cents(sheet.taxPercent) / 10_000; // "8.25" → 825 → 0.0825
  return Math.round(lines.filter((l) => l.taxable).reduce((n, l) => n + l.cents, 0) * taxRate);
}

/** "2 extension springs, 140 lb Blue, 25" × 42"" or "4 extension springs, 110 + 100 lb a side". */
export function extensionLineLabel(r: Pick<ExtensionResult, 'springCount' | 'lengthIn' | 'stretchIn'>, perSide: ExtensionSpring[]): string {
  const [first] = perSide;
  const same = perSide.every((s) => s.ratingLb === first?.ratingLb);
  const rating = same && first ? `${first.ratingLb} lb ${first.color}` : `${perSide.map((s) => s.ratingLb).join(' + ')} lb a side`;
  const size = r.lengthIn !== undefined ? `, ${r.lengthIn}" × ${r.stretchIn}"` : `, ${r.stretchIn}" stretch`;
  return `${r.springCount} extension springs, ${rating}${size}`;
}

/** Extension springs don't come in cycle grades: every option puts in the same size, priced by option. */
function buildExtensionQuote(inputs: Extract<JobInputs, { mode: 'extension' }>, sheet: PriceSheet): Quote {
  const out = runExtension(inputs.form);
  if (out.status === 'incomplete') return { blocked: `Missing: ${out.missing.join(', ')}`, options: [] };
  if (out.status === 'error') return { blocked: out.message, options: [] };
  const stop = out.result.warnings.find((w) => w.level === 'stop');
  if (stop) return { blocked: stop.message, options: [] };
  const r = out.result;
  const perSide = r.perSide;
  if (!perSide) return { blocked: 'No spring size yet', options: [] };
  const options = TIERS.map((tier): QuoteOption => {
    const lines: QuoteLine[] = [
      { label: extensionLineLabel(r, perSide), cents: cents(sheet.extensionSpring[tier]) * r.springCount, taxable: true, key: `extensionSpring.${tier}`, qty: r.springCount },
      { label: 'Extension spring labor', cents: cents(sheet.extensionLabor), taxable: false, key: 'extensionLabor' },
      { label: 'Service call', cents: cents(sheet.serviceCall), taxable: false, key: 'serviceCall' },
      ...addOnsFor(tier, sheet.addOns),
    ];
    const subtotal = lines.reduce((n, l) => n + l.cents, 0);
    const tax = taxOf(lines, sheet);
    return { tier, available: true, extension: perSide, springCount: r.springCount, lines, subtotal, tax, total: subtotal + tax };
  });
  return { options };
}

export function buildQuote(inputs: JobInputs, sheet: PriceSheet): Quote {
  if (inputs.mode === 'extension') return buildExtensionQuote(inputs, sheet);
  const springCount = inputs.form.springCount;
  const { blocked, springs } = tierSprings(inputs);
  if (blocked) return { blocked, options: [] };
  const options = TIERS.map((tier): QuoteOption => {
    const s = springs[tier];
    if (typeof s === 'string') return { tier, available: false, reason: s, springCount, lines: [], subtotal: 0, tax: 0, total: 0 };
    const each = cents(sheet.spring[tier]);
    const lines: QuoteLine[] = [
      { label: `${springCount === 1 ? '1 spring' : `${springCount} springs`}, ${springName(s)}`, cents: each * springCount, taxable: true, key: `spring.${tier}`, qty: springCount },
      { label: 'Spring labor', cents: cents(sheet.springLabor), taxable: false, key: 'springLabor' },
      { label: 'Service call', cents: cents(sheet.serviceCall), taxable: false, key: 'serviceCall' },
      ...addOnsFor(tier, sheet.addOns),
    ];
    const subtotal = lines.reduce((n, l) => n + l.cents, 0);
    const tax = taxOf(lines, sheet);
    return { tier, available: true, spring: s, springCount, lines, subtotal, tax, total: subtotal + tax };
  });
  return { options };
}

/** Plain text to send the customer: each option with its lines and total. */
export function quoteText(quote: Quote, customer: string): string {
  const parts: string[] = [];
  parts.push(`Garage door spring quote${customer ? ` for ${customer}` : ''}`);
  for (const o of quote.options.filter((x) => x.available)) {
    parts.push('');
    parts.push(`${TIER_LABEL[o.tier].toUpperCase()}: ${formatMoney(o.total)}`);
    if (o.spring) parts.push(`Springs rated ${formatLife(o.spring.life)} cycles`);
    for (const l of o.lines) if (l.cents > 0) parts.push(`- ${l.label}: ${formatMoney(l.cents)}`);
    if (o.tax > 0) parts.push(`- Tax: ${formatMoney(o.tax)}`);
  }
  return parts.join('\n');
}
