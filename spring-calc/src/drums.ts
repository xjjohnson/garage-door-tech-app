/**
 * Cable drums beyond the two standard-lift drums the torsion calculator
 * uses: which drum fits a door, how long to cut the cables, and turns and
 * rate for high-lift doors.
 *
 * Source for everything here: Canimex (Torque Force), "Cable Drum and
 * Torsion Spring Manual" / Torque Force Reference Guide, hosted by Action
 * Direct (shopactiondirect.com/content/manuals/Cable-Drum-Catalog.pdf), read
 * November 2026. Its formulas:
 *   Turns = HMA / Multiplier        IPPT (the spring set) = Multiplier x Door weight
 * where HMA is the drum's high moment arm. The high-lift formulas are for 15"
 * radius track.
 */
import type { SpringSpec, Warning } from './calculator';
import { DEFAULT_DEAD_COILS, LIFE_POINTS, WIRES, WireSize } from './data';
import { allowableTorqueForCycles, estimateLife, ippt, lengthForIppt, roundLength, springIndex, springWeightLb, windingGrowth } from './springMath';

export type LiftType = 'standard' | 'high' | 'vertical';

export interface CanimexDrum {
  model: string;
  lift: LiftType;
  /** Standard and vertical lift: tallest door. High lift: see flatCapacityIn. */
  maxDoorHeightIn?: number;
  /** High lift: cable the flat part holds. Door height minus high lift must not exceed it. */
  flatCapacityIn?: number;
  /** High lift: most high lift the drum takes, inches. */
  maxHighLiftIn?: number;
  /** Most load on one drum, lb (half the door on a two-drum door). */
  maxLoadLb: number;
  /** Cable length = attachment point to shaft center + this (cable with buttons), minus the high lift on a high-lift drum. */
  cableAllowanceIn?: number;
  /** The same with an adjustable cable anchor, where Canimex lists one. */
  cableAllowanceAnchorIn?: number;
  maxCable: string;
  /** Common name, where the drum has one (D400-96 is the 400-8). */
  aka?: string;
}

/**
 * Canimex drums. Standard lift: classification table p. 4, specs pp. 8-11.
 * High lift: p. 4 and pp. 24-27. Vertical lift: summary table p. 4 only
 * (the manual's vertical-lift charts weren't readable, so no turns for them).
 * Where the manual disagrees with itself (D575-120 and D800-120 list 118 and
 * 119" of high lift on p. 4 but 120 in the specs) the lower figure is kept.
 */
export const CANIMEX_DRUMS: readonly CanimexDrum[] = [
  { model: 'D300-112', lift: 'standard', maxDoorHeightIn: 113, maxLoadLb: 350, cableAllowanceIn: 5, maxCable: '1/8"' },
  { model: 'D300-144', lift: 'standard', maxDoorHeightIn: 145, maxLoadLb: 350, cableAllowanceIn: 5, maxCable: '1/8"' },
  { model: 'D400-96', lift: 'standard', maxDoorHeightIn: 98, maxLoadLb: 265, cableAllowanceIn: 8, cableAllowanceAnchorIn: 14, maxCable: '1/8"', aka: '400-8' },
  { model: 'D400-123', lift: 'standard', maxDoorHeightIn: 125, maxLoadLb: 375, cableAllowanceIn: 8, cableAllowanceAnchorIn: 14, maxCable: '5/32"' },
  { model: 'D400-144', lift: 'standard', maxDoorHeightIn: 148, maxLoadLb: 375, cableAllowanceIn: 8, cableAllowanceAnchorIn: 14, maxCable: '5/32"', aka: '400-12' },
  { model: 'D525-216', lift: 'standard', maxDoorHeightIn: 231, maxLoadLb: 750, cableAllowanceIn: 10, cableAllowanceAnchorIn: 18, maxCable: '3/16"' },
  { model: 'D800-384', lift: 'standard', maxDoorHeightIn: 389, maxLoadLb: 1100, cableAllowanceIn: 14, cableAllowanceAnchorIn: 29, maxCable: '1/4"' },
  { model: 'D400-54', lift: 'high', flatCapacityIn: 121, maxHighLiftIn: 54, maxLoadLb: 275, cableAllowanceIn: 63, cableAllowanceAnchorIn: 72, maxCable: '5/32"' },
  { model: 'D525-54', lift: 'high', flatCapacityIn: 179, maxHighLiftIn: 54, maxLoadLb: 500, cableAllowanceIn: 66, cableAllowanceAnchorIn: 75, maxCable: '3/16"' },
  { model: 'D575-120', lift: 'high', flatCapacityIn: 145, maxHighLiftIn: 118, maxLoadLb: 500, cableAllowanceIn: 133, cableAllowanceAnchorIn: 144, maxCable: '3/16"' },
  { model: 'D6375-164', lift: 'high', flatCapacityIn: 229, maxHighLiftIn: 164, maxLoadLb: 800, cableAllowanceIn: 182, cableAllowanceAnchorIn: 195, maxCable: '1/4"' },
  { model: 'D800-120', lift: 'high', flatCapacityIn: 266, maxHighLiftIn: 119, maxLoadLb: 1100, cableAllowanceIn: 137, cableAllowanceAnchorIn: 150, maxCable: '1/4"' },
  { model: 'D850-132', lift: 'vertical', maxDoorHeightIn: 129, maxLoadLb: 425, maxCable: '3/16"' },
  { model: 'D1100-216', lift: 'vertical', maxDoorHeightIn: 218, maxLoadLb: 660, maxCable: '3/16"' },
  { model: 'D1350-336', lift: 'vertical', maxDoorHeightIn: 331, maxLoadLb: 1100, maxCable: '1/4"' },
];

