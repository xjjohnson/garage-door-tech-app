/** The wording and links the Office and Sales buttons use. Nothing here sends anything: a text opens the phone's messages and a person presses Send. */
import { phoneLink } from './jobs';
import { smsLink } from './jobSteps';
import type { MoneyRow } from './odooOffice';
import { formatMoney } from './prices';

const first = (name: string) => name.trim().split(/\s+/)[0] ?? '';
const hi = (customer: string) => (first(customer) ? `Hi ${first(customer)}` : 'Hi');

/** A friendly reminder about an invoice that is past due. */
export function reminderText(r: Pick<MoneyRow, 'customer' | 'name' | 'cents' | 'days'>, business: string): string {
  return `${hi(r.customer)}, it's ${business || 'your service team'}. A friendly reminder that invoice ${r.name} for ${formatMoney(r.cents)} is ${r.days > 0 ? `${r.days} day${r.days === 1 ? '' : 's'} past due` : 'due'}. You can pay by check, cash, Cash App, Venmo or Zelle. Reply here with any questions.`;
}

/** A check-in on a quote that has gone quiet. */
export function quoteText(r: Pick<MoneyRow, 'customer' | 'name'>, business: string): string {
  return `${hi(r.customer)}, it's ${business || 'your service team'}. Just checking in on the quote we sent (${r.name}). Happy to answer any questions or find a time that works. Reply here any time.`;
}

/** The sms: link for a row, or undefined when the customer has no phone Odoo shows. */
export const textLink = (phone: string, body: string) => smsLink(phone, body);
export const callLink = (phone: string) => phoneLink(phone);
