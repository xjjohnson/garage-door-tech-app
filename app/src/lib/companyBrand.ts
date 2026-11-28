/**
 * The company's logo and brand color from Odoo (res.company), kept on the phone
 * so they work offline. Read-only from Odoo: nothing here writes to it. The
 * logo is used on PDFs and in Settings when the owner turns on "Use the Odoo
 * logo" in Management; the brand color is used by the "Company brand" palette.
 * Kept free of React.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOGO_DATA_URL } from '../data/logoPng';
import { currentFlavor } from '../flavor';
import { myCompany } from './odooSettings';
import type { OdooClient } from './odoo';
import { cleanBrandColor } from './themeLook';
import { writeStartValue } from './themeStart';

type Caller = Pick<OdooClient, 'call' | 'session'>;

export const BRAND_KEY = 'johnsons.companyBrand';
/** A logo bigger than this is not kept (it would slow every start for a picture). */
export const MAX_LOGO_CHARS = 700_000;

export interface CompanyBrand {
  /** data: URL of the logo, or '' when Odoo has none or it is too big. */
  logo: string;
  /** #RRGGBB, or '' when Odoo has none we can use. */
  color: string;
  fetchedAt: number;
}

export const NO_BRAND: CompanyBrand = { logo: '', color: '', fetchedAt: 0 };

/** The image type from the first bytes of the base64 (Odoo gives bare base64). */
export function logoDataUrl(b64: unknown): string {
  if (typeof b64 !== 'string' || !b64 || b64.length > MAX_LOGO_CHARS) return '';
  const mime = b64.startsWith('iVBOR') ? 'image/png' : b64.startsWith('/9j/') ? 'image/jpeg' : b64.startsWith('PHN2Zy') || b64.startsWith('PD94') ? 'image/svg+xml' : '';
  return mime ? `data:${mime};base64,${b64}` : '';
}

/** Reads the company's logo and brand color from Odoo. Fields Odoo doesn't have come back empty. */
export async function fetchCompanyBrand(client: Caller, now = Date.now()): Promise<CompanyBrand> {
  const id = await myCompany(client);
  let row: Record<string, unknown> | undefined;
  try {
    [row] = (await client.call('res.company', 'read', [[id]], { fields: ['logo_web', 'primary_color'] })) as Record<string, unknown>[];
  } catch {
    // An Odoo without the brand color field: ask for the logo alone.
    [row] = (await client.call('res.company', 'read', [[id]], { fields: ['logo_web'] })) as Record<string, unknown>[];
  }
  return { logo: logoDataUrl(row?.logo_web), color: cleanBrandColor(row?.primary_color) ?? '', fetchedAt: now };
}

export async function loadCompanyBrand(): Promise<CompanyBrand> {
  try {
    const raw = await AsyncStorage.getItem(BRAND_KEY);
    const d = raw ? (JSON.parse(raw) as Partial<CompanyBrand>) : {};
    return { logo: typeof d.logo === 'string' ? d.logo : '', color: cleanBrandColor(d.color) ?? '', fetchedAt: Number(d.fetchedAt) || 0 };
  } catch {
    return NO_BRAND;
  }
}

/** Keeps what Odoo said, plus an instant copy of the color for the first screen (the new color shows from the next start). */
export async function saveCompanyBrand(b: CompanyBrand): Promise<void> {
  try {
    await AsyncStorage.setItem(BRAND_KEY, JSON.stringify(b));
  } catch {
    // Not kept; it is read again from Odoo next sync.
  }
  writeStartValue('brandcolor', b.color || null);
}

/** Pulls the brand from Odoo and keeps it. Returns what was saved, or the old copy when Odoo can't be reached. */
export async function refreshCompanyBrand(client: Caller, now = Date.now()): Promise<CompanyBrand> {
  try {
    const b = await fetchCompanyBrand(client, now);
    await saveCompanyBrand(b);
    return b;
  } catch {
    return loadCompanyBrand();
  }
}

/** Whether reports use the company's Odoo logo: the owner's switch when they have set it, else the app's own default (Johnsons: built-in logo; FS Crew: the Odoo logo). */
export const odooLogoOn = (useOdooLogo: boolean | undefined): boolean => useOdooLogo ?? currentFlavor().defaultOdooLogo;

/** The logo used when Odoo has none: Johnsons' own in the Johnsons app, nothing in the others (their name stands alone). */
export const builtInLogo = (): string => (currentFlavor().id === 'johnsons' ? LOGO_DATA_URL : '');

/** The logo for PDFs: Odoo's when it is on and the phone has one, else the built-in one. */
export async function reportLogo(useOdooLogo: boolean | undefined): Promise<string> {
  if (!odooLogoOn(useOdooLogo)) return builtInLogo();
  const b = await loadCompanyBrand();
  return b.logo || builtInLogo();
}

export const BRAND_MAX_AGE_MS = 6 * 60 * 60_000;

/** Refreshes the saved brand when it is older than `maxAgeMs` (the logo is a big read, so not on every pass). */
export async function refreshBrandIfStale(client: Caller, now = Date.now(), maxAgeMs = BRAND_MAX_AGE_MS): Promise<void> {
  const cur = await loadCompanyBrand();
  // With nothing usable saved, look again sooner (the owner may just have set a logo in Odoo).
  const age = cur.logo || cur.color ? maxAgeMs : 15 * 60_000;
  if (cur.fetchedAt && now - cur.fetchedAt < age) return;
  await refreshCompanyBrand(client, now);
}
