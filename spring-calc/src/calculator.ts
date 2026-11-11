/**
 * The two calculator modes the app screens call:
 *   1. matchOldSpring  - measure the broken spring, get its rate, an equal
 *                        replacement and a longer-life upgrade.
 *   2. sizeFromDoor    - enter the door, get spring options.
 *
 * Both return plain objects plus a list of warnings. The screen must show
 * every warning; none of them is optional reading.
 */
import {
  COMMON_IDS_IN,
  DEFAULT_DEAD_COILS,
  DEFAULT_TRACK_RADIUS,
  DRUMS,
  DrumId,
  LIFE_POINTS,
  LIFE_SERVICE_FACTOR,
  RATE_FACTOR_LOW,
  RATE_FACTOR_MID,
  TrackRadius,
  WIRES,
  WireSize,
} from './data';
import {
  allowableTorqueForCycles,
  balancedWeight,
  cableLengthIn,
  doorTorque,
  estimateLife,
  findWire,
  heightForTurns,
  ippt,
  lengthForIppt,
  LifeEstimate,
  roundLength,
  springIndex,
  springWeightLb,
  standardLiftTurns,
  trackRadiusFactor,
  windingGrowth,
  wireFromCaliper,
  wireFromTwentyCoils,
} from './springMath';

export type Wind = 'left' | 'right' | 'unknown';

/** One spring the app can recommend or describe. */
export interface SpringSpec {
  wire: string; // nominal, e.g. ".225"
  wireIn: number;
  insideDiameterIn: number;
  lengthIn: number;
  ippt: number;
  /**
   * Conservative cycle life, matching DDM's published ratings (see
   * LIFE_SERVICE_FACTOR in data.ts). Use this one for recommendations.
   */
  life: LifeEstimate;
  /** Cycle life straight from the Canimex chart: the optimistic end. */
  makerChartLife: LifeEstimate;
  /** How much longer it gets at full wind, inches. */
  growthIn: number;
  weightLb: number;
}

