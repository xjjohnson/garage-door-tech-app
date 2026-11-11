/**
 * Reference data for the torsion spring calculator.
 *
 * Everything in this file is copied from a published source, named next to
 * the data. Nothing here is guessed. If you add a wire size or a drum, add it
 * from a manufacturer chart and note the source the same way.
 */

/** Steel constants. */
export const STEEL = {
  /**
   * Modulus of elasticity used for the rate (IPPT) formula, in psi.
   * 30,000,000 psi reproduces the published IPPT values in the Canimex
   * spring charts and American Garage Door Supply's product pages to
   * within about 1.5% (see test/validation.test.ts). DDM's door-weight
   * charts behave as if E were closer to 28,500,000 psi, about 5% lower.
   */
  modulusPsi: 30_000_000,
  /** Density of oil-tempered steel wire, lb per cubic inch (0.283). */
  densityLbPerIn3: 0.283,
} as const;

/**
 * Published sources disagree on how much door a given spring lifts.
 * Canimex and American Garage Door Supply print IPPT values that match the
 * textbook formula (E = 30,000,000 psi). DDM's door-weight charts rate the
 * same springs for about 8% less door (for example a .207 x 2" x 22" pair:
 * DDM 159-169 lb, formula about 180 lb, both at 7-1/2 turns on 4" drums).
 *
 * Mode 2 (size from the door) therefore aims for the middle: it treats a
 * spring as lifting RATE_FACTOR_MID x its catalog IPPT when picking a length,
 * and shows the door-weight range from RATE_FACTOR_LOW to 1.0. Either way the
 * door should land within about a quarter turn of balance. Mode 1 (match the
 * old spring) is not affected, because it compares springs to each other.
 *
 * Canimex's cable drum manual explains most of the gap: it sizes springs on
 * the drum's high moment arm (2.275" on a D400-96) rather than 2", and winds
 * a 7' door 7.6 turns on 12" radius track or 7.9 on 15". That rates a spring
 * set for 0.88x to 0.90x (12" track) or 0.92x to 0.93x (15" track) the door
 * this formula gives at 7-1/2 turns, so RATE_FACTOR_LOW matches 15" track
 * and runs about 3% high for 12" track (see the reference chart tests).
 */
export const RATE_FACTOR_LOW = 0.92;
export const RATE_FACTOR_MID = 0.96;

/**
 * Cycle life: published sources disagree here too, by more than on rate.
 * Canimex's chart and American Garage Door Supply's tables agree with each
 * other. DDM rates the same springs on the same doors for about 45% fewer
 * cycles (a .207 x 2" x 22" pair on a 164 lb door: DDM 19,000 cycles, the
 * Canimex chart about 34,000). DDM's figures behave exactly as if the torque
 * were 15% higher than the door actually needs.
 *
 * To stay on the safe side, the calculator rates life at the door's torque
 * times LIFE_SERVICE_FACTOR, which lands on DDM's numbers. It is also, within
 * 1%, what Canimex's drum manual does: it takes the full-wind torque as door
 * weight x the drum's high moment arm, and 2.275 / 2.0 = 1.14. The screen can
 * also show the maker-chart figure (factor 1.0) as the optimistic end.
 */
export const LIFE_SERVICE_FACTOR = 1.15;

/**
 * Dead (inactive) coils per spring: the coils clamped in the two cones that
 * do not twist. Sources split around 4:
 *  - Canimex prints 5 on its 1.75", 2.5" and 2.63" charts and 3 on 3.75".
 *  - Canimex's 2.00" chart prints 0 for most wires (5 for a few).
 *  - The Spring Engineering app's .2187 x 2" x 25" at 27.74 IPPT fits 5.
 *  - American Garage Door Supply's 2" and 1-3/4" IPPT values fit 4 to 5.
 * 4 is kept because the DDM-fitted factors above were set with it: moving to
 * 5 raises every IPPT about 1%, lengthens Mode 2 springs about 1/4" and cuts
 * a .225 x 2" x 24" pair on a 7' door just under 10,000 cycles. A calling
 * screen can override it.
 */
export const DEFAULT_DEAD_COILS = 4;

/** Cycle-life points the manufacturer charts publish, in cycles. */
export const LIFE_POINTS = [10_000, 15_000, 25_000, 50_000, 100_000] as const;
export type LifePoint = (typeof LIFE_POINTS)[number];

/**
 * Inside diameter the maximum-torque (MIP) figures below were published for.
 * Canimex prints the same MIP on its 2.5", 2.63" and 3.75" charts, so the
 * charts treat MIP as a property of the wire alone. Springs with a smaller
 * inside diameter bend the wire more tightly, so calculations scale MIP down
 * for IDs under 2.5" (see allowableTorque in springMath.ts) and never scale
 * it up for larger IDs.
 */
export const MIP_REFERENCE_ID_IN = 2.5;

export interface WireSize {
  /** Name techs and suppliers use, e.g. ".225". */
  nominal: string;
  /** Actual wire diameter in inches, as printed on the Canimex chart. */
  diameterIn: number;
  /** DASMA color code for the cone/paint mark, where DASMA lists one. */
  color?: string;
  /**
   * Length of 20 closely wound coils, inches, to the nearest 1/16" (DASMA,
   * except .234: see WIRES).
   */
  twentyCoilIn?: number;
  /**
   * Maximum torque per spring in inch-pounds (MIP) at each life point in
   * LIFE_POINTS, from the Canimex 2.500" coil diameter chart (oil-tempered
   * wire). Identical values appear on the Canimex 2.630" chart.
   */
  mipInLb: readonly [number, number, number, number, number];
}

