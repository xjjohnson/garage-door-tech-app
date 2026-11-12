/**
 * The inspection: the garage door checklist Justin used in SafetyCulture,
 * now on the job. One or more doors, each with its motors, and an optional
 * gate (UL 325 and ASTM F2200). Each item gets a rating, a note, photos and
 * an action; bad answers are flagged on their own, and the repairs it turns
 * up go onto every option of the job's quote. Kept free of React.
 *
 * The checklist itself (DOOR_ITEMS and the rest) is fixed in the app for
 * now; Management will let the owner edit it and keep it in Odoo.
 */
import { formatJobDate } from './jobs';
import { cents, formatMoney, PriceSheet } from './prices';
import { Quote, QuoteLine } from './quote';

export type Rating = 'good' | 'fair' | 'poor' | 'risk' | 'na' | 'compliant' | 'non' | 'pass' | 'fail';
export type Scale = 'condition' | 'gfp' | 'compliance' | 'passfail';

export const SCALES: Record<Scale, Rating[]> = {
  condition: ['good', 'fair', 'poor', 'risk', 'na'],
  gfp: ['good', 'fair', 'poor'],
  compliance: ['compliant', 'non', 'na'],
  passfail: ['pass', 'fail', 'na'],
};

export const RATING_LABEL: Record<Rating, string> = {
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  risk: 'Safety risk',
  na: 'N/A',
  compliant: 'Compliant',
  non: 'Non-compliant',
  pass: 'Pass',
  fail: 'Fail',
};

/** Answers that flag an item on their own. */
export const FLAGGED: Rating[] = ['poor', 'risk', 'non', 'fail'];
export const isFlagged = (r: Rating | undefined) => !!r && FLAGGED.includes(r);

/** Points per answer for the score; N/A doesn't count either way. */
const POINTS: Record<Rating, number> = { good: 2, fair: 1, poor: 0, risk: 0, na: 0, compliant: 1, non: 0, pass: 1, fail: 0 };
const MAX: Record<Scale, number> = { condition: 2, gfp: 2, compliance: 1, passfail: 1 };

export interface ItemDef {
  id: string;
  label: string;
  scale: Scale;
  /** Working on it means being near spring tension: a trained tech only. */
  pro?: boolean;
}

export const DOOR_ITEMS: ItemDef[] = [
  { id: 'foundation', label: 'Foundation', scale: 'gfp' },
  { id: 'balance', label: 'Spring balance', scale: 'condition', pro: true },
  { id: 'tube', label: 'Torsion tube', scale: 'condition', pro: true },
  { id: 'drums', label: 'Drums', scale: 'condition', pro: true },
  { id: 'pulleys', label: 'Pulleys', scale: 'condition', pro: true },
  { id: 'cables', label: 'Cables', scale: 'condition', pro: true },
  { id: 'end-bearings', label: 'End bearings', scale: 'condition' },
  { id: 'center-bearing', label: 'Center bearing / plate', scale: 'condition' },
  { id: 'hinges', label: 'Hinges', scale: 'condition' },
  { id: 'top-fixture', label: 'Top fixture', scale: 'condition' },
  { id: 'bottom-fixture', label: 'Bottom fixture', scale: 'condition', pro: true },
  { id: 'struts', label: 'Struts', scale: 'condition' },
  { id: 'rollers', label: 'Rollers', scale: 'condition' },
  { id: 'track', label: 'Track', scale: 'condition' },
  { id: 'panels', label: 'Panels', scale: 'condition' },
  { id: 'windows', label: 'Windows', scale: 'condition' },
  { id: 'bottom-seal', label: 'Bottom seal', scale: 'condition' },
  { id: 'trim', label: 'Trim', scale: 'condition' },
];

