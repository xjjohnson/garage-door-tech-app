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
  DrumFit,
  DrumId,
  drumsThatFit,
  EXTENSION_COLORS,
  ExtensionColor,
  ExtensionInput,
  ExtensionResult,
  extensionSprings,
  HighLiftResult,
  highLiftD400_54,
  LiftType,
  MatchInput,
  MatchResult,
  matchOldSpring,
  sizeFromDoor,
  TrackRadius,
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

/** Track radius: the curve where the vertical track turns horizontal. */
export const TRACK_RADIUS_CHOICES: { label: string; value: TrackRadius }[] = [
  { label: '12"', value: 12 },
  { label: '15"', value: 15 },
];

export const TRACK_RADIUS_HINT = 'The curve where the track turns flat. 12" track needs about 4% more spring.';

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
  trackRadius: TrackRadius;
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
  trackRadius: 15,
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
      trackRadiusIn: form.trackRadius,
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
  trackRadius: TrackRadius;
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
  trackRadius: 15,
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
      trackRadiusIn: form.trackRadius,
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

// ---------------------------------------------------------------------------
// Extension springs
// ---------------------------------------------------------------------------

/** Extension door heights: the three with stock sizes, then any other. */
export const EXTENSION_HEIGHT_CHOICES = [
  { label: "7'", value: '84' },
  { label: "8'", value: '96' },
  { label: "9'", value: '108' },
  { label: 'Other', value: 'other' },
] as const;

export interface ExtensionForm {
  /** Weighed door, lb. Optional when the old springs' tag or color is known. */
  weight: string;
  heightChoice: string;
  heightOther: string;
  springsPerSide: 1 | 2;
  /** DASMA color of the old springs, or '' when not known. */
  oldColor: string;
  /** Pull printed on the old spring's tag, lb. */
  oldRating: string;
  /** Relaxed length of the old spring, coils only. */
  oldLength: string;
}

export const DEFAULT_EXTENSION_FORM: ExtensionForm = {
  weight: '',
  heightChoice: '84',
  heightOther: '',
  springsPerSide: 1,
  oldColor: '',
  oldRating: '',
  oldLength: '',
};

export function buildExtensionInput(form: ExtensionForm): { input?: ExtensionInput; missing: string[] } {
  const missing: string[] = [];
  const doorHeightIn = chosenNumber(form.heightChoice, form.heightOther);
  if (doorHeightIn === undefined) missing.push('Door height');
  const doorWeightLb = optionalMeasurement(form.weight);
  const ratingLb = optionalMeasurement(form.oldRating);
  const lengthIn = optionalMeasurement(form.oldLength);
  const color = (EXTENSION_COLORS as readonly string[]).includes(form.oldColor) ? (form.oldColor as ExtensionColor) : undefined;
  if (doorWeightLb === undefined && ratingLb === undefined && color === undefined) missing.push('Door weight, or the old springs’ tag or color');
  if (doorHeightIn === undefined || missing.length > 0) return { missing };
  const old = { ...(color ? { color } : {}), ...(ratingLb !== undefined ? { ratingLb } : {}), ...(lengthIn !== undefined ? { lengthIn } : {}) };
  return {
    missing,
    input: {
      doorHeightIn,
      springsPerSide: form.springsPerSide,
      ...(doorWeightLb !== undefined ? { doorWeightLb } : {}),
      ...(Object.keys(old).length > 0 ? { old } : {}),
    },
  };
}

export function runExtension(form: ExtensionForm): Outcome<ExtensionResult> {
  const { input, missing } = buildExtensionInput(form);
  if (!input) return { status: 'incomplete', missing };
  try {
    return { status: 'ok', result: extensionSprings(input) };
  } catch (e) {
    return { status: 'error', message: errorMessage(e) };
  }
}

// ---------------------------------------------------------------------------
// Drums and cables: standard, high and vertical lift
// ---------------------------------------------------------------------------

export const LIFT_CHOICES: { label: string; value: LiftType }[] = [
  { label: 'Standard', value: 'standard' },
  { label: 'High lift', value: 'high' },
  { label: 'Vertical', value: 'vertical' },
];

export interface DrumsForm {
  lift: LiftType;
  weight: string;
  heightChoice: string;
  heightOther: string;
  /** How far the track runs straight up past the door before it curves, inches. */
  highLift: string;
  shaftHeight: string;
  springCount: 1 | 2;
  targetCycles: number;
  ids: number[];
}

export const DEFAULT_DRUMS_FORM: DrumsForm = {
  lift: 'high',
  weight: '',
  heightChoice: '84',
  heightOther: '',
  highLift: '',
  shaftHeight: '',
  springCount: 2,
  targetCycles: 10_000,
  ids: [2],
};

export interface DrumsResult {
  lift: LiftType;
  fits: DrumFit[];
  /** Turns, rate and springs, for high lift on D400-54 drums. */
  highLift?: HighLiftResult;
  /** Why there are no turns for this door, when there aren't. */
  noTurns?: string;
}

export function runDrums(form: DrumsForm): Outcome<DrumsResult> {
  const missing: string[] = [];
  const doorHeightIn = chosenNumber(form.heightChoice, form.heightOther);
  if (doorHeightIn === undefined) missing.push('Door height');
  const highLiftIn = parseMeasurement(form.highLift);
  if (form.lift === 'high' && highLiftIn === undefined) missing.push('High lift');
  const doorWeightLb = optionalMeasurement(form.weight);
  if (form.lift === 'high' && doorWeightLb === undefined) missing.push('Door weight');
  if (form.lift === 'high' && form.ids.length === 0) missing.push('Inside diameter');
  if (missing.length > 0 || doorHeightIn === undefined) return { status: 'incomplete', missing };
  const floorToShaftCenterIn = optionalMeasurement(form.shaftHeight);
  try {
    const fits = drumsThatFit({
      lift: form.lift,
      doorHeightIn,
      ...(doorWeightLb !== undefined ? { doorWeightLb } : {}),
      ...(highLiftIn !== undefined ? { highLiftIn } : {}),
      ...(floorToShaftCenterIn !== undefined ? { floorToShaftCenterIn } : {}),
    });
    if (form.lift === 'vertical') return { status: 'ok', result: { lift: form.lift, fits, noTurns: "Vertical-lift turns come from the drum maker's chart, which the app doesn't have yet." } };
    if (form.lift === 'standard') return { status: 'ok', result: { lift: form.lift, fits, noTurns: 'For turns and springs on 4" drums, use Size from door.' } };
    const d400 = fits.find((f) => f.drum.model === 'D400-54');
    let noTurns: string | undefined;
    let highLift: HighLiftResult | undefined;
    if (!d400?.fits) noTurns = `The D400-54 ${d400?.reason ?? "doesn't fit"}. Turns for bigger high-lift drums come from the drum maker's chart.`;
    else {
      try {
        highLift = highLiftD400_54({
          doorHeightIn,
          highLiftIn: highLiftIn!,
          doorWeightLb: doorWeightLb!,
          springCount: form.springCount,
          targetCycles: form.targetCycles,
          insideDiametersIn: [...form.ids].sort((a, b) => a - b),
          ...(floorToShaftCenterIn !== undefined ? { floorToShaftCenterIn } : {}),
        });
      } catch (e) {
        noTurns = errorMessage(e);
      }
    }
    return { status: 'ok', result: { lift: form.lift, fits, ...(highLift ? { highLift } : {}), ...(noTurns ? { noTurns } : {}) } };
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