export interface Warning {
  level: 'stop' | 'caution' | 'info';
  message: string;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const MIN_SPRING_INDEX = 6;
const LOW_SPRING_INDEX = 8;

/**
 * Torque one spring carries at full wind, door closed, for rating its life.
 * `maker` is the Canimex-chart view; `conservative` is the DDM-style view
 * (see LIFE_SERVICE_FACTOR and RATE_FACTOR_LOW in data.ts).
 */
interface LifeTorque {
  maker: number;
  conservative: number;
}

function describe(wire: WireSize, insideDiameterIn: number, lengthIn: number, lt: LifeTorque, turns: number, deadCoils: number): SpringSpec {
  return {
    wire: wire.nominal,
    wireIn: wire.diameterIn,
    insideDiameterIn,
    lengthIn,
    ippt: ippt(wire.diameterIn, insideDiameterIn, lengthIn, deadCoils),
    life: estimateLife(wire, insideDiameterIn, lt.conservative),
    makerChartLife: estimateLife(wire, insideDiameterIn, lt.maker),
    growthIn: windingGrowth(wire.diameterIn, turns),
    weightLb: springWeightLb(wire.diameterIn, insideDiameterIn, lengthIn),
  };
}

function indexWarnings(wire: WireSize, insideDiameterIn: number): Warning[] {
  const c = springIndex(wire.diameterIn, insideDiameterIn);
  if (c < MIN_SPRING_INDEX) {
    return [{ level: 'stop', message: `Wire ${wire.nominal} on a ${insideDiameterIn}" ID is coiled too tightly (index ${c.toFixed(1)}). Check the measurements.` }];
  }
  if (c < LOW_SPRING_INDEX) {
    return [{ level: 'caution', message: `Wire ${wire.nominal} on a ${insideDiameterIn}" ID has a low spring index (${c.toFixed(1)}); life figures are less certain.` }];
  }
  return [];
}

/**
 * Same-rate spring on another wire or inside diameter, or undefined when it
 * would be overstressed, too tightly coiled, or longer than the shaft allows.
 */
function equivalentOn(
  wire: WireSize,
  insideDiameterIn: number,
  targetIppt: number,
  lt: LifeTorque,
  turns: number,
  deadCoils: number,
  lengthIncrementIn: number,
  maxLengthIn?: number,
): SpringSpec | undefined {
  if (springIndex(wire.diameterIn, insideDiameterIn) < LOW_SPRING_INDEX) return undefined;
  const length = roundLength(lengthForIppt(wire.diameterIn, insideDiameterIn, targetIppt, deadCoils), lengthIncrementIn);
  if (length <= (deadCoils + 1) * wire.diameterIn) return undefined;
  if (maxLengthIn !== undefined && length + windingGrowth(wire.diameterIn, turns) > maxLengthIn) return undefined;
  const spec = describe(wire, insideDiameterIn, length, lt, turns, deadCoils);
  if (spec.life.belowMinimum) return undefined;
  return spec;
}

/**
 * Cable length for each lift cable, or undefined when the tech didn't
 * measure floor to shaft center. The shaft has to sit above the door.
 */
function resolveCable(floorToShaftCenterIn: number | undefined, doorHeightIn: number | undefined, drum: DrumId): number | undefined {
  if (floorToShaftCenterIn === undefined) return undefined;
  if (doorHeightIn !== undefined && floorToShaftCenterIn <= doorHeightIn) {
    throw new RangeError('Floor to shaft center must be more than the door height. Measure to the middle of the torsion shaft.');
  }
  return cableLengthIn(floorToShaftCenterIn, drum);
}

function resolveTurns(input: { doorHeightIn?: number; drum: DrumId; turns?: number }, warnings: Warning[]): number {
  if (input.turns !== undefined) {
    if (input.turns <= 0 || input.turns > 20) throw new RangeError('Turns must be between 0 and 20.');
    warnings.push({ level: 'info', message: `Using ${input.turns} turns as entered.` });
    return input.turns;
  }
  if (input.doorHeightIn === undefined) throw new RangeError('Enter the door height or the number of turns.');
  return standardLiftTurns(input.doorHeightIn, input.drum);
}

// ---------------------------------------------------------------------------
// Mode 1: match the old spring
// ---------------------------------------------------------------------------

export interface MatchInput {
  /** Wire by caliper reading, or by the length of 20 coils. One is required. */
  wireIn?: number;
  twentyCoilIn?: number;
  insideDiameterIn: number;
  /** Relaxed (unwound) length of the coils only, without the cones. */
  lengthIn: number;
  wind: Wind;
  springCount: 1 | 2;
  /** Door height (for turns), or `turns` directly for a non-standard door. */
  doorHeightIn?: number;
  turns?: number;
  drum?: DrumId;
  /** Cycle targets for the upgrade options. Default 25,000 and 50,000. */
  upgradeTargets?: number[];
  /** Free shaft length per spring, if the tech measured it. */
  maxLengthIn?: number;
  /** Floor to the center of the torsion shaft, for the cable length. */
  floorToShaftCenterIn?: number;
  /** Track radius, 12" or 15". Default 15" (see DEFAULT_TRACK_RADIUS). */
  trackRadiusIn?: TrackRadius;
  deadCoils?: number;
  lengthIncrementIn?: number;
}

export interface UpgradeOption {
  targetCycles: number;
  spring: SpringSpec;
}

export interface MatchResult {
  old: SpringSpec & { wind: Wind; wireColor?: string };
  springCount: 1 | 2;
  totalIppt: number;
  turns: number;
  /**
   * Door weight range these springs balance at `turns`, pounds (see
   * RATE_FACTOR_LOW). On 12" track both ends are about 4% lower.
   */
  balancesDoorLb: { low: number; high: number };
  trackRadiusIn: TrackRadius;
  /** Same rate in the other common inside diameters and neighbouring wires. */
  equivalents: SpringSpec[];
  upgrades: UpgradeOption[];
  /** Length of each lift cable, when floor to shaft center was entered. */
  cableLengthIn?: number;
  warnings: Warning[];
}

export function matchOldSpring(input: MatchInput): MatchResult {
  const warnings: Warning[] = [];
  const drum = input.drum ?? '400-8';
  const deadCoils = input.deadCoils ?? DEFAULT_DEAD_COILS;
  const inc = input.lengthIncrementIn ?? 0.5;
  const track = input.trackRadiusIn ?? DEFAULT_TRACK_RADIUS;

  // 1. Identify the wire.
  let wire: WireSize | undefined;
  if (input.wireIn !== undefined) {
    wire = wireFromCaliper(input.wireIn);
    if (!wire) throw new RangeError(`No supported wire size is within 0.003" of ${input.wireIn}". Measure again.`);
  } else if (input.twentyCoilIn !== undefined) {
    const m = wireFromTwentyCoils(input.twentyCoilIn);
    if (!m) throw new RangeError(`${input.twentyCoilIn}" for 20 coils doesn't match a supported wire. Measure again, or use a caliper.`);
    wire = m.wire;
    if (m.ambiguous && m.runnerUp) {
      warnings.push({ level: 'stop', message: `20 coils at ${input.twentyCoilIn}" is between ${m.wire.nominal} and ${m.runnerUp.nominal}. Measure 20 coils again or use a caliper before ordering.` });
    }
  } else {
    throw new RangeError('Enter the wire size or the length of 20 coils.');
  }

  if (input.insideDiameterIn < 1 || input.insideDiameterIn > 6) throw new RangeError('Inside diameter must be between 1" and 6".');
  if (input.lengthIn < 6 || input.lengthIn > 60) throw new RangeError('Spring length must be between 6" and 60".');
  warnings.push(...indexWarnings(wire, input.insideDiameterIn));

  // 2. Rate of the old spring, the turns, and the torque the door needs.
  const turns = resolveTurns({ doorHeightIn: input.doorHeightIn, drum, turns: input.turns }, warnings);
  const cable = resolveCable(input.floorToShaftCenterIn, input.doorHeightIn, drum);
  // Track radius changes how much door the springs lift at these turns, not
  // the stress in the old spring, so it only touches balancesDoorLb.
  const trackFactor = trackRadiusFactor(track, drum, input.doorHeightIn ?? heightForTurns(turns, drum));
  const oldIppt = ippt(wire.diameterIn, input.insideDiameterIn, input.lengthIn, deadCoils);
  const torque = oldIppt * turns; // per spring, door closed, full wind, by the textbook rate
  // DDM-consistent view: DDM's springs lift about RATE_FACTOR_LOW of the
  // textbook rate, and DDM rates life at LIFE_SERVICE_FACTOR x that torque.
  const lt: LifeTorque = { maker: torque, conservative: torque * RATE_FACTOR_LOW * LIFE_SERVICE_FACTOR };
  const old = { ...describe(wire, input.insideDiameterIn, input.lengthIn, lt, turns, deadCoils), wind: input.wind, wireColor: wire.color };
  if (old.life.belowMinimum) {
    warnings.push({ level: 'caution', message: 'At this many turns the old spring was overstressed (under 10,000 cycles). It may have been the wrong spring for the door. Weigh the door before choosing a replacement.' });
  }
  const totalIppt = oldIppt * input.springCount;

  // 3. Equivalents: same IPPT, same or neighbouring wire, any common ID.
  const wireIdx = WIRES.indexOf(wire);
  const nearbyWires = WIRES.slice(Math.max(0, wireIdx - 1), wireIdx + 2);
  const equivalents: SpringSpec[] = [];
  for (const id of new Set<number>([input.insideDiameterIn, ...COMMON_IDS_IN])) {
    for (const w of nearbyWires) {
      if (w === wire && id === input.insideDiameterIn) continue; // that's the old spring itself
      const spec = equivalentOn(w, id, oldIppt, lt, turns, deadCoils, inc, input.maxLengthIn);
      // An equivalent should not wear out sooner than the original.
      if (spec && (old.life.belowMinimum || spec.life.cycles >= old.life.cycles)) equivalents.push(spec);
    }
  }
  equivalents.sort((a, b) => Math.abs(a.ippt - oldIppt) - Math.abs(b.ippt - oldIppt));

  // 4. Upgrades: smallest heavier wire, same ID, that meets each cycle target.
  const upgrades: UpgradeOption[] = [];
  for (const target of input.upgradeTargets ?? [25_000, 50_000]) {
    if (target <= old.life.cycles && !old.life.belowMinimum) continue; // already there
    for (const w of WIRES) {
      if (w.diameterIn < wire.diameterIn) continue;
      if (allowableTorqueForCycles(w, input.insideDiameterIn, target) < lt.conservative) continue;
      const spec = equivalentOn(w, input.insideDiameterIn, oldIppt, lt, turns, deadCoils, inc, input.maxLengthIn);
      if (spec && spec.life.cycles >= target) {
        upgrades.push({ targetCycles: target, spring: spec });
        break;
      }
    }
  }
  if (upgrades.length < (input.upgradeTargets ?? [25_000, 50_000]).length && input.maxLengthIn !== undefined) {
    warnings.push({ level: 'info', message: 'Some upgrades were left out because they would not fit the shaft length entered.' });
  }

  if (input.wind === 'unknown') {
    warnings.push({ level: 'caution', message: 'Wind direction not entered. Order the same wind as the old spring.' });
  }

  return {
    old,
    springCount: input.springCount,
    totalIppt,
    turns,
    balancesDoorLb: {
      low: balancedWeight(totalIppt, turns, drum) * RATE_FACTOR_LOW * trackFactor,
      high: balancedWeight(totalIppt, turns, drum) * trackFactor,
    },
    trackRadiusIn: track,
    equivalents: equivalents.slice(0, 6),
    upgrades,
    ...(cable !== undefined ? { cableLengthIn: cable } : {}),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Mode 2: size from the door
// ---------------------------------------------------------------------------

export interface DoorInput {
  doorWeightLb: number;
  doorHeightIn: number;
  drum: DrumId;
  springCount: 1 | 2;
  /** Minimum cycle life the tech wants. Default 10,000. */
  targetCycles?: number;
  /** Inside diameters to consider. Default 2". */
  insideDiametersIn?: number[];
  /** Free shaft length per spring, if measured. */
  maxLengthIn?: number;
  /** Floor to the center of the torsion shaft, for the cable length. */
  floorToShaftCenterIn?: number;
  /** Track radius, 12" or 15". Default 15" (see DEFAULT_TRACK_RADIUS). */
  trackRadiusIn?: TrackRadius;
  deadCoils?: number;
  lengthIncrementIn?: number;
}

export interface DoorResult {
  turns: number;
  /** Torque each spring supplies with the door closed, in-lb. */
  torquePerSpringInLb: number;
  /** IPPT each spring needs to balance the door, by the textbook formula. */
  ipptPerSpring: number;
  /**
   * Options that meet the cycle target, lightest first. balancesDoorLb is the
   * range of door weight the option balances at `turns`, across the published
   * sources (see RATE_FACTOR_LOW in data.ts), adjusted for the track radius.
   */
  options: (SpringSpec & { balancesDoorLb: { low: number; high: number } })[];
  trackRadiusIn: TrackRadius;
  /** Length of each lift cable, when floor to shaft center was entered. */
  cableLengthIn?: number;
  warnings: Warning[];
}

export function sizeFromDoor(input: DoorInput): DoorResult {
  const warnings: Warning[] = [];
  const deadCoils = input.deadCoils ?? DEFAULT_DEAD_COILS;
  const inc = input.lengthIncrementIn ?? 0.5;
  const target = input.targetCycles ?? LIFE_POINTS[0];
  const ids = input.insideDiametersIn ?? [2.0];
  const track = input.trackRadiusIn ?? DEFAULT_TRACK_RADIUS;

  if (input.doorWeightLb < 30 || input.doorWeightLb > 1000) throw new RangeError('Door weight must be between 30 and 1,000 lb.');
  if (input.doorHeightIn < 48) throw new RangeError('Door height must be at least 4\'.');

  const turns = standardLiftTurns(input.doorHeightIn, input.drum);
  const cable = resolveCable(input.floorToShaftCenterIn, input.doorHeightIn, input.drum);
  const torquePerSpring = doorTorque(input.doorWeightLb, input.drum) / input.springCount;
  const ipptPerSpring = torquePerSpring / turns;
  const lt: LifeTorque = { maker: torquePerSpring, conservative: torquePerSpring * LIFE_SERVICE_FACTOR };
  // On 12" track each turn lifts less door (Canimex winds fewer turns for the
  // same lift), so order a stronger spring. Full-wind torque, and so cycle
  // life, is the same on both radii.
  const trackFactor = trackRadiusFactor(track, input.drum, input.doorHeightIn);

  const options: DoorResult['options'] = [];
  for (const id of ids) {
    for (const w of WIRES) {
      if (allowableTorqueForCycles(w, id, target) < lt.conservative) continue;
      // Catalog IPPT to order, aiming the door at the middle of the sources' range.
      const catalogIppt = ipptPerSpring / (RATE_FACTOR_MID * trackFactor);
      const spec = equivalentOn(w, id, catalogIppt, lt, turns, deadCoils, inc, input.maxLengthIn);
      if (!spec || spec.life.cycles < target) continue;
      if (spec.lengthIn > 50) continue; // longer than any residential shaft side
      const high = balancedWeight(spec.ippt * input.springCount, turns, input.drum) * trackFactor;
      options.push({ ...spec, balancesDoorLb: { low: high * RATE_FACTOR_LOW, high } });
    }
  }
  options.sort((a, b) => a.weightLb - b.weightLb);

  if (options.length === 0) {
    warnings.push({ level: 'stop', message: input.springCount === 1 ? 'No single spring in the supported range fits. Try a pair.' : 'No spring pair in the supported range fits. Check the door weight, or use a larger inside diameter.' });
  }
  warnings.push({ level: 'info', message: `Start at ${turns} turns, then check balance and adjust a quarter turn at a time.` });

  return {
    turns,
    torquePerSpringInLb: torquePerSpring,
    ipptPerSpring,
    options: options.slice(0, 8),
    trackRadiusIn: track,
    ...(cable !== undefined ? { cableLengthIn: cable } : {}),
    warnings,
  };
}

export { DRUMS, WIRES, findWire };