export const MOTOR_ITEMS: ItemDef[] = [
  { id: 'drive', label: 'Belt / chain condition', scale: 'gfp' },
  { id: 'gears', label: 'Drive gears', scale: 'gfp' },
  { id: 'force', label: 'Force setting', scale: 'compliance' },
  { id: 'limit', label: 'Limit setting', scale: 'compliance' },
  { id: 'eyes', label: 'Safety eyes', scale: 'compliance' },
  { id: 'board', label: 'Circuit board', scale: 'passfail' },
  { id: 'keypad', label: 'Keypad', scale: 'passfail' },
  { id: 'remote', label: 'Remote', scale: 'passfail' },
  { id: 'wall-button', label: 'Wall button', scale: 'passfail' },
];

export const GATE_UL_ITEMS: ItemDef[] = [
  { id: 'ul-operator', label: 'Gate operator approved to current UL 325 (check the operator label)', scale: 'compliance' },
  { id: 'ul-signs', label: 'Warning signs on both sides of the gate area', scale: 'compliance' },
  { id: 'ul-entrapment', label: 'All entrapment zones protected by 2 safety devices / obstruction tested', scale: 'compliance' },
  { id: 'ul-other', label: 'Other entrapment areas', scale: 'compliance' },
];

/** Shown after Gate type, only for a slide gate (UL 325, from SafetyCulture). */
export const GATE_SLIDE_ITEMS: ItemDef[] = [
  { id: 'slide-roller-covers', label: 'Roller covers on wheels', scale: 'compliance' },
  { id: 'slide-mesh', label: 'Meshing installed up to 6 ft above grade if pickets are spaced 2 1/4" or more apart', scale: 'compliance' },
  { id: 'slide-post-gap', label: 'Gap between gate and fence post less than 2 1/4" and protected with a safety device', scale: 'compliance' },
  { id: 'slide-stops', label: 'Positive stops at both the fully open and fully closed positions', scale: 'compliance' },
  { id: 'slide-receiver', label: 'Receiver guides recessed behind the receiver post (for receiver guides under 8 ft)', scale: 'compliance' },
];

/** Shown after Gate type, only for a swing gate. */
export const GATE_SWING_ITEMS: ItemDef[] = [
  { id: 'swing-pivot', label: 'Distance from pivot point to column edge less than 4"', scale: 'compliance' },
  { id: 'swing-wall', label: 'Distance from open gate to wall or column more than 16", or external entrapment protection provided', scale: 'compliance' },
];

export const GATE_ASTM_ITEMS: ItemDef[] = [
  { id: 'astm-edges', label: 'Smooth bottom edges; no protrusion over 1/2" beyond the base of the gate', scale: 'compliance' },
  { id: 'astm-controls', label: 'All access controls at least 6 ft from the gate', scale: 'compliance' },
  { id: 'astm-tape', label: 'Barbed tape (razor wire) at least 8 ft above grade', scale: 'compliance' },
  { id: 'astm-wire', label: 'Barbed wire at least 6 ft above grade', scale: 'compliance' },
  { id: 'astm-pedestrian', label: 'Separate pedestrian gate, out of reach of the moving gate; vehicle gate for vehicles only', scale: 'compliance' },
  { id: 'astm-disconnect', label: "Gate doesn't move on its own when disconnected from the operator", scale: 'compliance' },
  { id: 'astm-falling', label: 'Gate kept from falling over if disconnected from its supports', scale: 'compliance' },
];

export const DOOR_MAKERS = ['Clopay', 'Amarr', 'Wayne Dalton', 'CHI', 'Raynor', 'Overhead Door', 'Martin', 'Garaga', 'Other'];
export const MOTOR_MAKERS = ['LiftMaster', 'Chamberlain', 'Genie', 'Linear', 'Craftsman', 'Marantec', 'Ryobi', 'Other'];

export interface Answer {
  rating?: Rating;
  note: string;
  /** What to do about it ("Replace rollers"); flagged items with an action can become a repair. */
  action: string;
}

