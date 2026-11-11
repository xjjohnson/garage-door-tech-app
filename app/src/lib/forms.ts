/**
 * What each screen holds (as the tech typed it) and how it turns into a call
 * to the spring math. Kept free of React so it can be tested directly.
 *
 * Every number is stored as the text the keypad produced ("24 1/2"), so the
 * screen shows exactly what was typed and a half-finished entry never breaks
 * the saved state.
 */
import {
  DoorInput,
  DoorResult,
  DrumId,
  MatchInput,
  MatchResult,
  matchOldSpring,
  sizeFromDoor,
  Wind,
  WIRES,
} from '../springCalc';
import { parseMeasurement } from './measure';

export type Outcome<R> =
  | { status: 'incomplete'; missing: string[] }
  | { status: 'error'; message: string }
  | { status: 'ok'; result: R };

/** Standard door heights offered as one-tap choices, in inches. */
export const HEIGHT_CHOICES = [
  { label: "6' 6\"", value: '78' },
  { label: "7'", value: '84' },
  { label: "7' 6\"", value: '90' },
  { label: "8'", value: '96' },
  { label: 'Other', value: 'other' },
] as const;

export const ID_CHOICES = [
  { label: '1 3/4"', value: 1.75 },
  { label: '2"', value: 2 },
  { label: '2 5/8"', value: 2.625 },
] as const;

export const DRUM_CHOICES: { label: string; value: DrumId }[] = [
  { label: '400-8', value: '400-8' },
  { label: '400-12', value: '400-12' },
];

export const CYCLE_CHOICES = [10_000, 25_000, 50_000] as const;

// ---------------------------------------------------------------------------
// Mode 1: match the old spring
// ---------------------------------------------------------------------------

export type WireMethod = 'twenty' | 'caliper' | 'size';

export interface MatchForm {
  wireMethod: WireMethod;
  twentyCoil: string;
  caliper: string;
  /** Nominal wire name, e.g. ".225", when picked from the list. */
  wireSize: string;
  /** "1.75", "2", "2.625" or "other". */
  idChoice: string;
  idOther: string;
  length: string;
  wind: Wind;
  springCount: 1 | 2;
  heightChoice: string;
  heightOther: string;
  drum: DrumId;
  shaft: string;
  /** Floor to the center of the torsion shaft, for the cable length. Optional. */
  shaftHeight: string;
}

export const DEFAULT_MATCH_FORM: MatchForm = {
  wireMethod: 'twenty',
  twentyCoil: '',
  caliper: '',
  wireSize: '',
  idChoice: '2',
  idOther: '',
  length: '',
  wind: 'unknown',
  springCount: 2,
  heightChoice: '84',
  heightOther: '',
  drum: '400-8',
  shaft: '',
  shaftHeight: '',
};

/** Optional positive measurement, or nothing when blank or not a number. */
function optionalMeasurement(text: string): number | undefined {
  const v = parseMeasurement(text);
  return v !== undefined && v > 0 ? v : undefined;
}

function chosenNumber(choice: string, other: string): number | undefined {
  return choice === 'other' ? parseMeasurement(other) : parseMeasurement(choice);
}

