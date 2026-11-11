/**
 * Core torsion spring formulas. All units are inches, pounds and inch-pounds.
 *
 * Every function here is pure (no state, no I/O), so the app can run it
 * offline and the tests can check each formula on its own.
 */
import {
  CANIMEX_STANDARD_LIFT_MULTIPLIERS,
  DEFAULT_DEAD_COILS,
  DRUMS,
  DrumId,
  LIFE_POINTS,
  MIP_REFERENCE_ID_IN,
  STEEL,
  TrackRadius,
  WIRES,
  WireSize,
} from './data';

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Mean coil diameter: inside diameter plus one wire diameter. */
export function meanDiameter(wireIn: number, insideDiameterIn: number): number {
  return insideDiameterIn + wireIn;
}

/**
 * Spring index c = mean diameter / wire diameter. Below about 6 the wire is
 * bent too tightly to coil reliably; 8 and up is normal for overhead doors
 * (Rolling Door Software manual, rollingsteeldoors.com).
 */
export function springIndex(wireIn: number, insideDiameterIn: number): number {
  return meanDiameter(wireIn, insideDiameterIn) / wireIn;
}

/** Total coils in a closely wound spring of a given relaxed length. */
export function totalCoils(wireIn: number, lengthIn: number): number {
  return lengthIn / wireIn;
}

/** Coils that actually twist: total minus the coils held in the cones. */
export function activeCoils(wireIn: number, lengthIn: number, deadCoils = DEFAULT_DEAD_COILS): number {
  return totalCoils(wireIn, lengthIn) - deadCoils;
}

// ---------------------------------------------------------------------------
// Rate (IPPT)
// ---------------------------------------------------------------------------

/**
 * Rate constant K = IPPT x active coils, in inch-pounds per turn per coil.
 *
 * A torsion spring is a coiled beam in bending. Twisting the end by one full
 * turn (2*pi radians) takes a torque of
 *
 *     IPPT = E * I / (R * N)       with I = pi * d^4 / 64 and R = D / 2
 *          = E * pi * d^4 / (32 * D * N)
 *
 * where d is wire diameter, D is mean coil diameter and N is active coils.
 * (Derivation: Dr. Drang, "Let's twist again", leancrew.com, 2011.)
 * Canimex prints K as the first number of each chart's summary line, and this
 * formula with E = 30,000,000 psi reproduces it to about 0.2%.
 */
export function rateConstant(wireIn: number, insideDiameterIn: number, modulusPsi: number = STEEL.modulusPsi): number {
  return (modulusPsi * Math.PI * wireIn ** 4) / (32 * meanDiameter(wireIn, insideDiameterIn));
}

/** Inch-pounds per turn (IPPT) for one spring. */
export function ippt(
  wireIn: number,
  insideDiameterIn: number,
  lengthIn: number,
  deadCoils = DEFAULT_DEAD_COILS,
  modulusPsi: number = STEEL.modulusPsi,
): number {
  const n = activeCoils(wireIn, lengthIn, deadCoils);
  if (n <= 0) throw new RangeError('Spring is too short: no active coils left after the dead coils.');
  return rateConstant(wireIn, insideDiameterIn, modulusPsi) / n;
}

/**
 * Relaxed length that gives a target IPPT. Inverse of ippt():
 * N = K / IPPT, length = (N + dead coils) * d.
 */
export function lengthForIppt(
  wireIn: number,
  insideDiameterIn: number,
  targetIppt: number,
  deadCoils = DEFAULT_DEAD_COILS,
  modulusPsi: number = STEEL.modulusPsi,
): number {
  const n = rateConstant(wireIn, insideDiameterIn, modulusPsi) / targetIppt;
  return (n + deadCoils) * wireIn;
}

/** Round a length to the increment suppliers stock (1/2" by default). */
export function roundLength(lengthIn: number, incrementIn = 0.5): number {
  return Math.round(lengthIn / incrementIn) * incrementIn;
}

// ---------------------------------------------------------------------------
// Stress and cycle life
// ---------------------------------------------------------------------------