export interface DrumFit {
  drum: CanimexDrum;
  fits: boolean;
  /** Why it doesn't fit, when it doesn't. */
  reason?: string;
  /** Each cable, cut with buttons, when the floor to shaft center was given. */
  cableLengthIn?: number;
}

/**
 * Which drums of a lift type hold this door: its height (and high lift)
 * within the drum's cable capacity, and half the door weight within the
 * drum's load rating.
 */
export function drumsThatFit(input: { lift: LiftType; doorHeightIn: number; doorWeightLb?: number; highLiftIn?: number; floorToShaftCenterIn?: number }): DrumFit[] {
  const highLift = input.lift === 'high' ? (input.highLiftIn ?? 0) : 0;
  return CANIMEX_DRUMS.filter((d) => d.lift === input.lift).map((drum): DrumFit => {
    let reason: string | undefined;
    if (drum.lift === 'high') {
      if (highLift > drum.maxHighLiftIn!) reason = `takes up to ${drum.maxHighLiftIn}" of high lift`;
      else if (input.doorHeightIn - highLift > drum.flatCapacityIn!) reason = `holds ${drum.flatCapacityIn}" of door below the high lift`;
    } else if (input.doorHeightIn > drum.maxDoorHeightIn!) {
      reason = `holds doors to ${drum.maxDoorHeightIn}"`;
    }
    if (!reason && input.doorWeightLb !== undefined && input.doorWeightLb / 2 > drum.maxLoadLb) {
      reason = `rated ${drum.maxLoadLb} lb a drum; this door puts ${Math.round(input.doorWeightLb / 2)} lb on each`;
    }
    const cable =
      input.floorToShaftCenterIn !== undefined && drum.cableAllowanceIn !== undefined ? input.floorToShaftCenterIn + drum.cableAllowanceIn - highLift : undefined;
    return { drum, fits: !reason, ...(reason ? { reason } : {}), ...(cable !== undefined ? { cableLengthIn: cable } : {}) };
  });
}

// ---------------------------------------------------------------------------
// Springs for a Canimex rate and torque
// ---------------------------------------------------------------------------

/**
 * Heavier wires on Canimex's 3.750" coil diameter chart (RCI3_75, hosted by
 * IDC Spring, idcspring.com, read November 2026), past the .295 the
 * residential list stops at. MIP is the chart's summary line at each life
 * point. Canimex prints K too, which the textbook rate reproduces (see the
 * tests). These have no DASMA color or 20-coil length, so they're kept off
 * the residential list and used only by the Canimex-chart sizing here.
 */
export const HEAVY_WIRES: readonly WireSize[] = [
  { nominal: '.297', diameterIn: 0.297, mipInLb: [581, 538, 486, 417, 359] },
  { nominal: '.306', diameterIn: 0.3065, mipInLb: [634, 588, 530, 455, 392] },
  { nominal: '.312', diameterIn: 0.3125, mipInLb: [669, 621, 560, 481, 414] },
  { nominal: '.319', diameterIn: 0.3195, mipInLb: [712, 660, 595, 511, 440] },
  { nominal: '.331', diameterIn: 0.331, mipInLb: [786, 729, 657, 564, 486] },
];