export interface Motor {
  id: string;
  maker: string;
  /** As typed: "2019" or "03/2019". */
  built: string;
  answers: Record<string, Answer>;
}

export interface Door {
  id: string;
  maker: string;
  /** "16x7". */
  size: string;
  /** Year installed, as typed. */
  age: string;
  springCode: string;
  springCycles: string;
  answers: Record<string, Answer>;
  motors: Motor[];
}

export interface Gate {
  type: '' | 'swing' | 'slide';
  answers: Record<string, Answer>;
}

export interface VoiceNote {
  id: string;
  /** A file in the app's own folder. */
  uri: string;
  at: number;
  seconds: number;
}

export interface Repair {
  id: string;
  label: string;
  /** As typed on the keypad, like the price sheet: "45" or "42.50". */
  price: string;
  taxable: boolean;
  /** The checklist item it came from, so the quote can show that item's photos. */
  item?: AnswerKey;
  /** The customer said no to this add-on; it stays listed but off the quote. */
  declined?: boolean;
}

export interface Inspection {
  /** When last changed. */
  at: number;
  /** Ticked when the rollers, track and opener were lubricated. */
  lubricated: boolean;
  doors: Door[];
  /** Set when there's a gate to check (or the job is gate-only). */
  gate?: Gate;
  voice: VoiceNote[];
  /** Extra lines added to every option of the quote. */
  repairs: Repair[];
  /** When the report last went to Odoo, and where ("Field Service order"). */
  sent?: { at: number; to: string };
}

const blank = (): Answer => ({ note: '', action: '' });
const uid = (p: string, now: number, n: number) => `${p}-${now.toString(36)}-${n}`;

export function newMotor(now: number, n = 0): Motor {
  return { id: uid('m', now, n), maker: '', built: '', answers: {} };
}

export function newDoor(now: number, n = 0): Door {
  return { id: uid('d', now, n), maker: '', size: '', age: '', springCode: '', springCycles: '', answers: {}, motors: [newMotor(now, n)] };
}

export const EMPTY_INSPECTION = (now: number, gateOnly = false): Inspection => ({
  at: now,
  lubricated: false,
  doors: gateOnly ? [] : [newDoor(now)],
  ...(gateOnly ? { gate: { type: '', answers: {} } } : {}),
  voice: [],
  repairs: [],
});

/** Where an answer lives: "d:<door>:<item>", "m:<door>:<motor>:<item>" or "g:<item>". */
export type AnswerKey = string;

export interface Section {
  key: string;
  title: string;
  items: { key: AnswerKey; def: ItemDef; answer: Answer | undefined }[];
}

/** Every section in report order: each door, then its motors, then the gate. */
export function sections(insp: Inspection): Section[] {
  const out: Section[] = [];
  insp.doors.forEach((d, i) => {
    out.push({ key: d.id, title: `Door ${i + 1}`, items: DOOR_ITEMS.map((def) => ({ key: `d:${d.id}:${def.id}`, def, answer: d.answers[def.id] })) });
    d.motors.forEach((m, j) => {
      out.push({ key: `${d.id}/${m.id}`, title: `Door ${i + 1} · Motor ${j + 1}`, items: MOTOR_ITEMS.map((def) => ({ key: `m:${d.id}:${m.id}:${def.id}`, def, answer: m.answers[def.id] })) });
    });
  });
  if (insp.gate) {
    out.push({ key: 'gate-ul', title: 'Gate · UL 325', items: GATE_UL_ITEMS.map((def) => ({ key: `g:${def.id}`, def, answer: insp.gate!.answers[def.id] })) });
    const typed = insp.gate.type === 'slide' ? GATE_SLIDE_ITEMS : insp.gate.type === 'swing' ? GATE_SWING_ITEMS : null;
    if (typed) out.push({ key: 'gate-type', title: insp.gate.type === 'slide' ? 'Gate · Slide gate' : 'Gate · Swing gate', items: typed.map((def) => ({ key: `g:${def.id}`, def, answer: insp.gate!.answers[def.id] })) });
    out.push({ key: 'gate-astm', title: 'Gate · ASTM F2200', items: GATE_ASTM_ITEMS.map((def) => ({ key: `g:${def.id}`, def, answer: insp.gate!.answers[def.id] })) });
  }
  return out;
}