/**
 * Wahl curvature factor for the inner edge of a torsion spring coil:
 *     Ki = (4c^2 - c - 1) / (4c(c - 1))
 * A tighter coil (smaller c) concentrates more stress on the inside of the
 * wire, so the same torque wears it out sooner.
 */
export function curvatureFactor(c: number): number {
  return (4 * c * c - c - 1) / (4 * c * (c - 1));
}

/**
 * Peak bending stress in the wire, psi, at torque M (inch-pounds):
 *     S = Ki * 32 * M / (pi * d^3)
 * Shown for reference only. Life decisions use allowableTorque(), which is
 * tied directly to the manufacturer's cycle chart.
 */
export function bendingStressPsi(torqueInLb: number, wireIn: number, insideDiameterIn: number): number {
  const ki = curvatureFactor(springIndex(wireIn, insideDiameterIn));
  return (ki * 32 * torqueInLb) / (Math.PI * wireIn ** 3);
}

/** Find a supported wire by exact diameter (within 0.0005"). */
export function findWire(wireIn: number): WireSize | undefined {
  return WIRES.find((w) => Math.abs(w.diameterIn - wireIn) < 0.0005);
}

/**
 * Maximum torque one spring may carry, at full wind, for a given cycle life.
 *
 * Starts from the Canimex MIP for that wire and life point. For inside
 * diameters below 2.5" it scales MIP down by Ki(2.5" ID) / Ki(actual ID), so
 * the peak stress stays at what Canimex allows on a 2.5" spring. This is
 * deliberately conservative: American Garage Door Supply's own 1-3/4" and 2"
 * life tables allow 0 to 3% more torque than this returns. For IDs of 2.5"
 * and up it uses the chart value as printed and never increases it.
 */
export function allowableTorque(wire: WireSize, insideDiameterIn: number, lifeIndex: number): number {
  const base = wire.mipInLb[lifeIndex];
  if (base === undefined) throw new RangeError(`No life point at index ${lifeIndex}.`);
  const kiRef = curvatureFactor(springIndex(wire.diameterIn, MIP_REFERENCE_ID_IN));
  const kiHere = curvatureFactor(springIndex(wire.diameterIn, insideDiameterIn));
  return base * Math.min(1, kiRef / kiHere);
}

export interface LifeEstimate {
  /** Estimated cycles, rounded down to the nearest 500. */
  cycles: number;
  /** True when torque exceeds the 10,000-cycle limit: the spring is overstressed. */
  belowMinimum: boolean;
  /** True when torque is under the 100,000-cycle limit; cycles is then reported as 100,000. */
  atOrAboveMaximum: boolean;
}

/**
 * Estimated cycle life for one spring carrying a given torque at full wind.
 *
 * Interpolates between the chart's life points on a log-log scale (fatigue
 * life is close to a straight line on log torque vs log cycles between
 * neighbouring points). It never extrapolates: above the 10,000-cycle torque
 * it reports "below minimum" instead of a number, and below the
 * 100,000-cycle torque it reports 100,000+.
 */
/** Read an array element, failing loudly instead of returning undefined. */
function at(values: readonly number[], i: number): number {
  const v = values[i];
  if (v === undefined) throw new RangeError(`Index ${i} is outside the life chart.`);
  return v;
}

export function estimateLife(wire: WireSize, insideDiameterIn: number, torqueInLb: number): LifeEstimate {
  const lives: readonly number[] = LIFE_POINTS;
  const limits = lives.map((_, i) => allowableTorque(wire, insideDiameterIn, i));
  const last = limits.length - 1;
  if (torqueInLb > at(limits, 0)) {
    return { cycles: 0, belowMinimum: true, atOrAboveMaximum: false };
  }
  if (torqueInLb <= at(limits, last)) {
    return { cycles: at(lives, last), belowMinimum: false, atOrAboveMaximum: true };
  }
  for (let i = 0; i < last; i++) {
    const hi = at(limits, i); // torque allowed at the shorter life
    const lo = at(limits, i + 1); // torque allowed at the longer life
    if (torqueInLb <= hi && torqueInLb >= lo) {
      const t = (Math.log(torqueInLb) - Math.log(hi)) / (Math.log(lo) - Math.log(hi));
      const logLife = Math.log(at(lives, i)) + t * (Math.log(at(lives, i + 1)) - Math.log(at(lives, i)));
      const cycles = Math.floor(Math.exp(logLife) / 500) * 500;
      return { cycles, belowMinimum: false, atOrAboveMaximum: false };
    }
  }
  // Unreachable when the chart's torques decrease with life, as they do.
  throw new Error('Life chart is not in decreasing order.');
}

