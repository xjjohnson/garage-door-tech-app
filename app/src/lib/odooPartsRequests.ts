/**
 * A salesperson asks for parts. It is saved in Odoo as a to-do on the customer, "Parts request:
 * 2 x Torsion spring", with the part list, the needed-by date and a note inside. Nothing is
 * ordered from here: the buyer sees the request under Purchasing, makes the order the usual
 * way, and marks the request ordered. Kept free of React.
 */
import { createManualFollowUp } from './odooFollowUps';
import type { OdooClient } from './odoo';
import { PARTS_REQUEST } from './odooOffice';

type Caller = Pick<OdooClient, 'call' | 'session'>;

export interface RequestedPart {
  name: string;
  qty: number;
}

/** "2 x Torsion spring" for one part; several parts become "2 x Torsion spring + 1 more". */
export function requestTitle(parts: RequestedPart[]): string {
  if (!parts.length) return PARTS_REQUEST;
  const first = `${parts[0].qty} x ${parts[0].name}`;
  return `${PARTS_REQUEST} ${first}${parts.length > 1 ? ` + ${parts.length - 1} more` : ''}`.slice(0, 120);
}

/** The words saved inside the to-do: every part with its quantity, then the note. */
export function requestNote(parts: RequestedPart[], note: string, by?: string): string {
  return [...parts.map((p) => `${p.qty} x ${p.name}`), by ? `Needed by ${by}` : '', note.trim()].filter(Boolean).join('\n');
}

/** Makes the request. Needs a customer and at least one part with a quantity above 0. */
export async function requestParts(client: Caller, partnerId: number, parts: RequestedPart[], neededBy: number, note: string, byText?: string): Promise<number> {
  const real = parts.filter((p) => p.name.trim() && p.qty > 0);
  if (!partnerId) throw new Error('Pick the customer this is for.');
  if (!real.length) throw new Error('Add at least one part.');
  return createManualFollowUp(client, partnerId, { title: requestTitle(real), note: requestNote(real, note, byText), due: neededBy });
}