/**
 * Wire sizes the calculator supports: the common residential and light
 * commercial range, .177" to .295".
 *
 * Sources:
 *  - Diameters and MIP: Canimex spring charts RCI2_50 and RCI2_63, hosted by
 *    IDC Spring (idcspring.com), read November 2026.
 *  - Color and 20-coil length: DASMA torsion spring table in Controlled
 *    Products' "Spring Reference Chart" PDF, read November 2026. The colors
 *    also match DASMA sheet #171 (Rev. 9/2015) and Service Spring's ordering
 *    sheet for every wire here.
 *  - 20-coil length for .234: DASMA and Service Spring print 4-5/8", but 20
 *    coils of .2343" wire are 4.686" long, which rounds to 4-11/16". DDM's
 *    measuring guide prints 4-11/16" and so does this table. Every other
 *    size is within 1/32" of 20 x its diameter.
 *
 * Canimex also prints a .2375" wire. It is left out because it has no DASMA
 * entry and sits between .234 and .243, which would make the 20-coil
 * measurement ambiguous.
 */
export const WIRES: readonly WireSize[] = [
  { nominal: '.177', diameterIn: 0.177, color: 'Gold', twentyCoilIn: 3.5, mipInLb: [137, 127, 115, 98, 85] },
  { nominal: '.187', diameterIn: 0.1875, color: 'Blue', twentyCoilIn: 3.75, mipInLb: [161, 149, 135, 116, 99] },
  { nominal: '.192', diameterIn: 0.192, color: 'Orange', twentyCoilIn: 3.875, mipInLb: [172, 159, 144, 123, 106] },
  { nominal: '.207', diameterIn: 0.207, color: 'Yellow', twentyCoilIn: 4.125, mipInLb: [212, 197, 177, 152, 131] },
  { nominal: '.218', diameterIn: 0.2187, color: 'White', twentyCoilIn: 4.375, mipInLb: [247, 229, 207, 178, 153] },
  { nominal: '.225', diameterIn: 0.2253, color: 'Red', twentyCoilIn: 4.5, mipInLb: [269, 249, 225, 193, 166] },
  { nominal: '.234', diameterIn: 0.234, color: 'Brown', twentyCoilIn: 4.6875, mipInLb: [299, 277, 250, 214, 185] },
  { nominal: '.243', diameterIn: 0.2437, color: 'Green', twentyCoilIn: 4.875, mipInLb: [334, 310, 280, 240, 207] },
  { nominal: '.250', diameterIn: 0.25, color: 'Gold', twentyCoilIn: 5.0, mipInLb: [359, 333, 300, 258, 222] },
  { nominal: '.262', diameterIn: 0.2625, color: 'Blue', twentyCoilIn: 5.25, mipInLb: [411, 382, 344, 295, 254] },
  { nominal: '.273', diameterIn: 0.273, color: 'Orange', twentyCoilIn: 5.5, mipInLb: [459, 426, 384, 330, 284] },
  { nominal: '.283', diameterIn: 0.283, color: 'Light Blue', twentyCoilIn: 5.625, mipInLb: [507, 471, 424, 364, 314] },
  { nominal: '.289', diameterIn: 0.289, color: 'Yellow', twentyCoilIn: 5.75, mipInLb: [538, 499, 450, 386, 333] },
  { nominal: '.295', diameterIn: 0.295, color: 'White', twentyCoilIn: 5.875, mipInLb: [570, 528, 477, 409, 352] },
];

/** Inside diameters stocked for residential work, inches. */
export const COMMON_IDS_IN = [1.75, 2.0, 2.625] as const;

export type DrumId = '400-8' | '400-12';

export interface Drum {
  id: DrumId;
  /** Radius the cable pulls at, inches (4" drum = 2"). */
  cableRadiusIn: number;
  /** Tallest door the drum holds enough cable for, inches. */
  maxDoorHeightIn: number;
  /**
   * Canimex's high moment arm (HMA) for this drum, inches: the largest
   * radius the cable pulls at, which Canimex sizes springs on. Used only to
   * check the calculator's safety factors (see LIFE_SERVICE_FACTOR).
   */
  highMomentArmIn: number;
  /**
   * Cable length = floor to shaft center + this, inches, for each cable
   * (standard-lift cable length rule for 4" drums: +8").
   */
  cableAllowanceIn: number;
  label: string;
}

/**
 * Standard-lift drums only. The number before the dash is the drum diameter
 * (400 = 4.00"), the number after it is feet of cable it holds (Service
 * Spring, "Understanding 3 Impacts of the Garage Door Drum"). A 4" drum
 * lifts about 13" per turn, so a 7' door takes about 7-1/2 turns
 * (Service Spring; DDM, "How Many Turns Do You Wind a Torsion Spring").
 *
 * Canimex's cable drum manual lists its D400-96 (the 400-8 size) for doors
 * to 98" and its D400-144 (400-12) to 148"; the limits here stay at the
 * even 8' and 12' the part numbers name. Both drums take cable of floor to
 * shaft center + 8" (Service Spring, APCO, DNS, OMI and Torque Force all
 * give the same rule for these two drums).
 *
 * High-lift, vertical-lift and tapered drums change the cable radius as the
 * door travels. They need the drum maker's chart and are out of scope for v1.
 */
export const DRUMS: Record<DrumId, Drum> = {
  '400-8': { id: '400-8', cableRadiusIn: 2.0, maxDoorHeightIn: 96, highMomentArmIn: 2.275, cableAllowanceIn: 8, label: '400-8 (4", doors to 8\')' },
  '400-12': { id: '400-12', cableRadiusIn: 2.0, maxDoorHeightIn: 144, highMomentArmIn: 2.293, cableAllowanceIn: 8, label: '400-12 (4", doors to 12\')' },
};