/** Torque one spring may carry for at least `cycles` cycles (log-log interpolation). */
export function allowableTorqueForCycles(wire: WireSize, insideDiameterIn: number, cycles: number): number {
  const lives: readonly number[] = LIFE_POINTS;
  if (cycles < at(lives, 0) || cycles > at(lives, lives.length - 1)) {
    throw new RangeError('Cycle target must be between 10,000 and 100,000.');
  }
  for (let i = 0; i < lives.length - 1; i++) {
    const a = at(lives, i);
    const b = at(lives, i + 1);
    if (cycles >= a && cycles <= b) {
      const hi = allowableTorque(wire, insideDiameterIn, i);
      const lo = allowableTorque(wire, insideDiameterIn, i + 1);
      const t = (Math.log(cycles) - Math.log(a)) / (Math.log(b) - Math.log(a));
      return Math.exp(Math.log(hi) + t * (Math.log(lo) - Math.log(hi)));
    }
  }
  throw new Error('Unreachable');
}

// ---------------------------------------------------------------------------
// Door, drum and turns
// ---------------------------------------------------------------------------

/**
 * Turns to wind for a standard-lift door:
 *     turns = door height / drum circumference + 1
 * The extra turn keeps the cables tight with the door fully open (DDM; Kinch,
 * truetex.com). The result is rounded DOWN to the nearest quarter turn, which
 * gives the usual 7-1/2 turns for a 7' door and 8-1/2 for an 8' door on 4"
 * drums. The tech then adds or removes a quarter turn to balance the door.
 */
export function standardLiftTurns(doorHeightIn: number, drumId: DrumId): number {
  const drum = DRUMS[drumId];
  if (doorHeightIn > drum.maxDoorHeightIn) {
    throw new RangeError(`A ${drum.id} drum holds cable for doors up to ${drum.maxDoorHeightIn / 12}'.`);
  }
  const exact = doorHeightIn / (2 * Math.PI * drum.cableRadiusIn) + 1;
  return Math.floor(exact * 4) / 4;
}

/**
 * Torque the springs must supply with the door closed:
 *     torque = door weight x cable radius
 * (Kinch, truetex.com: "a torque of 350 pounds on a 2-inch radius, that is,
 * 700 inch-pounds".)
 */
export function doorTorque(doorWeightLb: number, drumId: DrumId): number {
  return doorWeightLb * DRUMS[drumId].cableRadiusIn;
}

/** Door weight a set of springs balances when wound `turns` turns. */
export function balancedWeight(totalIppt: number, turns: number, drumId: DrumId): number {
  return (totalIppt * turns) / DRUMS[drumId].cableRadiusIn;
}

/**
 * How much door a spring set lifts on this track radius, relative to the
 * 15" track the lift factors were fitted to: 1 on 15" track, about 0.96 on
 * 12" (Canimex's 15" multiplier over its 12" one at this door height).
 * Multiply RATE_FACTOR_LOW and RATE_FACTOR_MID by it.
 *
 * Heights between table rows are interpolated; heights outside the table
 * take its nearest row.
 */
export function trackRadiusFactor(trackRadiusIn: TrackRadius, drumId: DrumId, doorHeightIn: number): number {
  if (trackRadiusIn === 15) return 1;
  if (trackRadiusIn !== 12) throw new RangeError('Track radius must be 12" or 15".');
  const rows = CANIMEX_STANDARD_LIFT_MULTIPLIERS[drumId];
  const ratio = (r: readonly [number, number, number]) => r[2] / r[1];
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) throw new Error(`No track multipliers for ${drumId}.`);
  if (doorHeightIn <= first[0]) return ratio(first);
  if (doorHeightIn >= last[0]) return ratio(last);
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i]!;
    const b = rows[i + 1]!;
    if (doorHeightIn >= a[0] && doorHeightIn <= b[0]) {
      const t = (doorHeightIn - a[0]) / (b[0] - a[0]);
      return ratio(a) + t * (ratio(b) - ratio(a));
    }
  }
  throw new Error('Track multiplier table is not in height order.');
}