/** Changes one answer, wherever it lives. */
export function setAnswer(insp: Inspection, key: AnswerKey, patch: Partial<Answer>): Inspection {
  const [kind, a, b, c] = key.split(':');
  const merge = (cur: Record<string, Answer>, id: string) => ({ ...cur, [id]: { ...blank(), ...cur[id], ...patch } });
  if (kind === 'd') return { ...insp, doors: insp.doors.map((d) => (d.id === a ? { ...d, answers: merge(d.answers, b) } : d)) };
  if (kind === 'm')
    return { ...insp, doors: insp.doors.map((d) => (d.id === a ? { ...d, motors: d.motors.map((m) => (m.id === b ? { ...m, answers: merge(m.answers, c) } : m)) } : d)) };
  if (kind === 'g' && insp.gate) return { ...insp, gate: { ...insp.gate, answers: merge(insp.gate.answers, a) } };
  return insp;
}

/** Answers every unanswered item in a section with the best rating (Good, Compliant, Pass). */
export function restGood(insp: Inspection, sectionKey: string): Inspection {
  const s = sections(insp).find((x) => x.key === sectionKey);
  if (!s) return insp;
  return s.items.filter((i) => !i.answer?.rating).reduce((acc, i) => setAnswer(acc, i.key, { rating: SCALES[i.def.scale][0] }), insp);
}

export interface Flag {
  key: AnswerKey;
  section: string;
  label: string;
  rating: Rating;
  note: string;
  action: string;
}

export function flags(insp: Inspection): Flag[] {
  return sections(insp).flatMap((s) =>
    s.items.filter((i) => isFlagged(i.answer?.rating)).map((i) => ({ key: i.key, section: s.title, label: i.def.label, rating: i.answer!.rating!, note: i.answer!.note, action: i.answer!.action })),
  );
}

export interface Summary {
  answered: number;
  total: number;
  flagged: number;
  actions: number;
  /** Percent of the points available, N/A left out; null before anything is answered. */
  score: number | null;
}

export function summary(insp: Inspection | undefined): Summary {
  if (!insp) return { answered: 0, total: 0, flagged: 0, actions: 0, score: null };
  let answered = 0;
  let total = 0;
  let got = 0;
  let max = 0;
  let actions = 0;
  for (const s of sections(insp)) {
    for (const i of s.items) {
      total++;
      const r = i.answer?.rating;
      if (i.answer?.action.trim()) actions++;
      if (!r) continue;
      answered++;
      if (r === 'na') continue;
      got += POINTS[r];
      max += MAX[i.def.scale];
    }
  }
  return { answered, total, flagged: flags(insp).length, actions, score: max > 0 ? Math.round((got / max) * 100) : null };
}

/** The old name, kept for the job lists: done, needing work, and how many items there are. */
export function checkCounts(insp: Inspection | undefined): { done: number; fix: number; total: number } {
  const s = summary(insp);
  return { done: s.answered, fix: s.flagged, total: s.total };
}

/** A flagged item as a repair to price: its action, or "Rollers: repair". */
export function repairFromFlag(f: Pick<Flag, 'label' | 'action'> & { key?: AnswerKey }, now: number, n: number): Repair {
  return { id: uid('r', now, n), label: f.action.trim() || `${f.label}: repair`, price: '', taxable: true, ...(f.key ? { item: f.key } : {}) };
}

