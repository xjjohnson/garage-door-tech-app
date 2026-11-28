/**
 * The industry the business works in. It decides which tool packs show: the
 * Garage doors pack is the spring calculator, door weight, diagnose and
 * manuals; "Other" shows the basics only. Nothing is deleted, the tools are
 * just hidden, so changing the choice brings them straight back.
 *
 * The choice is kept in Odoo, as a small settings file on the company next to
 * the business details, so every phone agrees; the owner changes it in
 * Management > Industry. A copy is kept on the phone so the tools page is right
 * offline. Until an owner picks, a business starts on its app's own default
 * (Johnsons: garage doors; FS Crew: other).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { currentFlavor } from '../flavor';
import type { OdooClient } from './odoo';
import { myCompany } from './odooSettings';

type Caller = Pick<OdooClient, 'call' | 'session'>;

export type Industry = 'garage-doors' | 'other';

export const INDUSTRIES: { id: Industry; label: string; detail: string }[] = [
  { id: 'garage-doors', label: 'Garage doors and gates', detail: 'Adds the spring calculator, door weight, diagnose and manuals.' },
  { id: 'other', label: 'Other', detail: 'Jobs, tickets, invoices, schedule and stock. No industry tools.' },
];

export const INDUSTRY_FILE = 'app-industry.json';
export const INDUSTRY_KEY = 'johnsons.industry';

export const parseIndustry = (v: unknown): Industry | null => (v === 'garage-doors' || v === 'other' ? v : null);

/** What the owner picked (null until they pick) and whether it has been read yet. */
let picked: Industry | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** The industry in use: the owner's pick, or the app's own default. */
export const currentIndustry = (): Industry => picked ?? currentFlavor().defaultIndustry;

/** Whether the Garage doors tool pack is on. */
export const garageToolsOn = (): boolean => currentIndustry() === 'garage-doors';

export function useIndustry(): Industry {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    currentIndustry,
    currentIndustry,
  );
}

/** Whether an owner has picked yet. A business that hasn't is on its app's default, and is nudged to pick. */
export function useIndustryPicked(): boolean {
  useIndustry();
  return picked !== null;
}

export const useGarageTools = () => useIndustry() === 'garage-doors';

/** Reads the copy kept on the phone. Call once at start. */
export async function loadIndustry(): Promise<void> {
  try {
    picked = parseIndustry(await AsyncStorage.getItem(INDUSTRY_KEY)) ?? picked;
  } catch {
    // Keep what we have.
  }
  emit();
}

async function remember(next: Industry | null) {
  picked = next;
  emit();
  try {
    if (next) await AsyncStorage.setItem(INDUSTRY_KEY, next);
    else await AsyncStorage.removeItem(INDUSTRY_KEY);
  } catch {
    // The phone copy is only for offline.
  }
}

const toBase64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
const fromBase64 = (b: string) => decodeURIComponent(escape(atob(b)));

async function findFile(c: Caller, company: number) {
  const rows = (await c.call('ir.attachment', 'search_read', [[['res_model', '=', 'res.company'], ['res_id', '=', company], ['name', '=', INDUSTRY_FILE]]], { fields: ['datas'], limit: 1, order: 'id desc' })) as { id: number; datas?: string | false }[];
  return rows[0];
}

/** The industry saved on the company, or null when none is saved. Throws when Odoo can't be read, so a bad connection never looks like "nothing saved". */
export async function readIndustry(c: Caller): Promise<Industry | null> {
  const f = await findFile(c, await myCompany(c));
  if (!f || typeof f.datas !== 'string' || !f.datas) return null;
  try {
    return parseIndustry((JSON.parse(fromBase64(f.datas)) as { industry?: unknown }).industry);
  } catch {
    return null;
  }
}

/** Saves the owner's pick on the company, and on this phone. */
export async function writeIndustry(c: Caller, industry: Industry): Promise<void> {
  const company = await myCompany(c);
  const datas = toBase64(JSON.stringify({ version: 1, industry }));
  const f = await findFile(c, company);
  if (f) await c.call('ir.attachment', 'write', [[f.id], { datas }]);
  else await c.call('ir.attachment', 'create', [{ name: INDUSTRY_FILE, type: 'binary', datas, res_model: 'res.company', res_id: company, mimetype: 'application/json' }]);
  await remember(industry);
}

/** Brings this phone in line with Odoo. Nothing is ever written to Odoo from here. */
export async function refreshIndustry(c: Caller): Promise<void> {
  const saved = await readIndustry(c);
  if (saved !== picked) await remember(saved);
}

/** For tests. */
export function resetIndustryForTests(v: Industry | null = null) {
  picked = v;
  emit();
}
