/**
 * Tomorrow's pick list: the parts the next day's booked visits need, checked
 * against the truck. A visit's parts come from the quote option the customer
 * picked on its job (springs and add-ons); a part is matched to a truck item
 * by its Odoo product, else by spring size, else by name. Kept free of React.
 */
import { withRepairs } from './inspection';
import type { Job } from './jobs';
import type { PriceSheet, Tier } from './prices';
import { buildQuote, QuoteLine } from './quote';
import { addDays, Appointment, startOfDay } from './schedule';
import type { StockItem } from './stock';

export interface Need {
  label: string;
  qty: number;
  /** Who it's for: the visit's name. */
  forWho: string[];
  item?: StockItem;
}

export interface PickList {
  day: number;
  visits: number;
  /** Visits with no picked quote, so their parts aren't known. */
  unknown: string[];
  /** Needed and on the truck. */
  onTruck: Need[];
  /** Needed and short: not on the truck, or not enough. */
  short: (Need & { have: number })[];
}

/** Add-ons that aren't parts. */
const NOT_PARTS = /tune|safety check|service|labor|trip|inspect/i;

/** The lines on a quote that are parts to bring. */
export function partLines(lines: QuoteLine[]): QuoteLine[] {
  return lines.filter((l) => l.key && (l.key.startsWith('spring.') || l.key.startsWith('extensionSpring.') || (l.key.startsWith('addOn.') && !NOT_PARTS.test(l.label))));
}

const VULGAR: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75 };

/** 2, 1.75 from "2", "1 3/4", "1¾", "1.75". */
function inches(t: string): number {
  let n = 0;
  for (const part of t.trim().split(/\s+/)) {
    const v = part.match(/^(\d+(?:\.\d+)?)?([¼½¾])?$/);
    const f = part.match(/^(\d+)\/(\d+)$/);
    if (f) n += Number(f[1]) / Number(f[2]);
    else if (v) n += Number(v[1] ?? 0) + (v[2] ? VULGAR[v[2]] : 0);
  }
  return Math.round(n * 1000) / 1000;
}

/** ".250|1.75|30" from '.250 × 1 3/4" × 30"' or '.250 x 1¾" x 30" torsion spring', to match springs written either way. */
export function springSize(text: string): string | undefined {
  const m = text.replace(/×/g, 'x').match(/(\.\d{3})\s*x\s*(\d+(?:\.\d+)?(?:\s*[¼½¾]|\s+\d+\/\d+)?|[¼½¾])\s*"?\s*x\s*(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?)/i);
  return m ? `${m[1]}|${inches(m[2])}|${inches(m[3])}` : undefined;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The truck item a quote line is. */
export function matchItem(line: QuoteLine, items: StockItem[], sheet: PriceSheet): StockItem | undefined {
  const pid = line.key ? sheet.odoo[line.key]?.id : undefined;
  if (pid) {
    const byId = items.find((i) => i.odooId === pid);
    if (byId) return byId;
  }
  const size = springSize(line.label);
  if (size) return items.find((i) => springSize(i.name) === size);
  const n = norm(line.label);
  return items.find((i) => norm(i.name) === n) ?? items.find((i) => n.length > 3 && (norm(i.name).includes(n) || n.includes(norm(i.name))));
}

/** The picked option's lines for a job, with its inspection repairs. */
export function pickedLines(job: Job, sheet: PriceSheet, tier: Tier): QuoteLine[] {
  const q = withRepairs(buildQuote(job, sheet), job.inspection, sheet, job.quoteLines);
  return q.options.find((o) => o.tier === tier && o.available)?.lines ?? [];
}

export function pickList(appointments: Appointment[], jobs: Job[], items: StockItem[], sheet: PriceSheet, now: number): PickList {
  const day = addDays(startOfDay(now), 1);
  const end = addDays(day, 1);
  const visits = appointments.filter((a) => a.status === 'booked' && a.start >= day && a.start < end).sort((a, b) => a.start - b.start);
  const needs = new Map<string, Need>();
  const unknown: string[] = [];
  for (const v of visits) {
    const job = v.jobId ? jobs.find((j) => j.id === v.jobId) : undefined;
    if (!job?.accepted) {
      unknown.push(v.name || v.address || 'A visit');
      continue;
    }
    for (const l of partLines(pickedLines(job, sheet, job.accepted.tier))) {
      const item = matchItem(l, items, sheet);
      const key = item ? `item:${item.id}` : `label:${norm(l.label)}`;
      const n = needs.get(key) ?? { label: item?.name ?? l.label, qty: 0, forWho: [], ...(item ? { item } : {}) };
      n.qty += l.qty && l.qty > 0 ? l.qty : 1;
      const who = v.name || v.address;
      if (who && !n.forWho.includes(who)) n.forWho.push(who);
      needs.set(key, n);
    }
  }
  const onTruck: Need[] = [];
  const short: PickList['short'] = [];
  for (const n of needs.values()) {
    const have = n.item?.onHand ?? 0;
    if (n.item && have >= n.qty) onTruck.push(n);
    else short.push({ ...n, have });
  }
  const byLabel = (a: Need, b: Need) => a.label.localeCompare(b.label);
  return { day, visits: visits.length, unknown, onTruck: onTruck.sort(byLabel), short: short.sort(byLabel) };
}
