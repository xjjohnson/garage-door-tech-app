/**
 * Several estimates on one job (Justin, Nov 14). Each estimate is a ticket
 * with its own draft quotation in Odoo, e.g. Good, Better and Best, or a
 * repair against a replacement. `job.ticket` is always the estimate being
 * worked on (so the Ticket screen, parts and invoice code are unchanged) and
 * `job.estimates` holds the others. When the customer picks one, it becomes
 * the ticket and the rest are declined: cancelled in Odoo and kept on the job
 * as Declined. Kept free of React so it can be tested directly.
 */
import type { OdooClient } from './odoo';
import { linesKey, newLineId, parseTicket, Ticket } from './ticket';

export interface EstimateSet {
  ticket: Ticket;
  others: Ticket[];
}

export function parseEstimates(v: unknown): Ticket[] {
  return Array.isArray(v) ? v.flatMap((x) => { const t = parseTicket(x); return t?.id ? [t] : []; }) : [];
}

/** Estimates still on offer: not declined. */
export const openEstimates = (others: Ticket[]) => others.filter((t) => !t.declinedAt);
export const declinedEstimates = (others: Ticket[]) => others.filter((t) => !!t.declinedAt);

/** How many estimates the customer is choosing between (the one being worked on counts). */
export const choosing = (s: EstimateSet) => 1 + openEstimates(s.others).length;

/** Waiting for the customer to pick: more than one estimate is open and none is picked yet. */
export const awaitingPick = (s: EstimateSet) => !s.ticket.pickedAt && choosing(s) > 1;

const hasContent = (t: Ticket) => t.lines.length > 0 || !!t.order || !!t.deposits?.length;

/** The name to show: its title, or "Estimate 2" by position (the ticket is first). */
export function estimateName(t: Ticket, index: number): string {
  return t.title?.trim() || `Estimate ${index + 1}`;
}

/** The set as a list in display order: the one being worked on, then the others. */
export const allEstimates = (s: EstimateSet): Ticket[] => [s.ticket, ...s.others];

/** Gives the ticket an id and a name once the job holds more than one estimate. */
const named = (t: Ticket, index: number, mkId: () => string): Ticket => ({ ...t, id: t.id ?? mkId(), title: t.title?.trim() || `Estimate ${index + 1}` });

/**
 * Starts another estimate and makes it the one being worked on. The one that
 * was being worked on is kept in the list; an empty one nobody saved is
 * replaced rather than kept.
 */
export function addEstimate(s: EstimateSet, fresh: Pick<Ticket, 'lines'> & { title?: string }, mkId: () => string = () => newLineId(Date.now())): EstimateSet {
  const index = s.others.length + 1;
  const title = fresh.title?.trim() || `Estimate ${index + 1}`;
  // An empty estimate nobody saved isn't worth keeping: the new one takes its place.
  if (!hasContent(s.ticket)) return { ticket: { lines: fresh.lines, id: s.ticket.id ?? mkId(), title: fresh.title?.trim() || s.ticket.title || title }, others: s.others };
  return { ticket: { lines: fresh.lines, id: mkId(), title }, others: [named(s.ticket, 0, mkId), ...s.others] };
}

/** Makes another estimate the one being worked on (the current one goes back in the list). */
export function switchTo(s: EstimateSet, id: string, mkId: () => string = () => newLineId(Date.now())): EstimateSet {
  const target = s.others.find((t) => t.id === id);
  if (!target) return s;
  const rest = s.others.filter((t) => t.id !== id);
  return { ticket: target, others: [named(s.ticket, 0, mkId), ...rest] };
}

/**
 * The customer picks this estimate: it becomes the ticket and every other
 * open one is declined (cancelled in Odoo, which `cancelDeclined` does).
 * With no id, the estimate being worked on is the pick.
 */
