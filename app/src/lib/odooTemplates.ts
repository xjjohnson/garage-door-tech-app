/**
 * Good / better / best from Odoo quotation templates. A template named
 * "Opener · Good" (or "Opener • Good", "Opener - Good", "Opener: Good", or
 * just "Opener Good", any case) gives the Good option
 * for jobs of type Opener; its lines' products bring their Odoo price and
 * whether Odoo taxes them. Used for jobs the spring calculator can't price,
 * like openers and tune-ups. Kept free of React.
 */
import type { OdooClient } from './odoo';
import { cents, PriceSheet, Tier, TIER_LABEL, TIERS } from './prices';
import type { Quote, QuoteLine, QuoteOption } from './quote';

export const TEMPLATES_STORAGE_KEY = 'odoo-templates/v1';

export interface TemplateLine {
  productId: number;
  label: string;
  qty: number;
  /** Price each, cents. */
  unitCents: number;
  taxable: boolean;
}

/** Templates by job type (lower case), then tier. */
export type TemplateSets = Record<string, { type: string; tiers: Partial<Record<Tier, TemplateLine[]>>; plain?: boolean }>;

/** A plain-option template (one per Odoo quotation template, its full name) is stored under this prefix, so it never clashes with a job type. */
export const PLAIN_PREFIX = 'template: ';

/** "Opener · Better" → { type: "Opener", tier: "better" }; null when the name has no tier at the end. */
export function tierFromName(name: string): { type: string; tier: Tier } | null {
  const m = /^(.+?)(?:\s*[·•●∙‧\-–—:|/,]\s*|\s+)\(?(good|better|best)\)?\s*$/i.exec(name.trim());
  if (!m) return null;
  return { type: m[1].trim(), tier: m[2].toLowerCase() as Tier };
}

const many2one = (v: unknown): number => (Array.isArray(v) && typeof v[0] === 'number' ? v[0] : typeof v === 'number' ? v : 0);

/** Reads every active good / better / best template from Odoo. */
export async function fetchTemplates(client: Pick<OdooClient, 'call'>): Promise<TemplateSets> {
  const templates = (await client.call('sale.order.template', 'search_read', [[['active', '=', true]]], { fields: ['id', 'name'] })) as { id: number; name: string }[];
  const named = templates.flatMap((t) => {
    const p = tierFromName(t.name ?? '');
    return p ? [{ id: t.id, ...p }] : [];
  });
  if (templates.length === 0) return {};
  const lines = (await client.call('sale.order.template.line', 'search_read', [[['sale_order_template_id', 'in', templates.map((t) => t.id)]]], {
    fields: ['sale_order_template_id', 'product_id', 'name', 'product_uom_qty', 'display_type', 'sequence'],
    order: 'sequence asc, id asc',
  })) as Record<string, unknown>[];
  const real = lines.filter((l) => !l.display_type && many2one(l.product_id));
  const productIds = [...new Set(real.map((l) => many2one(l.product_id)))];
  const products = productIds.length ? ((await client.call('product.product', 'read', [productIds], { fields: ['lst_price', 'taxes_id', 'display_name'] })) as Record<string, unknown>[]) : [];
  const byId = new Map(products.map((p) => [p.id as number, p]));

  const toLines = (id: number): TemplateLine[] =>
    real
      .filter((l) => many2one(l.sale_order_template_id) === id)
      .map((l) => {
        const pid = many2one(l.product_id);
        const p = byId.get(pid);
        const qty = typeof l.product_uom_qty === 'number' && l.product_uom_qty > 0 ? l.product_uom_qty : 1;
        const label = (typeof l.name === 'string' && l.name.trim()) || (typeof p?.display_name === 'string' ? p.display_name : 'Item');
        return { productId: pid, label: label.split('\n')[0], qty, unitCents: typeof p?.lst_price === 'number' ? Math.round(p.lst_price * 100) : 0, taxable: Array.isArray(p?.taxes_id) && p.taxes_id.length > 0 };
      });

  const out: TemplateSets = {};
  // Good / better / best by job type, for quoting a job from its own type's templates.
  for (const t of named) {
    const key = t.type.toLowerCase();
    const set = (out[key] ??= { type: t.type, tiers: {} });
    set.tiers[t.tier] = toLines(t.id);
  }
  // Every template as its own plain option, by its full name.
  for (const t of templates) {
    const name = (t.name ?? '').trim();
    if (!name) continue;
    out[PLAIN_PREFIX + name.toLowerCase()] = { type: name, tiers: { good: toLines(t.id) }, plain: true };
  }
  return out;
}

/** The templates for a job type, if Odoo has any. */
export function templatesFor(sets: TemplateSets, what: string | undefined) {
  return what ? sets[what.trim().toLowerCase()] : undefined;
}

