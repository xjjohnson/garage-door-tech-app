/**
 * The business profile: the real fields on the Odoo company (res.company), so
 * Odoo's own quotes, invoices and emails show the same details the app does.
 * Odoo is the master: what it says wins, nothing here copies old phone data
 * into it. A field this Odoo doesn't have is skipped, not an error.
 * Cash App, Venmo, Zelle and the review link have no Odoo field and stay in
 * the settings file (odooSettings.ts). Kept free of React.
 */
import type { OdooClient } from './odoo';
import { myCompany } from './odooSettings';

type Caller = Pick<OdooClient, 'call' | 'session'>;

/** The text fields the owner can edit, in the order the screen shows them. */
export const PROFILE_KEYS = ['name', 'vat', 'company_registry', 'report_header', 'phone', 'email', 'website', 'street', 'street2', 'city', 'zip', 'report_footer', 'quotation_validity_days'] as const;
export type ProfileKey = (typeof PROFILE_KEYS)[number];

export interface CompanyProfile {
  values: Record<ProfileKey, string>;
  /** Which of the fields this Odoo has; the screen hides the rest. */
  has: Record<ProfileKey, boolean>;
  /** Read-only pieces, shown as words. */
  state: string;
  country: string;
  currency: string;
  salesTax: string;
}

const text = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const label = (v: unknown) => (Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '');

export async function readProfile(c: Caller): Promise<CompanyProfile> {
  const id = await myCompany(c);
  let known: Record<string, unknown> = {};
  try {
    known = ((await c.call('res.company', 'fields_get', [], { attributes: ['type'] })) as Record<string, unknown>) ?? {};
  } catch {
    // Can't ask which fields exist: try them all.
  }
  const exists = (f: string) => Object.keys(known).length === 0 || f in known;
  const ask = [...PROFILE_KEYS, 'state_id', 'country_id', 'currency_id', 'account_sale_tax_id'].filter(exists);
  const [row] = (await c.call('res.company', 'read', [[id]], { fields: ask })) as Record<string, unknown>[];
  const values = {} as Record<ProfileKey, string>;
  const has = {} as Record<ProfileKey, boolean>;
  for (const k of PROFILE_KEYS) {
    has[k] = exists(k);
    values[k] = text(row?.[k]);
  }
  return { values, has, state: label(row?.state_id), country: label(row?.country_id), currency: label(row?.currency_id), salesTax: label(row?.account_sale_tax_id) };
}

/** Writes only the fields given, and only ones we know. Blank clears the field in Odoo. */
export async function writeProfile(c: Caller, patch: Partial<Record<ProfileKey, string>>): Promise<void> {
  const vals: Record<string, unknown> = {};
  for (const k of PROFILE_KEYS) {
    const v = patch[k];
    if (v === undefined) continue;
    const t = v.trim();
    if (k === 'quotation_validity_days') {
      const n = Math.round(Number(t));
      if (t && (!Number.isFinite(n) || n < 0)) throw new Error('Quote valid days must be a number.');
      vals[k] = t ? n : 0;
    } else vals[k] = t || false;
  }
  if (vals.name === false) throw new Error('The business name can not be empty.');
  if (Object.keys(vals).length === 0) return;
  await c.call('res.company', 'write', [[await myCompany(c)], vals]);
}