/**
 * Door height a turn count implies on a standard-lift drum, the inverse of
 * the turns rule before rounding. Used to look up the track factor when the
 * tech entered turns instead of a door height.
 */
export function heightForTurns(turns: number, drumId: DrumId): number {
  return Math.max(0, turns - 1) * 2 * Math.PI * DRUMS[drumId].cableRadiusIn;
}

/**
 * Length to cut each lift cable for a standard-lift drum:
 *     cable = floor to shaft center + the drum's allowance (8" on 400-8 and
 *     400-12 drums)
 * The allowance covers the turns left on the drum and the loop at the
 * bottom bracket. Measure floor to the center of the torsion shaft.
 */
export function cableLengthIn(floorToShaftCenterIn: number, drumId: DrumId): number {
  if (!(floorToShaftCenterIn > 0) || floorToShaftCenterIn > 240) {
    throw new RangeError('Floor to shaft center must be between 0 and 240 inches.');
  }
  return floorToShaftCenterIn + DRUMS[drumId].cableAllowanceIn;
}

/**
 * How much longer the spring gets when wound: about one wire diameter per
 * turn. The tech needs this much free shaft beside the spring.
 */
export function windingGrowth(wireIn: number, turns: number): number {
  return wireIn * turns;
}

/**
 * Spring weight in pounds: wire volume x steel density. Wire length per inch
 * of spring is (1/d) coils x pi x D, so weight per inch of spring is
 * pi^2 * d * D / 4 * density. This reproduces the weight column on the
 * Canimex charts.
 */
export function springWeightLb(wireIn: number, insideDiameterIn: number, lengthIn: number): number {
  const perInch = (Math.PI ** 2 * wireIn * meanDiameter(wireIn, insideDiameterIn) * STEEL.densityLbPerIn3) / 4;
  return perInch * lengthIn;
}

// ---------------------------------------------------------------------------
// Wire identification
// ---------------------------------------------------------------------------

export interface WireMatch {
  wire: WireSize;
  /** True when the measurement sits close to the midpoint between two sizes. */
  ambiguous: boolean;
  /** The next-closest size, so the screen can say what else it might be. */
  runnerUp?: WireSize;
}

/**
 * Identify the wire from the length of 20 closely wound coils.
 *
 * Neighbouring sizes differ by only 1/8" to 1/4" over 20 coils, so a match is
 * accepted only within 1/16" of the DASMA length, and flagged ambiguous when
 * the measurement is within 1/32" of the halfway point to the next size.
 * Returns undefined when nothing is close enough: the tech should measure
 * again, or measure the wire with a caliper.
 */
export function wireFromTwentyCoils(lengthOf20In: number): WireMatch | undefined {
  const ranked = WIRES.filter((w) => w.twentyCoilIn !== undefined)
    .map((w) => ({ w, diff: Math.abs(w.twentyCoilIn! - lengthOf20In) }))
    .sort((a, b) => a.diff - b.diff);
  const best = ranked[0];
  if (!best || best.diff > 1 / 16 + 1e-9) return undefined;
  const second = ranked[1];
  let ambiguous = false;
  if (second) {
    const midpoint = (best.w.twentyCoilIn! + second.w.twentyCoilIn!) / 2;
    ambiguous = Math.abs(lengthOf20In - midpoint) <= 1 / 32 + 1e-9;
  }
  return { wire: best.w, ambiguous, runnerUp: second?.w };
}

/** Identify the wire from a caliper reading, within 0.003". */
export function wireFromCaliper(diameterIn: number): WireSize | undefined {
  const ranked = [...WIRES].sort((a, b) => Math.abs(a.diameterIn - diameterIn) - Math.abs(b.diameterIn - diameterIn));
  const best = ranked[0];
  return best && Math.abs(best.diameterIn - diameterIn) <= 0.003 ? best : undefined;
}