/** The job's repairs as quote lines, then any typed on the quote; ones with no name or price are left off. */
export function repairLines(insp: Inspection | undefined, typed: Repair[] = []): QuoteLine[] {
  return [...(insp?.repairs ?? []), ...typed].filter((r) => !r.declined && r.label.trim() !== '' && cents(r.price) > 0).map((r) => ({ label: r.label.trim(), cents: cents(r.price), taxable: r.taxable }));
}

/** The quote with the repairs added to every option that can be priced, totals and tax worked out again. */
export function withRepairs(quote: Quote, insp: Inspection | undefined, sheet: PriceSheet, typed: Repair[] = []): Quote {
  const extra = repairLines(insp, typed);
  if (extra.length === 0 || quote.blocked) return quote;
  const taxRate = cents(sheet.taxPercent) / 10_000;
  return {
    ...quote,
    options: quote.options.map((o) => {
      if (!o.available) return o;
      const lines = [...o.lines, ...extra];
      const subtotal = lines.reduce((n, l) => n + l.cents, 0);
      const tax = Math.round(lines.filter((l) => l.taxable).reduce((n, l) => n + l.cents, 0) * taxRate);
      return { ...o, lines, subtotal, tax, total: subtotal + tax };
    }),
  };
}

/** One door's details in a line: "Clopay 16x7, installed 2012, spring code 04-18". */
export function doorLine(d: Door): string {
  return [
    [d.maker, d.size].filter(Boolean).join(' '),
    d.age ? `installed ${d.age}` : '',
    d.springCode ? `spring code ${d.springCode}` : '',
    d.springCycles ? `${d.springCycles} cycles` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

/** A short text report: what needs attention, then the score. */
export function inspectionText(insp: Inspection, customer: string): string {
  const out = [`Garage door inspection${customer ? ` for ${customer}` : ''}, ${formatJobDate(insp.at)}`];
  const s = summary(insp);
  const f = flags(insp);
  if (f.length > 0) {
    out.push('', 'Needs attention:');
    for (const x of f) out.push(`- ${x.section}, ${x.label}: ${RATING_LABEL[x.rating]}${x.note.trim() ? `. ${x.note.trim()}` : ''}${x.action.trim() ? ` → ${x.action.trim()}` : ''}`);
  } else if (s.answered > 0) {
    out.push('', 'Nothing flagged.');
  }
  if (s.score !== null) out.push('', `Score: ${s.score}% (${s.answered} of ${s.total} items checked)`);
  const lines = repairLines(insp);
  if (lines.length > 0) {
    out.push('', 'Recommended repairs:');
    for (const l of lines) out.push(`- ${l.label}: ${formatMoney(l.cents)}`);
  }
  return out.join('\n');
}

// Reading saved inspections.

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const ALL_RATINGS = Object.keys(RATING_LABEL) as Rating[];

function parseAnswers(v: unknown): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [id, a] of Object.entries(v as Record<string, unknown>)) {
    const x = (a ?? {}) as Record<string, unknown>;
    out[id] = { ...(ALL_RATINGS.includes(x.rating as Rating) ? { rating: x.rating as Rating } : {}), note: str(x.note), action: str(x.action) };
  }
  return out;
}

function parseMotor(v: unknown, n: number): Motor | null {
  const x = (v ?? {}) as Record<string, unknown>;
  if (typeof x.id !== 'string') return null;
  return { id: x.id || `m-${n}`, maker: str(x.maker), built: str(x.built), answers: parseAnswers(x.answers) };
}

function parseDoor(v: unknown): Door | null {
  const x = (v ?? {}) as Record<string, unknown>;
  if (typeof x.id !== 'string') return null;
  const motors = Array.isArray(x.motors) ? x.motors.map(parseMotor).filter((m): m is Motor => !!m) : [];
  return { id: x.id, maker: str(x.maker), size: str(x.size), age: str(x.age), springCode: str(x.springCode), springCycles: str(x.springCycles), answers: parseAnswers(x.answers), motors };
}