export function buildMatchInput(form: MatchForm): { input?: MatchInput; missing: string[] } {
  const missing: string[] = [];
  let wireIn: number | undefined;
  let twentyCoilIn: number | undefined;
  if (form.wireMethod === 'twenty') {
    twentyCoilIn = parseMeasurement(form.twentyCoil);
    if (twentyCoilIn === undefined) missing.push('Length of 20 coils');
  } else if (form.wireMethod === 'caliper') {
    wireIn = parseMeasurement(form.caliper);
    if (wireIn === undefined) missing.push('Wire size (caliper)');
  } else {
    wireIn = WIRES.find((w) => w.nominal === form.wireSize)?.diameterIn;
    if (wireIn === undefined) missing.push('Wire size');
  }
  const insideDiameterIn = chosenNumber(form.idChoice, form.idOther);
  if (insideDiameterIn === undefined) missing.push('Inside diameter');
  const lengthIn = parseMeasurement(form.length);
  if (lengthIn === undefined) missing.push('Spring length');
  const doorHeightIn = chosenNumber(form.heightChoice, form.heightOther);
  if (doorHeightIn === undefined) missing.push('Door height');
  if (missing.length > 0 || insideDiameterIn === undefined || lengthIn === undefined) return { missing };

  const shaft = parseMeasurement(form.shaft);
  const shaftHeight = optionalMeasurement(form.shaftHeight);
  return {
    missing,
    input: {
      ...(wireIn !== undefined ? { wireIn } : { twentyCoilIn }),
      insideDiameterIn,
      lengthIn,
      wind: form.wind,
      springCount: form.springCount,
      doorHeightIn,
      drum: form.drum,
      ...(shaft !== undefined && shaft > 0 ? { maxLengthIn: shaft } : {}),
      ...(shaftHeight !== undefined ? { floorToShaftCenterIn: shaftHeight } : {}),
    },
  };
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Something went wrong with that entry. Check the numbers.';
}

export function runMatch(form: MatchForm): Outcome<MatchResult> {
  const { input, missing } = buildMatchInput(form);
  if (!input) return { status: 'incomplete', missing };
  try {
    return { status: 'ok', result: matchOldSpring(input) };
  } catch (e) {
    return { status: 'error', message: errorMessage(e) };
  }
}

// ---------------------------------------------------------------------------
// Mode 2: size from the door
// ---------------------------------------------------------------------------

export interface DoorForm {
  weight: string;
  heightChoice: string;
  heightOther: string;
  drum: DrumId;
  springCount: 1 | 2;
  targetCycles: number;
  ids: number[];
  shaft: string;
  /** Floor to the center of the torsion shaft, for the cable length. Optional. */
  shaftHeight: string;
}

export const DEFAULT_DOOR_FORM: DoorForm = {
  weight: '',
  heightChoice: '84',
  heightOther: '',
  drum: '400-8',
  springCount: 2,
  targetCycles: 10_000,
  ids: [2],
  shaft: '',
  shaftHeight: '',
};

export function buildDoorInput(form: DoorForm): { input?: DoorInput; missing: string[] } {
  const missing: string[] = [];
  const doorWeightLb = parseMeasurement(form.weight);
  if (doorWeightLb === undefined) missing.push('Door weight');
  const doorHeightIn = chosenNumber(form.heightChoice, form.heightOther);
  if (doorHeightIn === undefined) missing.push('Door height');
  if (form.ids.length === 0) missing.push('Inside diameter');
  if (doorWeightLb === undefined || doorHeightIn === undefined || form.ids.length === 0) return { missing };
  const shaft = parseMeasurement(form.shaft);
  const shaftHeight = optionalMeasurement(form.shaftHeight);
  return {
    missing,
    input: {
      doorWeightLb,
      doorHeightIn,
      drum: form.drum,
      springCount: form.springCount,
      targetCycles: form.targetCycles,
      insideDiametersIn: [...form.ids].sort((a, b) => a - b),
      ...(shaft !== undefined && shaft > 0 ? { maxLengthIn: shaft } : {}),
      ...(shaftHeight !== undefined ? { floorToShaftCenterIn: shaftHeight } : {}),
    },
  };
}

export function runDoor(form: DoorForm): Outcome<DoorResult> {
  const { input, missing } = buildDoorInput(form);
  if (!input) return { status: 'incomplete', missing };
  try {
    return { status: 'ok', result: sizeFromDoor(input) };
  } catch (e) {
    return { status: 'error', message: errorMessage(e) };
  }
}

/** Saved state from an older version may miss fields; fill them from the defaults. */
export function restoreForm<T extends object>(defaults: T, saved: unknown): T {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaults;
  const out: Record<string, unknown> = { ...(defaults as unknown as Record<string, unknown>) };
  for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
    const d = (defaults as unknown as Record<string, unknown>)[k];
    if (d === undefined) continue; // field no longer exists
    if (Array.isArray(d) ? Array.isArray(v) : typeof v === typeof d) out[k] = v;
  }
  return out as T;
}