/** Inside diameters for commercial work: the residential ones plus 3-3/4". */
export const COMMERCIAL_IDS_IN = [1.75, 2.0, 2.625, 3.75] as const;

/**
 * Springs that give a rate and carry a full-wind torque for a cycle target,
 * lightest first. Canimex's IPPT matches the textbook rate (see STEEL in
 * data.ts) and its torque is already taken at the high moment arm, so life
 * is rated on that torque as is.
 */
export function canimexSpringOptions(input: {
  ipptPerSpring: number;
  torquePerSpringInLb: number;
  turns: number;
  targetCycles: number;
  insideDiametersIn: readonly number[];
  heavyWires?: boolean;
  maxLengthIn?: number;
}): SpringSpec[] {
  const deadCoils = DEFAULT_DEAD_COILS;
  const wires = input.heavyWires ? [...WIRES, ...HEAVY_WIRES] : WIRES;
  const maxLength = input.maxLengthIn ?? 50;
  const options: SpringSpec[] = [];
  for (const id of input.insideDiametersIn) {
    for (const w of wires) {
      if (springIndex(w.diameterIn, id) < 8) continue;
      if (allowableTorqueForCycles(w, id, input.targetCycles) < input.torquePerSpringInLb) continue;
      const lengthIn = roundLength(lengthForIppt(w.diameterIn, id, input.ipptPerSpring, deadCoils));
      if (lengthIn <= (deadCoils + 1) * w.diameterIn || lengthIn > maxLength) continue;
      const life = estimateLife(w, id, input.torquePerSpringInLb);
      if (life.belowMinimum || life.cycles < input.targetCycles) continue;
      options.push({
        wire: w.nominal,
        wireIn: w.diameterIn,
        insideDiameterIn: id,
        lengthIn,
        ippt: ippt(w.diameterIn, id, lengthIn, deadCoils),
        life,
        makerChartLife: life,
        growthIn: windingGrowth(w.diameterIn, input.turns),
        weightLb: springWeightLb(w.diameterIn, id, lengthIn),
      });
    }
  }
  return options.sort((a, b) => a.weightLb - b.weightLb);
}

// ---------------------------------------------------------------------------
// Heavy sectional on D525-216 drums (standard lift)
// ---------------------------------------------------------------------------

/** D525-216 high moment arm, inches (Canimex manual, standard-lift specs). */
export const D525_216_HMA_IN = 2.936;

/**
 * Canimex's D525-216 standard-lift multiplier table: [door height in inches,
 * 12" track, 15" track], every 3" from 6' to 19'3". Printed turns equal
 * HMA / multiplier to 0.1 on every row (see the tests).
 */
export const D525_216_CHART: readonly (readonly [number, number, number])[] = [
  [72, 0.5712, 0.5443], [75, 0.5532, 0.5284], [78, 0.5362, 0.5133], [81, 0.5201, 0.4989], [84, 0.505, 0.4852],
  [87, 0.4906, 0.4722], [90, 0.477, 0.4598], [93, 0.4641, 0.448], [96, 0.4519, 0.4368], [99, 0.4403, 0.4261],
  [102, 0.4292, 0.4158], [105, 0.4187, 0.4061], [108, 0.4087, 0.3967], [111, 0.3991, 0.3878], [114, 0.3899, 0.3792],
  [117, 0.3812, 0.371], [120, 0.3728, 0.3631], [123, 0.3648, 0.3556], [126, 0.3571, 0.3483], [129, 0.3497, 0.3414],
  [132, 0.3427, 0.3347], [135, 0.3359, 0.3282], [138, 0.3293, 0.322], [141, 0.323, 0.316], [144, 0.317, 0.3102],
  [147, 0.3111, 0.3047], [150, 0.3055, 0.2993], [153, 0.3001, 0.2941], [156, 0.2948, 0.2891], [159, 0.2897, 0.2842],
  [162, 0.2848, 0.2795], [165, 0.2801, 0.275], [168, 0.2755, 0.2706], [171, 0.2711, 0.2663], [174, 0.2668, 0.2622],
  [177, 0.2626, 0.2582], [180, 0.2586, 0.2543], [183, 0.2547, 0.2505], [186, 0.2509, 0.2468], [189, 0.2472, 0.2433],
  [192, 0.2436, 0.2398], [195, 0.2401, 0.2365], [198, 0.2367, 0.2332], [201, 0.2334, 0.23], [204, 0.2302, 0.2269],
  [207, 0.2271, 0.2239], [210, 0.2241, 0.2209], [213, 0.2212, 0.2181], [216, 0.2183, 0.2153], [219, 0.2155, 0.2126],
  [222, 0.2127, 0.2099], [225, 0.2101, 0.2073], [228, 0.2075, 0.2048], [231, 0.2049, 0.2023],
];

