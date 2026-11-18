/**
 * Repairs found on an inspection that never made it onto the invoice. When a job's invoice is
 * made, each flagged repair that was not sent to the ticket (or that the customer turned down)
 * becomes a to-do on the customer in Odoo, "Offer repair: replace rollers (Door 1)", so sales
 * can call them later. One to-do per repair, never twice, and only for inspections done after
 * this was switched on. Kept free of React.
 */
import type { Inspection, Repair } from './inspection';
import type { OdooClient } from './odoo';
import { createManualFollowUp } from './odooFollowUps';
import { REPAIR } from './odooOffice';
import { repairsOnTicket, type Ticket } from './ticket';

type Caller = Pick<OdooClient, 'call' | 'session'>;

/** Inspections finished before this are left alone: nothing is flagged for old ones. */
export const REPAIR_REMINDERS_FROM = Date.UTC(2026, 10, 18, 23, 0);

const marker = (jobId: string, repairId: string) => `johnsons-repair:${jobId}:${repairId}`;

export interface UnsoldRepair {
  id: string;
  label: string;
  /** "Door 1", "Door 2 opener", "Gate". */
  where: string;
}

/** Which door or gate a repair was suggested on, from its checklist item key ("d:<door>:<item>", "m:<door>:<motor>:<item>", "g:<item>"). */
export function whereOf(insp: Pick<Inspection, 'doors'>, item: string | undefined): string {
  if (!item) return '';
  const [kind, doorId] = item.split(':');
  if (kind === 'g') return 'Gate';
  const n = insp.doors.findIndex((d) => d.id === doorId);
  const door = n >= 0 ? `Door ${n + 1}` : 'Door';
  return kind === 'm' ? `${door} opener` : door;
}

/**
 * The flagged repairs that never reached a ticket: no ticket line carries the repair's id
 * (see repairsOnTicket). Repairs the tech typed by hand (no checklist item) are not flagged repairs.
 */
export function unsoldRepairs(insp: Inspection | undefined, onTicket: Set<string> = new Set()): UnsoldRepair[] {
  if (!insp || insp.at < REPAIR_REMINDERS_FROM) return [];
  return (insp.repairs ?? [])
    .filter((r: Repair) => !!r.item && r.label.trim() !== '' && !onTicket.has(r.id))
    .map((r) => ({ id: r.id, label: r.label.trim(), where: whereOf(insp, r.item) }));
}

/**
 * Makes the to-dos for a job's unsold repairs. Returns how many were made. A to-do already
 * there (found by its marker) is left as it is, so sending an invoice twice never doubles them.
 */
export async function offerUnsoldRepairs(client: Caller, partnerId: number, job: { id: string; inspection?: Inspection; ticket?: Pick<Ticket, 'lines'>; others?: Pick<Ticket, 'lines'>[] }, now = Date.now()): Promise<number> {
  let made = 0;
  const onTicket = new Set([job.ticket, ...(job.others ?? [])].flatMap((t) => (t ? [...repairsOnTicket(t)] : [])));
  for (const r of unsoldRepairs(job.inspection, onTicket)) {
    const key = marker(job.id, r.id);
    const found = (await client.call('mail.activity', 'search', [[['res_model', '=', 'res.partner'], ['res_id', '=', partnerId], ['note', 'ilike', key]]], { limit: 1 })) as number[];
    if (found[0]) continue;
    await createManualFollowUp(client, partnerId, { title: `${REPAIR} ${r.label}${r.where ? ` (${r.where})` : ''}`, note: key, due: now + 7 * 86_400_000 });
    made++;
  }
  return made;
}