export function pickEstimate(s: EstimateSet, id: string | undefined, now: number, mkId?: () => string): EstimateSet {
  const cur = id && s.ticket.id !== id ? switchTo(s, id, mkId) : s;
  const { declinedAt: _d, cancelPending: _c, ...ticket } = cur.ticket;
  const others = cur.others.map((t): Ticket => (t.declinedAt ? t : { ...t, declinedAt: now, ...(t.order ? { cancelPending: true } : {}) }));
  return { ticket: { ...ticket, pickedAt: now }, others };
}

/**
 * The customer changes their mind: a declined estimate comes back as the one
 * being worked on, and the picked one goes back to being open. A quotation
 * already cancelled in Odoo isn't reopened; a new one is made from the lines.
 */
export function bringBack(s: EstimateSet, id: string, mkId?: () => string): EstimateSet {
  const cur = switchTo(s, id, mkId);
  const { declinedAt: _d, pickedAt: _p, cancelPending, ...ticket } = cur.ticket;
  if (!cancelPending) {
    delete ticket.order;
    delete ticket.totals;
    delete ticket.estimateAt;
  }
  const others = cur.others.map((t): Ticket => { const { pickedAt: _x, ...r } = t; return r; });
  return { ticket, others };
}

/** Takes an estimate off the job (an empty or unwanted one). Its quotation in Odoo is cancelled with the declined ones. */
export function removeEstimate(s: EstimateSet, id: string, now: number): EstimateSet {
  if (s.ticket.id === id) {
    const next = openEstimates(s.others)[0];
    if (!next) return s;
    return { ticket: next, others: [...s.others.filter((t) => t.id !== next.id), ...(s.ticket.order ? [{ ...s.ticket, declinedAt: now, cancelPending: true }] : [])] };
  }
  return { ticket: s.ticket, others: s.others.flatMap((t): Ticket[] => (t.id !== id ? [t] : t.order ? [{ ...t, declinedAt: now, cancelPending: true }] : [])) };
}

/**
 * The customer signs an estimate (0.8). Signing is how they pick it: with
 * several open and none picked, it becomes the pick (the others are declined).
 * It is the one being worked on afterwards, and the signature covers the lines
 * as they are now. With no id, the estimate being worked on is signed.
 */
export function signEstimate(s: EstimateSet, id: string | undefined, sig: { id: string; by: string; at: number }, mkId?: () => string): EstimateSet {
  const target = id ?? s.ticket.id;
  let cur = s;
  if (awaitingPick(s)) cur = pickEstimate(s, target, sig.at, mkId);
  else if (target && s.ticket.id !== target) cur = switchTo(s, target, mkId);
  return { ...cur, ticket: { ...cur.ticket, signed: { id: sig.id, by: sig.by, at: sig.at, key: linesKey(cur.ticket.lines) } } };
}

/** Notes that the signature is saved on this estimate's quotation in Odoo. */
export const markSignatureSent = (t: Ticket, sigId: string, orderId: number): Ticket => (t.signed?.id === sigId ? { ...t, signed: { ...t.signed, sent: `${sigId}:${orderId}` } } : t);

/** Renames an estimate. */
export function renameEstimate(s: EstimateSet, id: string, title: string): EstimateSet {
  const set = (t: Ticket) => (t.id === id ? { ...t, title: title.trim() || undefined } : t);
  return { ticket: set(s.ticket), others: s.others.map(set) };
}

/** Cancels, in Odoo, the quotations of declined estimates that are waiting for it. A quotation that is no longer a draft is left as it is. */
export async function cancelDeclined(client: OdooClient, others: Ticket[]): Promise<Ticket[]> {
  const out: Ticket[] = [];
  for (const t of others) {
    if (!t.cancelPending || !t.order) { out.push(t); continue; }
    const [row] = (await client.call('sale.order', 'read', [[t.order.id]], { fields: ['state'] })) as { state?: string }[];
    if (row?.state === 'draft' || row?.state === 'sent') {
      await client.call('sale.order', 'action_cancel', [[t.order.id]], { context: { disable_cancel_warning: true } });
    }
    const { cancelPending: _c, ...done } = t;
    out.push(done);
  }
  return out;
}
