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
  /** Price of one extension spring, by option (e.g. standard for Good, long-life for Better and Best). */
  extensionSpring: Record<Tier, string>;
  /** Labor to replace extension springs, on every extension option. */
  extensionLabor: string;
  addOns: AddOn[];
  /** Sales tax on parts (springs and add-ons), percent. */
  taxPercent: string;
  /** Lines linked to an Odoo product, by line key (see priceLines), so "Update from Odoo" can refresh their prices. */
  odoo: Record<string, OdooLink>;
}

/** The Odoo product a price-sheet line takes its price from. */
export interface OdooLink {
  id: number;
  name: string;
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
  extensionSpring: { good: '', better: '', best: '' },
  extensionLabor: '',
  addOns: DEFAULT_ADD_ONS,
  taxPercent: '',
  odoo: {},
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
    TIERS.some((t) => cents(sheet.spring[t]) > 0 || cents(sheet.extensionSpring[t]) > 0) ||
    cents(sheet.extensionLabor) > 0 ||
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
  const ext = (d.extensionSpring && typeof d.extensionSpring === 'object' ? d.extensionSpring : {}) as Record<string, unknown>;
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
    extensionSpring: { good: str(ext.good), better: str(ext.better), best: str(ext.best) },
    extensionLabor: str(d.extensionLabor),
    addOns,
    taxPercent: str(d.taxPercent),
    odoo: parseLinks(d.odoo),
  };
}

function parseLinks(v: unknown): Record<string, OdooLink> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, OdooLink> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const l = x as Record<string, unknown> | null;
    if (l && typeof l.id === 'number' && typeof l.name === 'string') out[k] = { id: l.id, name: l.name };
  }
  return out;
}

/** "185" for $185, "42.50" for $42.50: the way the keypad writes prices. */
export function priceText(c: number): string {
  const v = Math.max(0, Math.round(c));
  return v % 100 === 0 ? String(v / 100) : (v / 100).toFixed(2);
}

/** One price on the sheet, by a key that stays the same as prices change ("serviceCall", "spring.good", "addOn.<id>"). */
export interface PriceLine {
  key: string;
  label: string;
  value: string;
}

/** Every price on the sheet, in the order the sheet shows them. */
export function priceLines(sheet: PriceSheet): PriceLine[] {
  return [
    { key: 'serviceCall', label: 'Service call', value: sheet.serviceCall },
    { key: 'springLabor', label: 'Torsion spring labor', value: sheet.springLabor },
    ...TIERS.map((t) => ({ key: `spring.${t}`, label: `${TIER_LABEL[t]} torsion spring`, value: sheet.spring[t] })),
    { key: 'extensionLabor', label: 'Extension spring labor', value: sheet.extensionLabor },
    ...TIERS.map((t) => ({ key: `extensionSpring.${t}`, label: `${TIER_LABEL[t]} extension spring`, value: sheet.extensionSpring[t] })),
    ...sheet.addOns.map((a) => ({ key: `addOn.${a.id}`, label: a.name || 'Add-on', value: a.price })),
  ];
}

/** Sets one line's price by its key. An unknown key changes nothing. */
export function setLinePrice(sheet: PriceSheet, key: string, value: string): PriceSheet {
  const [head, sub] = key.split(/\.(.*)/s);
  if (head === 'serviceCall' || head === 'springLabor' || head === 'extensionLabor') return { ...sheet, [head]: value };
  if ((head === 'spring' || head === 'extensionSpring') && (TIERS as string[]).includes(sub)) return { ...sheet, [head]: { ...sheet[head], [sub]: value } };
  if (head === 'addOn' && sheet.addOns.some((a) => a.id === sub)) return { ...sheet, addOns: sheet.addOns.map((a) => (a.id === sub ? { ...a, price: value } : a)) };
  return sheet;
}

/** Links a line to an Odoo product, or unlinks it with null. */
export function linkLine(sheet: PriceSheet, key: string, link: OdooLink | null): PriceSheet {
  const odoo = { ...sheet.odoo };
  if (link) odoo[key] = link;
  else delete odoo[key];
  return { ...sheet, odoo };
}

/** A product from Odoo, as the import needs it. */
export interface CatalogProduct {
  id: number;
  name: string;
  code?: string;
  /** Sales price in cents. */
  cents: number;
}

export interface OdooImport {
  sheet: PriceSheet;
  /** Lines whose price changed. */
  changed: { label: string; from: string; to: string }[];
  /** Odoo products new to the phone, added as items that aren't on any quote option yet. */
  added: number;
  /** Lines whose Odoo product is gone (deleted, archived or no longer sold); they keep their last price. */
  missing: string[];
}

/** The add-on id an imported Odoo product gets, the same every time. */
export const odooAddOnId = (productId: number) => `odoo${productId}`;

/**
 * Brings the whole Odoo price list onto the sheet: every linked line takes its
 * product's current price, and every product not linked to a line yet becomes
 * an item, ticked on no option until the tech picks Good, Better or Best.
 * Links to add-ons that were removed are dropped.
 */
export function importOdooProducts(sheet: PriceSheet, products: CatalogProduct[]): OdooImport {
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines = new Map(priceLines(sheet).map((l) => [l.key, l]));
  let next: PriceSheet = { ...sheet, odoo: {} };
  const changed: OdooImport['changed'] = [];
  const missing: string[] = [];
  const linked = new Set<number>();
  for (const [key, link] of Object.entries(sheet.odoo)) {
    const line = lines.get(key);
    if (!line) continue;
    next.odoo[key] = link;
    linked.add(link.id);
    const p = byId.get(link.id);
    if (!p) {
      missing.push(line.label);
      continue;
    }
    if (cents(line.value) !== p.cents) {
      const to = priceText(p.cents);
      changed.push({ label: line.label, from: line.value, to });
      next = setLinePrice(next, key, to);
    }
  }
  const fresh = products.filter((p) => !linked.has(p.id) && !next.addOns.some((a) => a.id === odooAddOnId(p.id)));
  next = {
    ...next,
    addOns: [...next.addOns, ...fresh.map((p) => ({ id: odooAddOnId(p.id), name: p.name, price: priceText(p.cents), tiers: { good: false, better: false, best: false } }))],
    odoo: { ...next.odoo, ...Object.fromEntries(fresh.map((p) => [`addOn.${odooAddOnId(p.id)}`, { id: p.id, name: odooName(p) }])) },
  };
  return { sheet: next, changed, added: fresh.length, missing };
}

/** "[SPR-25] Torsion spring 25k" when the product has an internal reference. */
export function odooName(p: Pick<CatalogProduct, 'name' | 'code'>): string {
  return p.code ? `[${p.code}] ${p.name}` : p.name;
}

/** True for an add-on that came from Odoo and isn't on any quote option. */
export function isSpareOdooItem(sheet: PriceSheet, a: AddOn): boolean {
  return !!sheet.odoo[`addOn.${a.id}`] && !TIERS.some((t) => a.tiers[t]);
}
