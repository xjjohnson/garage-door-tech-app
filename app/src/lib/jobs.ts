/**
 * Saved jobs: a calculator's inputs saved with the customer's details, kept
 * on the phone. Kept free of React so it can be tested directly.
 *
 * A job stores the inputs, not the result, so reopening it runs the current
 * math again (and shows any warnings a newer version adds). The one-line
 * summary is stored too, so the list can show it without running the math.
 */
import { OdooJobRef, parseJobRef } from './odooJobs';
import { OdooRef, parseRef } from './odooSales';
import { Inspection, parseInspection, parseRepairs, Repair } from './inspection';
import { DEFAULT_DOOR_FORM, DEFAULT_DRUMS_FORM, DEFAULT_EXTENSION_FORM, DEFAULT_MATCH_FORM, DoorForm, DrumsForm, ExtensionForm, MatchForm, restoreForm } from './forms';
import { Tier, TIERS } from './prices';
import { parseTicket, Ticket } from './ticket';

export const JOBS_STORAGE_KEY = 'jobs/v1';

export type JobStatus = 'open' | 'done';

export interface JobDetails {
  customer: string;
  address: string;
  phone: string;
  notes: string;
}

export const EMPTY_DETAILS: JobDetails = { customer: '', address: '', phone: '', notes: '' };

interface JobBase extends JobDetails {
  id: string;
  /** Milliseconds since 1970, when first saved. */
  savedAt: number;
  /** When the inputs or details last changed. */
  updatedAt: number;
  status: JobStatus;
  /** The calculator's answer when saved, e.g. ".225 × 2" × 24"". */
  summaryTitle: string;
  summaryDetail: string;
  /** The quote option the customer said yes to, with its total then. */
  accepted?: AcceptedQuote;
  /** The customer this job belongs to (src/lib/customers.ts). Set for every job once customers load. */
  customerId?: string;
  /** The safety check and the repairs it found (src/lib/inspection.ts). */
  inspection?: Inspection;
  /** The sales order made in Odoo from the accepted option (src/lib/odooSales.ts). */
  odooOrder?: OdooRef;
  /** The quote signature (its id) already saved on odooOrder in Odoo (since 0.5.40). */
  quoteSignatureSent?: string;
  /** The Field Service order (or task) this job is in Odoo (src/lib/odooJobs.ts). */
  odooJob?: OdooJobRef;
  /** Lines typed on the quote by hand ("Opener install", $150), added to every option. */
  quoteLines?: Repair[];
  /** For a job saved before the phone sent jobs to Odoo: true when the tech picked it to send, false when kept on the phone. */
  sendToOdoo?: boolean;
  /** The job hub's steps (src/lib/jobSteps.ts): when each was tapped. */
  steps?: JobSteps;
  /** What the customer called about, from New job: "Broken spring", "Tune-up"... */
  what?: string;
  /** The running list of services and materials for the job (src/lib/ticket.ts). */
  ticket?: Ticket;
}

/** When the tech tapped On my way, Arrived and Work done, ms. */
export interface JobSteps {
  onMyWayAt?: number;
  arrivedAt?: number;
  workDoneAt?: number;
}

export interface AcceptedQuote {
  tier: Tier;
  /** Total with tax, in cents, as quoted. */
  total: number;
  at: number;
}

export type JobInputs = { mode: 'match'; form: MatchForm } | { mode: 'door'; form: DoorForm } | { mode: 'extension'; form: ExtensionForm }
  | { mode: 'drums'; form: DrumsForm };

export type Job = JobBase & JobInputs;

/** Asks a calculator screen to load a saved job; a new nonce each time, so opening the same job twice works. */
export interface OpenJobRequest {
  job: Job;
  nonce: number;
}

export const MODE_LABEL: Record<Job['mode'], string> = {
  match: 'Match old spring',
  door: 'Size from door',
  extension: 'Extension springs',
  drums: 'Drums and high lift',
};

/** Each mode's blank form, which fills in fields an older saved form lacks. */
const MODE_DEFAULTS: { [M in Job['mode']]: Extract<JobInputs, { mode: M }>['form'] } = {
  match: DEFAULT_MATCH_FORM,
  door: DEFAULT_DOOR_FORM,
  extension: DEFAULT_EXTENSION_FORM,
  drums: DEFAULT_DRUMS_FORM,
};

export function newJobId(now: number, random: () => number = Math.random): string {
  return `${now.toString(36)}-${Math.floor(random() * 1e9).toString(36)}`;
}

/** Trims every field so stray spaces from the phone keyboard don't get saved. */
export function cleanDetails(d: JobDetails): JobDetails {
  return { customer: d.customer.trim(), address: d.address.trim(), phone: d.phone.trim(), notes: d.notes.trim() };
}