/** Good / better / best from a job type's templates, with any extra lines (inspection repairs) on every option. */
export function templateQuote(set: TemplateSets[string], sheet: Pick<PriceSheet, 'taxPercent'>, extra: QuoteLine[] = []): Quote {
  const taxRate = cents(sheet.taxPercent) / 10_000;
  const options: QuoteOption[] = (set.plain ? (['good'] as Tier[]) : TIERS).map((tier) => {
    const t = set.tiers[tier];
    if (!t || t.length === 0) return { tier, available: false, reason: `No "${set.type} · ${TIER_LABEL[tier]}" template in Odoo`, springCount: 0, lines: [], subtotal: 0, tax: 0, total: 0 };
    const lines: QuoteLine[] = [
      ...t.map((l) => ({ label: l.qty !== 1 ? `${l.label} × ${l.qty}` : l.label, cents: Math.round(l.unitCents * l.qty), taxable: l.taxable, productId: l.productId, ...(l.qty !== 1 ? { qty: l.qty } : {}) })),
      ...extra,
    ];
    const subtotal = lines.reduce((n, l) => n + l.cents, 0);
    const tax = Math.round(lines.filter((l) => l.taxable).reduce((n, l) => n + l.cents, 0) * taxRate);
    return { tier, ...(set.plain ? { title: set.type } : {}), available: true, springCount: 0, lines, subtotal, tax, total: subtotal + tax };
  });
  return { options };
}

/** Reads the saved templates; anything the wrong shape is dropped. */
export function parseTemplates(raw: string | null): TemplateSets {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== 'object') return {};
    const out: TemplateSets = {};
    for (const [k, s] of Object.entries(v as Record<string, unknown>)) {
      const x = s as { type?: unknown; tiers?: Record<string, unknown> };
      if (typeof x?.type !== 'string' || !x.tiers || typeof x.tiers !== 'object') continue;
      const tiers: Partial<Record<Tier, TemplateLine[]>> = {};
      for (const tier of TIERS) {
        const lines = x.tiers[tier];
        if (!Array.isArray(lines)) continue;
        tiers[tier] = lines.flatMap((l): TemplateLine[] => {
          const y = l as Record<string, unknown>;
          return typeof y.productId === 'number' && typeof y.label === 'string'
            ? [{ productId: y.productId, label: y.label, qty: typeof y.qty === 'number' ? y.qty : 1, unitCents: typeof y.unitCents === 'number' ? y.unitCents : 0, taxable: y.taxable === true }]
            : [];
        });
      }
      out[k] = { type: x.type, tiers, ...((s as { plain?: unknown }).plain === true ? { plain: true } : {}) };
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * The templates that price a spring job: the job type's own ("New door · Good"),
 * else "Springs · Good" / "Spring · Good" / "Spring replacement · Good".
 */
export function springTemplatesFor(sets: TemplateSets, what: string | undefined) {
  return templatesFor(sets, what) ?? sets['springs'] ?? sets['spring'] ?? sets['spring replacement'];
}

/** The template line that is the spring itself: says "spring" and isn't labor. */
const isSpringLine = (label: string) => /spring/i.test(label) && !/labou?r|install|service/i.test(label);

/**
 * Good / better / best for a spring job, priced from Odoo templates. The
 * calculator still picks the spring for each option (size and cycle life);
 * the template gives the products and prices. The template's spring line
 * takes the calculator's spring count and size as its quantity and label.
 */
export function springTemplateQuote(springs: Quote, set: TemplateSets[string], sheet: Pick<PriceSheet, 'taxPercent'>, extra: QuoteLine[] = []): Quote {
  if (springs.blocked) return springs;
  const taxRate = cents(sheet.taxPercent) / 10_000;
  return {
    options: springs.options.map((base): QuoteOption => {
      if (!base.available) return base;
      const t = set.tiers[base.tier];
      if (!t || t.length === 0) return { ...base, available: false, reason: `No "${set.type} · ${TIER_LABEL[base.tier]}" template in Odoo`, lines: [], subtotal: 0, tax: 0, total: 0 };
      const springLabel = base.lines[0]?.label ?? 'Springs';
      const count = Math.max(1, base.springCount);
      let springDone = false;
      const lines: QuoteLine[] = [
        ...t.map((l): QuoteLine => {
          if (!springDone && isSpringLine(l.label)) {
            springDone = true;
            return { label: springLabel, cents: l.unitCents * count, taxable: l.taxable, productId: l.productId, qty: count };
          }
          return { label: l.qty !== 1 ? `${l.label} × ${l.qty}` : l.label, cents: Math.round(l.unitCents * l.qty), taxable: l.taxable, productId: l.productId, ...(l.qty !== 1 ? { qty: l.qty } : {}) };
        }),
        ...extra,
      ];
      const subtotal = lines.reduce((n, l) => n + l.cents, 0);
      const tax = Math.round(lines.filter((l) => l.taxable).reduce((n, l) => n + l.cents, 0) * taxRate);
      return { ...base, lines, subtotal, tax, total: subtotal + tax };
    }),
  };
}