/** The first safety check (0.4) had one list of items marked OK / Needs work / N/A. Where each went. */
const LEGACY: Record<string, { motor?: boolean; id: string }> = {
  cables: { id: 'cables' },
  drums: { id: 'drums' },
  'bottom-brackets': { id: 'bottom-fixture' },
  springs: { id: 'balance' },
  balance: { id: 'balance' },
  bearings: { id: 'end-bearings' },
  rollers: { id: 'rollers' },
  hinges: { id: 'hinges' },
  tracks: { id: 'track' },
  seal: { id: 'bottom-seal' },
  opener: { motor: true, id: 'drive' },
  'photo-eyes': { motor: true, id: 'eyes' },
  'auto-reverse': { motor: true, id: 'force' },
};

function fromLegacy(results: Record<string, unknown>, at: number): Door {
  const door = newDoor(at);
  const motor = door.motors[0];
  for (const [old, r] of Object.entries(results)) {
    const x = (r ?? {}) as Record<string, unknown>;
    const to = LEGACY[old];
    if (!to || !['ok', 'fix', 'na'].includes(x.status as string)) continue;
    const scale = (to.motor ? MOTOR_ITEMS : DOOR_ITEMS).find((d) => d.id === to.id)!.scale;
    const rating: Rating = x.status === 'na' ? 'na' : x.status === 'ok' ? SCALES[scale][0] : scale === 'compliance' ? 'non' : scale === 'passfail' ? 'fail' : 'poor';
    const target = to.motor ? motor.answers : door.answers;
    const prev = target[to.id];
    // Two old items can land on one new one ("springs" and "balance"); the worse answer wins.
    if (prev?.rating && !isFlagged(rating)) continue;
    target[to.id] = { rating, note: [prev?.note, str(x.note)].filter(Boolean).join('; '), action: '' };
  }
  return door;
}

/** Reads saved repair lines (an inspection's, or the ones typed on a job's quote). */
export function parseRepairs(v: unknown): Repair[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((r): Repair[] => {
    const x = r as Record<string, unknown> | null;
    if (!x || typeof x.id !== 'string') return [];
    return [{ id: x.id, label: str(x.label), price: str(x.price), taxable: x.taxable !== false, ...(str(x.item) ? { item: str(x.item) } : {}), ...(x.declined === true ? { declined: true } : {}) }];
  });
}

/** Reads a saved inspection, new or from the 0.4 safety check; anything the wrong shape is dropped. */
export function parseInspection(v: unknown): Inspection | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const d = v as Record<string, unknown>;
  const at = typeof d.at === 'number' ? d.at : 0;
  const repairs = parseRepairs(d.repairs);
  const doors = Array.isArray(d.doors)
    ? d.doors.map(parseDoor).filter((x): x is Door => !!x)
    : d.results && typeof d.results === 'object'
      ? [fromLegacy(d.results as Record<string, unknown>, at)]
      : [];
  const g = d.gate as Record<string, unknown> | undefined;
  const gate: Gate | undefined = g && typeof g === 'object' ? { type: g.type === 'swing' || g.type === 'slide' ? g.type : '', answers: parseAnswers(g.answers) } : undefined;
  const voice = Array.isArray(d.voice)
    ? d.voice.flatMap((x): VoiceNote[] => {
        const n = (x ?? {}) as Record<string, unknown>;
        return typeof n.id === 'string' && typeof n.uri === 'string' && n.uri ? [{ id: n.id, uri: n.uri, at: typeof n.at === 'number' ? n.at : 0, seconds: typeof n.seconds === 'number' ? n.seconds : 0 }] : [];
      })
    : [];
  return {
    at,
    lubricated: d.lubricated === true,
    doors,
    ...(gate ? { gate } : {}),
    voice,
    repairs,
    ...(d.sent && typeof (d.sent as { at?: unknown }).at === 'number' ? { sent: { at: (d.sent as { at: number }).at, to: str((d.sent as { to?: unknown }).to) } } : {}),
  };
}