export interface HeavySectionalInput {
  doorHeightIn: number;
  doorWeightLb: number;
  trackRadiusIn: 12 | 15;
  /** Springs on the shaft; heavy doors often run four. */
  springCount: 1 | 2 | 4;
  targetCycles?: number;
  insideDiametersIn?: number[];
  floorToShaftCenterIn?: number;
}

/** Turns, rate and springs for a heavy standard-lift door on D525-216 drums, from Canimex's table. */
export function heavySectionalD525_216(input: HeavySectionalInput): HighLiftResult {
  const warnings: Warning[] = [];
  const drum = CANIMEX_DRUMS.find((d) => d.model === 'D525-216')!;
  if (!(input.doorWeightLb >= 100 && input.doorWeightLb <= 2000)) throw new RangeError('Door weight must be between 100 and 2,000 lb.');
  const heights = D525_216_CHART.map((r) => r[0]);
  if (input.doorHeightIn < 72 || input.doorHeightIn > 231) throw new RangeError("The D525-216 chart covers doors 6' to 19'3\" tall.");
  if (input.floorToShaftCenterIn !== undefined && input.floorToShaftCenterIn <= input.doorHeightIn) {
    throw new RangeError('Floor to shaft center must be more than the door height. Measure to the middle of the torsion shaft.');
  }
  const { i, t } = bracket(heights, input.doorHeightIn);
  const col = input.trackRadiusIn === 12 ? 1 : 2;
  const a = D525_216_CHART[i]!;
  const b = D525_216_CHART[i + 1] ?? a;
  const multiplier = lerp(a[col] as number, b[col] as number, t);
  const exact = D525_216_HMA_IN / multiplier;
  if (input.doorWeightLb / 2 > drum.maxLoadLb) {
    warnings.push({ level: 'stop', message: `D525-216 drums are rated ${drum.maxLoadLb} lb each; this door puts ${Math.round(input.doorWeightLb / 2)} lb on each. Use D800-384 drums and the maker's chart.` });
  }
  const ipptPerSpring = (multiplier * input.doorWeightLb) / input.springCount;
  const torque = (input.doorWeightLb * D525_216_HMA_IN) / input.springCount;
  const turns = Math.floor(exact * 4) / 4;
  const target = input.targetCycles ?? LIFE_POINTS[0];
  const options = canimexSpringOptions({
    ipptPerSpring,
    torquePerSpringInLb: torque,
    turns: exact,
    targetCycles: target,
    insideDiametersIn: input.insideDiametersIn ?? [2.625, 3.75],
    heavyWires: true,
    maxLengthIn: 60,
  });
  if (options.length === 0) {
    warnings.push({ level: 'stop', message: input.springCount === 4 ? 'No set of four in the supported range (to .331 wire) fits. Use the spring maker\'s chart.' : 'No spring in the supported range (to .331 wire) fits at this count. Try more springs on the shaft.' });
  }
  warnings.push({ level: 'info', message: `Start at ${turns} turns (Canimex: ${exact.toFixed(1)}), then check balance and adjust a quarter turn at a time.` });
  const cableLengthIn = input.floorToShaftCenterIn !== undefined ? input.floorToShaftCenterIn + drum.cableAllowanceIn! : undefined;
  return {
    turns,
    exactTurns: exact,
    multiplier,
    ipptPerSpring,
    torquePerSpringInLb: torque,
    options: options.slice(0, 8),
    ...(cableLengthIn !== undefined ? { cableLengthIn } : {}),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// High lift on the D400-54
// ---------------------------------------------------------------------------

/** Door heights of the D400-54 multiplier chart, inches. */
export const D400_54_HEIGHTS_IN = [72, 78, 84, 90, 96, 102, 108, 114, 120] as const;

/**
 * The D400-54 multiplier chart (Canimex manual p. 28), 15" radius track:
 * one row per 3" of high lift, [high lift, HMA, multipliers by door height].
 * The manual's 45" row stops at 7'6", so it holds four values. The printed
 * turns equal HMA / multiplier to 0.1 on every row (see the tests).
 */
export const D400_54_CHART: readonly (readonly [number, number, readonly number[]])[] = [
  [0, 2.078, [0.3297, 0.3077, 0.2884, 0.2713, 0.2561, 0.2425, 0.2303, 0.2192, 0.2091]],
  [3, 2.1277, [0.3232, 0.3028, 0.2847, 0.2686, 0.2541, 0.2411, 0.2294, 0.2187, 0.209]],
  [6, 2.1763, [0.3168, 0.2979, 0.2811, 0.2659, 0.2522, 0.2398, 0.2285, 0.2182, 0.2088]],
  [9, 2.2238, [0.3104, 0.2931, 0.2775, 0.2632, 0.2503, 0.2384, 0.2276, 0.2177, 0.2086]],
  [12, 2.2704, [0.304, 0.2884, 0.2739, 0.2606, 0.2483, 0.2371, 0.2267, 0.2172, 0.2084]],
  [15, 2.316, [0.2977, 0.2836, 0.2703, 0.2579, 0.2464, 0.2357, 0.2259, 0.2167, 0.2082]],
  [18, 2.3607, [0.2914, 0.2789, 0.2668, 0.2553, 0.2445, 0.2344, 0.225, 0.2162, 0.208]],
  [21, 2.4046, [0.2851, 0.2741, 0.2632, 0.2526, 0.2426, 0.2331, 0.2241, 0.2157, 0.2078]],
  [24, 2.4477, [0.2787, 0.2693, 0.2596, 0.25, 0.2407, 0.2317, 0.2232, 0.2151, 0.2075]],
  [27, 2.49, [0.2723, 0.2645, 0.256, 0.2473, 0.2387, 0.2304, 0.2223, 0.2146, 0.2073]],
  [30, 2.5317, [0.2659, 0.2597, 0.2524, 0.2447, 0.2368, 0.229, 0.2214, 0.2141, 0.2071]],
  [33, 2.5726, [0.2594, 0.2548, 0.2488, 0.242, 0.2348, 0.2276, 0.2205, 0.2135, 0.2068]],
  [36, 2.613, [0.2527, 0.2499, 0.2451, 0.2393, 0.2329, 0.2262, 0.2196, 0.213, 0.2066]],
  [39, 2.6527, [0.246, 0.2449, 0.2414, 0.2365, 0.2309, 0.2248, 0.2186, 0.2124, 0.2063]],
  [42, 2.6918, [0.2392, 0.2398, 0.2376, 0.2337, 0.2288, 0.2234, 0.2177, 0.2119, 0.2061]],
  [45, 2.7304, [0.2322, 0.2346, 0.2337, 0.2309]],
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Where x falls between neighbouring entries of a sorted list. (Returns an
 * object, not a tuple: destructuring a tuple pulls in a Babel runtime helper
 * that this folder can't resolve from the app's bundle.)
 */
function bracket(xs: readonly number[], x: number): { i: number; t: number } {
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i]!;
    const b = xs[i + 1]!;
    if (x >= a && x <= b) return { i, t: b === a ? 0 : (x - a) / (b - a) };
  }
  throw new RangeError('Outside the chart.');
}

/**
 * Multiplier and HMA for a door on the D400-54, interpolated between chart
 * rows and columns. Throws outside the chart: 6' to 10' doors, 0 to 42" of
 * high lift (45" up to 7'6").
 */
export function d400_54(doorHeightIn: number, highLiftIn: number): { multiplier: number; hmaIn: number; turns: number } {
  const heights: readonly number[] = D400_54_HEIGHTS_IN;
  if (doorHeightIn < 72 || doorHeightIn > 120) throw new RangeError("The D400-54 chart covers doors 6' to 10' tall.");
  const lifts = D400_54_CHART.map((r) => r[0]);
  const maxLift = doorHeightIn <= 90 ? 45 : 42;
  if (highLiftIn < 0 || highLiftIn > maxLift) throw new RangeError(`The D400-54 chart covers up to ${maxLift}" of high lift on this door height.`);
  const { i: hi, t: ht } = bracket(heights, doorHeightIn);
  const { i: li, t: lt } = bracket(lifts, highLiftIn);
  const rowA = D400_54_CHART[li]!;
  const rowB = D400_54_CHART[li + 1] ?? rowA;
  const m = (row: (typeof D400_54_CHART)[number]) => {
    const a = row[2][hi];
    const b = row[2][hi + 1] ?? a;
    if (a === undefined || b === undefined) throw new RangeError('Outside the chart.');
    return lerp(a, b, ht);
  };
  const multiplier = lerp(m(rowA), m(rowB), lt);
  const hmaIn = lerp(rowA[1], rowB[1], lt);
  return { multiplier, hmaIn, turns: hmaIn / multiplier };
}

export interface HighLiftInput {
  doorHeightIn: number;
  highLiftIn: number;
  doorWeightLb: number;
  springCount: 1 | 2;
  targetCycles?: number;
  insideDiametersIn?: number[];
  floorToShaftCenterIn?: number;
}

export interface HighLiftResult {
  /** Turns to wind, rounded down to a quarter. */
  turns: number;
  /** Canimex's turns before rounding. */
  exactTurns: number;
  multiplier: number;
  ipptPerSpring: number;
  /** Torque each spring carries at full wind (door weight x HMA / springs), in-lb. */
  torquePerSpringInLb: number;
  /** Springs that give the rate and meet the cycle target, lightest first. */
  options: SpringSpec[];
  cableLengthIn?: number;
  warnings: Warning[];
}

/** Turns, rate and spring options for a high-lift door on D400-54 drums (Canimex chart, 15" track). */
export function highLiftD400_54(input: HighLiftInput): HighLiftResult {
  const warnings: Warning[] = [];
  if (!(input.doorWeightLb >= 30 && input.doorWeightLb <= 1000)) throw new RangeError('Door weight must be between 30 and 1,000 lb.');
  const drum = CANIMEX_DRUMS.find((d) => d.model === 'D400-54')!;
  if (input.doorHeightIn - input.highLiftIn > drum.flatCapacityIn!) throw new RangeError(`D400-54 drums hold ${drum.flatCapacityIn}" of door below the high lift.`);
  const { multiplier, hmaIn, turns: exact } = d400_54(input.doorHeightIn, input.highLiftIn);
  if (input.doorWeightLb / 2 > drum.maxLoadLb) {
    warnings.push({ level: 'stop', message: `D400-54 drums are rated ${drum.maxLoadLb} lb each; this door puts ${Math.round(input.doorWeightLb / 2)} lb on each. Use D525-54 drums.` });
  }
  const ipptPerSpring = (multiplier * input.doorWeightLb) / input.springCount;
  const torque = (input.doorWeightLb * hmaIn) / input.springCount;
  const turns = Math.floor(exact * 4) / 4;
  const target = input.targetCycles ?? LIFE_POINTS[0];
  const options = canimexSpringOptions({ ipptPerSpring, torquePerSpringInLb: torque, turns: exact, targetCycles: target, insideDiametersIn: input.insideDiametersIn ?? [2] });
  if (options.length === 0) {
    warnings.push({ level: 'stop', message: input.springCount === 1 ? 'No single spring in the supported range fits. Try a pair.' : 'No spring pair in the supported range fits. Try a larger inside diameter.' });
  }
  warnings.push({ level: 'info', message: `Start at ${turns} turns (Canimex: ${exact.toFixed(1)}), then check balance and adjust a quarter turn at a time.` });
  warnings.push({ level: 'caution', message: 'Canimex charts high lift on 15" radius track. On other track, check the drum maker’s chart.' });

  const cableLengthIn = input.floorToShaftCenterIn !== undefined ? input.floorToShaftCenterIn + drum.cableAllowanceIn! - input.highLiftIn : undefined;
  if (input.floorToShaftCenterIn !== undefined && input.floorToShaftCenterIn <= input.doorHeightIn) {
    throw new RangeError('Floor to shaft center must be more than the door height. Measure to the middle of the torsion shaft.');
  }

  return {
    turns,
    exactTurns: exact,
    multiplier,
    ipptPerSpring,
    torquePerSpringInLb: torque,
    options: options.slice(0, 8),
    ...(cableLengthIn !== undefined ? { cableLengthIn } : {}),
    warnings,
  };
}