export function createJob(
  inputs: JobInputs,
  details: JobDetails,
  summary: { title: string; detail?: string },
  now: number,
  id: string = newJobId(now),
): Job {
  return {
    ...cleanDetails(details),
    ...inputs,
    id,
    savedAt: now,
    updatedAt: now,
    status: 'open',
    summaryTitle: summary.title,
    summaryDetail: summary.detail ?? '',
  } as Job;
}

/** What the list shows as the job's name. */
export function jobName(job: Pick<Job, 'customer' | 'address'>): string {
  return job.customer || job.address || 'No name';
}

/** Open jobs first, then newest first. */
export function sortJobs(jobs: Job[]): Job[] {
  return [...jobs].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return b.savedAt - a.savedAt;
  });
}

function squash(s: string): string {
  return s.toLowerCase().replace(/[\s\-().]/g, '');
}

/** Matches customer, address, phone, notes and the spring summary; spaces, dashes and case don't matter. */
export function searchJobs(jobs: Job[], query: string): Job[] {
  const words = query.toLowerCase().split(/\s+/).map(squash).filter(Boolean);
  if (words.length === 0) return jobs;
  return jobs.filter((j) => {
    const hay = squash([j.customer, j.address, j.phone, j.notes, j.summaryTitle, j.summaryDetail, MODE_LABEL[j.mode]].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/** "Nov 11, 2026" in the phone's language, falling back to ISO if Intl is missing. */
export function formatJobDate(ms: number): string {
  const d = new Date(ms);
  try {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Reads the saved list. Anything that isn't a job is dropped, and forms from
 * an older version get any new fields from the defaults, so a bad entry can
 * never stop the list from loading.
 */
export function parseJobs(raw: string | null): Job[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: Job[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const j = item as Record<string, unknown>;
    if (typeof j.id !== 'string' || typeof j.savedAt !== 'number') continue;
    if (typeof j.mode !== 'string' || !Object.prototype.hasOwnProperty.call(MODE_DEFAULTS, j.mode)) continue;
    const mode = j.mode as Job['mode'];
    const base: JobBase = {
      id: j.id,
      savedAt: j.savedAt,
      updatedAt: typeof j.updatedAt === 'number' ? j.updatedAt : j.savedAt,
      status: j.status === 'done' ? 'done' : 'open',
      customer: str(j.customer),
      address: str(j.address),
      phone: str(j.phone),
      notes: str(j.notes),
      summaryTitle: str(j.summaryTitle),
      summaryDetail: str(j.summaryDetail),
      ...(parseAccepted(j.accepted) ? { accepted: parseAccepted(j.accepted) } : {}),
      ...(typeof j.customerId === 'string' && j.customerId ? { customerId: j.customerId } : {}),
      ...(parseInspection(j.inspection) ? { inspection: parseInspection(j.inspection) } : {}),
      ...(parseRef(j.odooOrder) ? { odooOrder: parseRef(j.odooOrder) } : {}),
      ...(typeof j.quoteSignatureSent === 'string' && j.quoteSignatureSent ? { quoteSignatureSent: j.quoteSignatureSent } : {}),
      ...(parseJobRef(j.odooJob) ? { odooJob: parseJobRef(j.odooJob) } : {}),
      ...(typeof j.sendToOdoo === 'boolean' ? { sendToOdoo: j.sendToOdoo } : {}),
      ...(parseRepairs(j.quoteLines).length ? { quoteLines: parseRepairs(j.quoteLines) } : {}),
      ...(parseSteps(j.steps) ? { steps: parseSteps(j.steps) } : {}),
      ...(typeof j.what === 'string' && j.what ? { what: j.what } : {}),
      ...(parseTicket(j.ticket) ? { ticket: parseTicket(j.ticket) } : {}),
    };
    out.push({ ...base, mode, form: restoreForm<object>(MODE_DEFAULTS[mode], j.form) } as Job);
  }
  return out;
}

function parseSteps(v: unknown): JobSteps | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const out: JobSteps = {};
  for (const k of ['onMyWayAt', 'arrivedAt', 'workDoneAt'] as const) if (typeof r[k] === 'number') out[k] = r[k] as number;
  return Object.keys(out).length ? out : undefined;
}

function parseAccepted(v: unknown): AcceptedQuote | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const a = v as Record<string, unknown>;
  if (!TIERS.includes(a.tier as Tier) || typeof a.total !== 'number' || typeof a.at !== 'number') return undefined;
  return { tier: a.tier as Tier, total: a.total, at: a.at };
}

/** A tel: link with only the characters a dialer understands, or nothing if there's no number. */
export function phoneLink(phone: string): string | undefined {
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.replace(/\+/g, '').length >= 3 ? `tel:${digits}` : undefined;
}
