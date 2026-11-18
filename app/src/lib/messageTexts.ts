/**
 * The pre-written texts (On my way, ETA, appointment confirmation, review request). Each button opens the
 * phone's texting app with the words filled in; nothing is ever sent by the
 * app. The wording is edited in Management > Texts and saved with the
 * company's business details. A blank wording means the standard one. Kept
 * free of React.
 */
import type { Business } from './invoices';

export type TextKind = 'onMyWay' | 'eta' | 'confirm' | 'review';

export const TEXT_FIELD: Record<TextKind, 'textOnMyWay' | 'textEta' | 'textConfirm' | 'textReview'> = {
  onMyWay: 'textOnMyWay',
  eta: 'textEta',
  confirm: 'textConfirm',
  review: 'textReview',
};

export const TEXT_LABEL: Record<TextKind, string> = { onMyWay: 'On my way', eta: 'ETA update', confirm: 'Appointment confirmation', review: 'Review request' };

export const TEXT_DEFAULT: Record<TextKind, string> = {
  onMyWay: "Hi {first}, it's {business}. I'm on my way and should be there in about {minutes} minutes.",
  eta: "Hi {first}, it's {business}. Quick update: I'll be there in about {minutes} minutes.",
  confirm: "Hi {first}, it's {business}. Just confirming your garage door appointment {day} {window}. Reply if you need to change it.",
  review: "Hi {first}, thanks for choosing {business}! If you're happy with the work on your garage door, a quick review helps a lot: {review_link}",
};

/** What each {word} in the wording turns into. */
export const TEXT_WORDS = ['{first}', '{business}', '{minutes}', '{day}', '{window}', '{review_link}'] as const;

export interface TextVars {
  /** The customer's full name; only the first word is used. */
  name?: string;
  business?: string;
  minutes?: number;
  /** "today", "tomorrow" or "on Fri, Nov 13". */
  day?: string;
  /** "between 9:00 am and 12:00 pm" when the visit has an arrival window, else "at 9:00 am". */
  window?: string;
  reviewLink?: string;
}

/** The wording to use: the owner's, or the standard one when theirs is blank. */
export function wording(b: Partial<Pick<Business, 'textOnMyWay' | 'textEta' | 'textConfirm' | 'textReview'>>, kind: TextKind): string {
  const own = (b[TEXT_FIELD[kind]] ?? '').trim();
  return own || TEXT_DEFAULT[kind];
}

/** Fills the {words} in. Unknown {words} are left as typed. */
export function fillText(template: string, v: TextVars): string {
  const map: Record<string, string> = {
    first: v.name?.trim().split(/\s+/)[0] || 'there',
    business: v.business?.trim() || 'your garage door tech',
    minutes: String(v.minutes ?? 15),
    day: v.day ?? 'today',
    window: v.window ?? '',
    review_link: v.reviewLink ?? '',
  };
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in map ? map[k] : m)).replace(/[ \t]+$/gm, '').trim();
}

/** The finished text for a kind, using the owner's wording. */
export const messageText = (b: Partial<Business>, kind: TextKind, v: TextVars): string => fillText(wording(b, kind), { business: b.name, ...v });
