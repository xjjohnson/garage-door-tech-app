/**
 * Business details shared by every phone, kept in Odoo: one small settings
 * file (JSON) attached to the company record (res.company), so no Odoo add-on
 * is needed. Holds the name, phone, Cash App, Venmo, Zelle and review link.
 * Any phone reads it; only the owner (an Odoo admin or Field Service manager)
 * edits it, from "Your business". Kept free of React.
 */
import { Business, EMPTY_BUSINESS, parseBusiness } from './invoices';
import type { OdooClient } from './odoo';

export const SETTINGS_FILE = 'johnsons-settings.json';

type Caller = Pick<OdooClient, 'call' | 'session'>;

const toBase64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
const fromBase64 = (b: string) => decodeURIComponent(escape(atob(b)));

export interface SharedSettings {
  business: Business;
}

/** The signed-in user's company. */
export async function myCompany(client: Caller): Promise<number> {
  const [u] = (await client.call('res.users', 'read', [[client.session.uid]], { fields: ['company_id'] })) as { company_id?: unknown }[];
  const c = u?.company_id;
  const id = Array.isArray(c) ? c[0] : c;
  if (typeof id !== 'number') throw new Error('Odoo did not say which company this user belongs to.');
  return id;
}

async function findFile(client: Caller, company: number): Promise<{ id: number; datas: string } | null> {
  const rows = (await client.call('ir.attachment', 'search_read', [[['res_model', '=', 'res.company'], ['res_id', '=', company], ['name', '=', SETTINGS_FILE]]], { fields: ['datas'], limit: 1, order: 'id desc' })) as { id: number; datas?: string | false }[];
  const r = rows[0];
  return r ? { id: r.id, datas: typeof r.datas === 'string' ? r.datas : '' } : null;
}

/** What is saved on the company, or null when nothing has been saved there yet (or the file can't be read). */
export async function readSettings(client: Caller): Promise<SharedSettings | null> {
  const file = await findFile(client, await myCompany(client));
  if (!file?.datas) return null;
  try {
    const data = JSON.parse(fromBase64(file.datas)) as { business?: unknown };
    return data.business && typeof data.business === 'object' ? { business: { ...EMPTY_BUSINESS, ...parseBusiness(data.business as object) } } : null;
  } catch {
    return null;
  }
}

/** Saves the settings on the company, replacing the file's contents. */
export async function writeSettings(client: Caller, s: SharedSettings): Promise<void> {
  const company = await myCompany(client);
  const datas = toBase64(JSON.stringify({ version: 1, business: s.business }));
  const file = await findFile(client, company);
  if (file) await client.call('ir.attachment', 'write', [[file.id], { datas }]);
  else await client.call('ir.attachment', 'create', [{ name: SETTINGS_FILE, type: 'binary', datas, res_model: 'res.company', res_id: company, mimetype: 'application/json' }]);
}

/** The company's name and phone, for a phone that has nothing typed in yet. */
export async function companyDetails(client: Caller): Promise<{ name: string; phone: string }> {
  const [c] = (await client.call('res.company', 'read', [[await myCompany(client)]], { fields: ['name', 'phone'] })) as { name?: unknown; phone?: unknown }[];
  return { name: typeof c?.name === 'string' ? c.name : '', phone: typeof c?.phone === 'string' ? c.phone : '' };
}

/** Whether two sets of details are the same. */
export const sameBusiness = (a: Business, b: Business) => ([...Object.keys(EMPTY_BUSINESS), 'discounts'] as (keyof Business)[]).every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
