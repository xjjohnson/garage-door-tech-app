/**
 * Sections on a ticket. The ticket's lines are one ordered list, the same
 * order the quotation in Odoo shows: priced lines, notes and section headings.
 * A line belongs to the nearest heading above it; lines above the first
 * heading belong to no section. Everything here is plain functions on that
 * list, kept free of React and of ticket.ts's runtime code so both can use it.
 */
import type { Ticket, TicketLine } from './ticket';

/** Where a new or moved line goes: undefined = the end of the last section, null = above the first heading, a string = the end of that section. */
export type At = string | null | undefined;

const isHeading = (l: TicketLine) => l.kind === 'section';
const isText = (l: TicketLine) => l.kind === 'note' || l.kind === 'section';

/** The maintenance plan's fee line always sorts last. */
export function orderLines(lines: TicketLine[]): TicketLine[] {
  return lines.some((l) => l.planFee) ? [...lines.filter((l) => !l.planFee), ...lines.filter((l) => l.planFee)] : lines;
}

export const hasSections = (lines: TicketLine[]) => lines.some(isHeading);

/** Index where the movable lines end (the plan fee line, if any, comes after). */
function bodyEnd(lines: TicketLine[]): number {
  const i = lines.findIndex((l) => l.planFee);
  return i < 0 ? lines.length : i;
}

/** The slice [start, end) of lines that sit under `at`, not counting the heading. */
function bodyRange(lines: TicketLine[], at: At): [number, number] {
  const end = bodyEnd(lines);
  const heads = lines.flatMap((l, i) => (isHeading(l) && i < end ? [i] : []));
  if (at === null) return [0, heads[0] ?? end];
  const h = typeof at === 'string' ? lines.findIndex((l) => l.id === at && isHeading(l)) : -1;
  if (h < 0) {
    const last = heads[heads.length - 1];
    return [last === undefined ? 0 : last + 1, end];
  }
  return [h + 1, heads.find((x) => x > h) ?? end];
}

/** Adds a line at the end of a section (or the end of the list). */
export function insertLine(t: Ticket, line: TicketLine, at?: At): Ticket {
  const lines = orderLines(t.lines);
  const [, end] = bodyRange(lines, at);
  return { ...t, lines: [...lines.slice(0, end), line, ...lines.slice(end)] };
}

/** An existing priced line for the same product and price in the same section, so adding it again just adds one. */
export function findSame(t: Ticket, productId: number, unitCents: number, at?: At): TicketLine | undefined {
  const lines = orderLines(t.lines);
  const [a, b] = bodyRange(lines, at);
  return lines.slice(a, b).find((l) => !isText(l) && l.productId === productId && l.unitCents === unitCents);
}

/** The section a line is under (its heading's id), or null when it is above the first heading. */
export function sectionOf(lines: TicketLine[], id: string): string | null {
  let cur: string | null = null;
  for (const l of lines) {
    if (l.id === id) return cur;
    if (isHeading(l)) cur = l.id;
  }
  return cur;
}

/** The headings, in order. */
export const headings = (lines: TicketLine[]) => lines.filter(isHeading);

/** Each section's phone-side subtotal in cents (Odoo's totals still rule). Key "" is the lines above the first heading. */
export function sectionTotals(lines: TicketLine[]): Map<string, number> {
  const out = new Map<string, number>([['', 0]]);
  let cur = '';
  for (const l of lines) {
    if (isHeading(l)) {
      cur = l.id;
      out.set(cur, 0);
    } else if (!isText(l)) out.set(cur, (out.get(cur) ?? 0) + Math.round(l.unitCents * l.qty));
  }
  return out;
}

/** Where a block starts and ends: a heading takes its lines with it, any other line is a block of one. */
function block(lines: TicketLine[], id: string): [number, number] {
  const i = lines.findIndex((l) => l.id === id);
  if (i < 0) return [-1, -1];
  if (!isHeading(lines[i])) return [i, i + 1];
  return [i, bodyRange(lines, id)[1]];
}

