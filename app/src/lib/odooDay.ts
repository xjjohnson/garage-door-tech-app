/**
 * The end-of-day summary kept in Odoo: each closed day is posted as a note on
 * the tech's employee record (hr.employee, from the Employees app), so it
 * lives in Odoo and not only on the phone. Kept free of React.
 */
import type { OdooClient } from './odoo';
import type { ClosedDay } from './endOfDay';

type Client = Pick<OdooClient, 'call' | 'session'>;

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class NoEmployeeError extends Error {
  constructor() {
    super('Your Odoo user has no employee record, so the summary stayed on the phone. Link one in Odoo (Employees > Related User).');
  }
}

/** The signed-in user's employee record in Odoo. */
export async function myEmployee(c: Client): Promise<number> {
  const [id] = (await c.call('hr.employee', 'search', [[['user_id', '=', c.session.uid]]], { limit: 1 })) as number[];
  if (!id) throw new NoEmployeeError();
  return id;
}

/** Posts a closed day's summary as a note on the tech's employee record. */
export async function postDaySummary(c: Client, day: Pick<ClosedDay, 'text'>): Promise<void> {
  const id = await myEmployee(c);
  const body = `<p><b>End of day</b></p><p>${esc(day.text).replace(/\n/g, '<br>')}</p><p><i>From the app</i></p>`;
  await c.call('hr.employee', 'message_post', [[id]], { body, message_type: 'comment', subtype_xmlid: 'mail.mt_note' });
}
