/**
 * The company's own prices, set once on the phone and used for every quote.
 * Prices are kept as the text the keypad produced ("185" or "42.50"), like
 * the calculator's inputs, so a half-typed price never breaks what's saved.
 * Kept free of React so it can be tested directly.
 */
import { parseMeasurement } from './measure';

export const PRICE_SHEET_STORAGE_KEY = 'price-sheet/v1';

export type Tier = 'good' | 'better' | 'best';
export const TIERS: Tier[] = ['good', 'better', 'best'];
export const TIER_LABEL: Record<Tier, string> = { good: 'Good', better: 'Better', best: 'Best' };
/** The springs each tier puts in, by cycle rating. */
export const TIER_CYCLES: Record<Tier, number> = { good: 10_000, better: 25_000, best: 50_000 };

export interface AddOn {
  id: string;
  name: string;
  price: string;
  /** Which quote options include it. */
  tiers: Record<Tier, boolean>;
}

export interface PriceSheet {
  /** Trip charge or service call, on every option. */
  serviceCall: string;
  /** Labor to replace the springs, on every option. */
  springLabor: string;
  /** Price of one spring, by the option's cycle rating. */
  spring: Record<Tier, string>;
  addOns: AddOn[];
  /** Sales tax on parts (springs and add-ons), percent. */
  taxPercent: string;
}

export const DEFAULT_ADD_ONS: AddOn[] = [
  { id: 'tuneup', name: 'Tune-up and safety check', price: '', tiers: { good: true, better: true, best: true } },
  { id: 'cables', name: 'Lift cables (pair)', price: '', tiers: { good: false, better: true, best: true } },
  { id: 'rollers', name: 'Nylon rollers (set)', price: '', tiers: { good: false, better: false, best: true } },
  { id: 'bearings', name: 'End bearings (pair)', price: '', tiers: { good: false, better: false, best: true } },
];

export const DEFAULT_PRICE_SHEET: PriceSheet = {
  serviceCall: '',
  springLabor: '',
  spring: { good: '', better: '', best: '' },
  addOns: DEFAULT_ADD_ONS,
  taxPercent: '',
};

/** A price in whole cents, or 0 when blank or unreadable. */
export function cents(text: string): number {
  const v = parseMeasurement(text);
  return v !== undefined && v > 0 ? Math.round(v * 100) : 0;
}

/** "$1,012.60"; whole dollars drop the ".00". */
export function formatMoney(c: number): string {
  const sign = c < 0 ? '-' : '';
  const abs = Math.abs(Math.round(c));
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const rest = abs % 100;
  return `${sign}$${dollars}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`;
}

/** True once at least one price has been entered. */
export function hasPrices(sheet: PriceSheet): boolean {
  return (
    cents(sheet.serviceCall) > 0 ||
    cents(sheet.springLabor) > 0 ||
    TIERS.some((t) => cents(sheet.spring[t]) > 0) ||
    sheet.addOns.some((a) => cents(a.price) > 0)
  );
}

export function newAddOnId(now: number, random: () => number = Math.random): string {
  return `a${now.toString(36)}${Math.floor(random() * 1e6).toString(36)}`;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Reads the saved sheet; anything missing or the wrong shape falls back to the defaults. */
export function parsePriceSheet(raw: string | null): PriceSheet {
  if (!raw) return DEFAULT_PRICE_SHEET;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_PRICE_SHEET;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return DEFAULT_PRICE_SHEET;
  const d = data as Record<string, unknown>;
  const spring = (d.spring && typeof d.spring === 'object' ? d.spring : {}) as Record<string, unknown>;
  const addOns = Array.isArray(d.addOns)
    ? d.addOns.flatMap((a): AddOn[] => {
        if (!a || typeof a !== 'object') return [];
        const x = a as Record<string, unknown>;
        if (typeof x.id !== 'string' || typeof x.name !== 'string') return [];
        const t = (x.tiers && typeof x.tiers === 'object' ? x.tiers : {}) as Record<string, unknown>;
        return [{ id: x.id, name: x.name, price: str(x.price), tiers: { good: t.good === true, better: t.better === true, best: t.best === true } }];
      })
    : DEFAULT_ADD_ONS;
  return {
    serviceCall: str(d.serviceCall),
    springLabor: str(d.springLabor),
    spring: { good: str(spring.good), better: str(spring.better), best: str(spring.best) },
    addOns,
    taxPercent: str(d.taxPercent),
  };
}