/** Whether Move up / Move down would do anything. The plan fee line never moves. */
export function canMove(t: Ticket, id: string, dir: -1 | 1): boolean {
  const lines = orderLines(t.lines);
  const line = lines.find((l) => l.id === id);
  if (!line || line.planFee) return false;
  const [a, b] = block(lines, id);
  if (isHeading(line)) {
    if (dir < 0) return lines.slice(0, a).some(isHeading);
    return b < bodyEnd(lines);
  }
  return dir < 0 ? a > 0 : b < bodyEnd(lines);
}

/**
 * Moves a line one place, or a heading one section (its lines go with it).
 * A line moving past a heading crosses into the next section.
 */
export function moveLine(t: Ticket, id: string, dir: -1 | 1): Ticket {
  if (!canMove(t, id, dir)) return t;
  const lines = orderLines(t.lines);
  const [a, b] = block(lines, id);
  if (!isHeading(lines[a])) {
    const next = lines.slice();
    [next[a], next[a + dir]] = [next[a + dir], next[a]];
    return { ...t, lines: next };
  }
  if (dir < 0) {
    const prev = lines.map((l, i) => (isHeading(l) && i < a ? i : -1)).filter((i) => i >= 0).pop()!;
    return { ...t, lines: [...lines.slice(0, prev), ...lines.slice(a, b), ...lines.slice(prev, a), ...lines.slice(b)] };
  }
  const nextEnd = bodyRange(lines, lines[b].id)[1];
  return { ...t, lines: [...lines.slice(0, a), ...lines.slice(b, nextEnd), ...lines.slice(a, b), ...lines.slice(nextEnd)] };
}

/** Moves a priced line or note to the end of a section (null: above the first heading). Headings and the plan fee don't move this way. */
export function moveToSection(t: Ticket, id: string, to: string | null): Ticket {
  const line = t.lines.find((l) => l.id === id);
  if (!line || isHeading(line) || line.planFee) return t;
  return insertLine({ ...t, lines: t.lines.filter((l) => l.id !== id) }, line, to);
}

/** Renames a heading or note. Blank text leaves it as it was. */
export function renameLine(t: Ticket, id: string, name: string): Ticket {
  const text = name.trim();
  return text ? { ...t, lines: t.lines.map((l) => (l.id === id && isText(l) ? { ...l, name: text } : l)) } : t;
}

/**
 * Sorts a flat ticket under two headings, Labor then Parts. Notes stay under
 * the line before them. Only for a ticket with no headings yet; the plan fee
 * line stays last, outside both.
 */
export function groupIntoLaborAndParts(t: Ticket, ids: () => string): Ticket {
  const lines = orderLines(t.lines);
  if (hasSections(lines)) return t;
  const labor: TicketLine[] = [];
  const parts: TicketLine[] = [];
  let into = labor;
  for (const l of lines) {
    if (l.planFee) continue;
    if (!isText(l)) into = l.kind === 'material' ? parts : labor;
    into.push(l);
  }
  const head = (name: string): TicketLine => ({ id: ids(), name, qty: 1, unitCents: 0, kind: 'section' });
  return { ...t, lines: [...(labor.length ? [head('Labor'), ...labor] : []), ...(parts.length ? [head('Parts'), ...parts] : []), ...lines.filter((l) => l.planFee)] };
}

export const DEFAULT_PLAN_HEADING = 'Maintenance plan';
export const DEFAULT_PAYMENTS_HEADING = 'Payments and plan';

/** The wording of the two automatic headings (Management > Texts); blank means the standard wording. */
export interface AutoHeadings {
  plan?: string;
  payments?: string;
}

export const planHeading = (h?: AutoHeadings) => h?.plan?.trim() || DEFAULT_PLAN_HEADING;
export const paymentsHeading = (h?: AutoHeadings) => h?.payments?.trim() || DEFAULT_PAYMENTS_HEADING;

/**
 * What a signature covers: each priced line (product, name, count, price) and
 * each heading and note's text, in sorted order. Moving things around doesn't
 * change it; adding, removing, repricing or rewording does.
 */
export function signKey(t: Pick<Ticket, 'lines' | 'plan'>): string {
  const parts = t.lines.map((l) => (isText(l) ? `${l.kind}:${l.name}` : `${l.productId ?? ''}:${l.name}:${l.qty}:${l.unitCents}`)).sort();
  return `v2:${parts.join('|')}${t.plan ? `+plan:${t.plan.id}` : ''}`;
}
