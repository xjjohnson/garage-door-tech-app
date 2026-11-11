/**
 * Extension springs: the springs that stretch along the horizontal track,
 * one per side (two on heavier doors), each pulling a cable over a pulley.
 *
 * Unlike torsion springs, extension springs are sold by the pull they're
 * rated for, so there's no rate formula here: the rating, color, length and
 * stretch come straight from published charts, named next to each value.
 *
 *  - Rating: DDM ("Extension springs for standard sectional garage doors",
 *    shop.ddmgaragedoors.com, read November 2026): "Each spring pulls 100
 *    pounds on the pulley, but the cable on the bottom of the door lifts
 *    only 50 pounds", so a 100 lb door takes a 100 lb spring on each side.
 *    DASMA TDS-171: "Two extension springs are required for the
 *    corresponding door weight."
 *  - Four-spring doors: DDM's worked example weighs a door at about 214 lb
 *    and fits "two 100 pound lift springs and two 110 pound lift springs".
 *    So with two springs per side, the two on a side add up to the door
 *    weight.
 *  - Rounding: DDM: "If your door falls between two door weights, select
 *    the lower weight ... stronger is not better." Ratings come in 10 lb
 *    steps.
 */
import type { Warning } from './calculator';

/** DASMA extension spring colors, by the tens digit of the rating (0 = 100, 200, 300 lb). */
export const EXTENSION_COLORS = ['Tan', 'White', 'Green', 'Yellow', 'Blue', 'Red', 'Brown', 'Orange', 'Gold', 'Light Blue'] as const;
export type ExtensionColor = (typeof EXTENSION_COLORS)[number];

/**
 * Ratings, lb per spring, the color lookup considers. DASMA TDS-171 lists 50
 * to 300 lb; DDM's chart adds 40 lb (blue). Heavier springs exist but are
 * rare enough that a color alone shouldn't be read as one.
 */
export const EXTENSION_COLOR_RANGE_LB = { min: 40, max: 300 } as const;

/** The lightest and heaviest single spring the sizer will offer, lb. DDM lists 50 to 540 lb. */
export const EXTENSION_RATING_LIMITS_LB = { min: 40, max: 540 } as const;
const STEP_LB = 10;

/**
 * Stock sizes by door height, as length (coils only, relaxed) x stretch,
 * inches. Stretch is "normally half the door height" (DDM). Sources: DDM's
 * "25-42-100" example for 7' doors; DDM's 8' listings (27 x 48, a few
 * 29 x 48) and 9' listings (39 x 54), read November 2026.
 */
export const EXTENSION_SIZES: readonly { doorHeightIn: number; lengthIn: number; stretchIn: number; otherLengthsIn?: readonly number[] }[] = [
  { doorHeightIn: 84, lengthIn: 25, stretchIn: 42 },
  { doorHeightIn: 96, lengthIn: 27, stretchIn: 48, otherLengthsIn: [29] },
  { doorHeightIn: 108, lengthIn: 39, stretchIn: 54 },
];

export function extensionColor(ratingLb: number): ExtensionColor {
  if (!Number.isInteger(ratingLb / STEP_LB)) throw new RangeError('Extension spring ratings come in 10 lb steps.');
  return EXTENSION_COLORS[(ratingLb / STEP_LB) % 10]!;
}

/** Ratings in the color range that share a color, lightest first: blue is 40, 140 and 240 lb. */
export function ratingsForColor(color: ExtensionColor): number[] {
  const out: number[] = [];
  for (let lb = EXTENSION_COLOR_RANGE_LB.min; lb <= EXTENSION_COLOR_RANGE_LB.max; lb += STEP_LB) {
    if (extensionColor(lb) === color) out.push(lb);
  }
  return out;
}

export interface ExtensionSpring {
  ratingLb: number;
  color: ExtensionColor;
}

/**
 * The springs one side of the door needs: their ratings add up to the door
 * weight, rounded down to 10 lb. With two springs a side an odd split puts
 * the heavier one first (210 lb → 110 + 100).
 */
export function springsForSide(doorWeightLb: number, springsPerSide: 1 | 2): ExtensionSpring[] {
  const total = Math.floor(doorWeightLb / STEP_LB) * STEP_LB;
  if (springsPerSide === 1) return [{ ratingLb: total, color: extensionColor(total) }];
  const light = Math.floor(total / 2 / STEP_LB) * STEP_LB;
  const heavy = total - light;
  return [heavy, light].map((lb) => ({ ratingLb: lb, color: extensionColor(lb) }));
}

/** Stretch an extension spring needs: half the door height (DDM). */
export function extensionStretchIn(doorHeightIn: number): number {
  return doorHeightIn / 2;
}

export function stockExtensionSize(doorHeightIn: number) {
  return EXTENSION_SIZES.find((s) => s.doorHeightIn === doorHeightIn);
}


export interface ExtensionInput {
  doorHeightIn: number;
  springsPerSide: 1 | 2;
  /** Weighed door, lb. Either this or the old springs' color or tag rating is needed. */
  doorWeightLb?: number;
  old?: {
    color?: ExtensionColor;
    /** The pull printed on the old spring's tag, lb per spring. */
    ratingLb?: number;
    /** Relaxed length of the old spring, coils only, no loops or clips. */
    lengthIn?: number;
  };
}

export interface ExtensionResult {
  /** The springs to order for each side, or undefined when the old springs can't be told apart. */
  perSide?: ExtensionSpring[];
  /** Total springs to order. */
  springCount: 2 | 4;
  /** Where the rating came from. */
  basis: 'door weight' | 'old tag' | 'old color';
  /** Door weight these springs lift, lb (the sum of one side). */
  liftsLb?: number;
  /** Ratings the old color could be, when the color is all there is. */
  colorCandidatesLb?: number[];
  /** Stock length and stretch for this door height, when there is one. */
  lengthIn?: number;
  stretchIn: number;
  otherLengthsIn?: readonly number[];
  warnings: Warning[];
}

/**
 * Size extension springs from the door weight, or match the old ones by
 * their tag or color. When the door was weighed, the weight wins and the old
 * springs are only checked against it.
 */
export function extensionSprings(input: ExtensionInput): ExtensionResult {
  const warnings: Warning[] = [];
  const { doorHeightIn, springsPerSide, doorWeightLb, old } = input;
  if (!(doorHeightIn >= 72 && doorHeightIn <= 168)) throw new RangeError("Door height must be between 6' and 14'.");
  if (doorWeightLb !== undefined && !(doorWeightLb >= 40 && doorWeightLb <= 1000)) throw new RangeError('Door weight must be between 40 and 1,000 lb.');
  if (old?.ratingLb !== undefined && (!(old.ratingLb >= 10 && old.ratingLb <= 600) || !Number.isInteger(old.ratingLb / STEP_LB))) {
    throw new RangeError('The tag rating should be a whole 10 lb step, e.g. 140.');
  }
  if (old?.lengthIn !== undefined && !(old.lengthIn >= 10 && old.lengthIn <= 60)) throw new RangeError('Old spring length must be between 10" and 60".');

  const stock = stockExtensionSize(doorHeightIn);
  const stretchIn = extensionStretchIn(doorHeightIn);
  const springCount = springsPerSide === 2 ? 4 : 2;
  const sizeInfo = {
    stretchIn,
    ...(stock ? { lengthIn: stock.lengthIn } : {}),
    ...(stock?.otherLengthsIn ? { otherLengthsIn: stock.otherLengthsIn } : {}),
  };

  // What the old springs say they were, per spring (on a four-spring door, a side's springs can differ by 10 lb).
  const colorCandidates = old?.color && old.ratingLb === undefined ? ratingsForColor(old.color) : undefined;
  if (old?.color && old.ratingLb !== undefined && extensionColor(old.ratingLb) !== old.color) {
    warnings.push({ level: 'caution', message: `The tag says ${old.ratingLb} lb, which DASMA marks ${extensionColor(old.ratingLb)}, not ${old.color}. Going by the tag.` });
  }

  let perSide: ExtensionSpring[] | undefined;
  let basis: ExtensionResult['basis'];
  if (doorWeightLb !== undefined) {
    basis = 'door weight';
    perSide = springsForSide(doorWeightLb, springsPerSide);
    if (doorWeightLb % STEP_LB !== 0) {
      warnings.push({ level: 'info', message: `${doorWeightLb} lb is between ratings, so it's rounded down. A spring a little light keeps the door shut; one too strong lets it drift up.` });
    }
    const each = perSide.map((s) => s.ratingLb);
    if (old?.ratingLb !== undefined && !each.some((lb) => Math.abs(lb - old.ratingLb!) <= STEP_LB)) {
      warnings.push({ level: 'caution', message: `The old springs were ${old.ratingLb} lb but this door needs ${each.join(' + ')} lb a side. Go by the door weight; the old springs may have been wrong for it.` });
    } else if (colorCandidates && !colorCandidates.some((lb) => each.some((e) => Math.abs(e - lb) <= STEP_LB))) {
      warnings.push({ level: 'caution', message: `${old!.color} springs are ${colorCandidates.join(', ')} lb, none close to the ${each.join(' + ')} lb this door needs. Go by the door weight; the old springs may have been wrong, or not DASMA colored.` });
    }
  } else if (old?.ratingLb !== undefined) {
    basis = 'old tag';
    perSide = springsPerSide === 1 ? [{ ratingLb: old.ratingLb, color: extensionColor(old.ratingLb) }] : [{ ratingLb: old.ratingLb, color: extensionColor(old.ratingLb) }, { ratingLb: old.ratingLb, color: extensionColor(old.ratingLb) }];
    warnings.push({ level: 'caution', message: 'Sized from the old tag. If the door was hard to lift or drifted, weigh it instead: the old springs may have been wrong for it.' });
    if (springsPerSide === 2) warnings.push({ level: 'info', message: 'On a four-spring door the two springs on a side can differ by 10 lb. Read every tag.' });
  } else if (colorCandidates) {
    basis = 'old color';
    warnings.push({
      level: 'stop',
      message: `${old!.color} is ${colorCandidates.map((lb) => `${lb}`).join(', ')} lb: DASMA colors repeat every 100 lb. Weigh the door or read the tag before ordering.`,
    });
  } else {
    throw new RangeError('Enter the door weight, or the old springs’ color or tag rating.');
  }

  if (old?.color) {
    warnings.push({ level: 'info', message: 'Some hardware-store brands use their own colors (Prime-Line sells a red-tipped 140 lb spring; DASMA 140 lb is blue). Check the tag when there is one.' });
  }

  if (perSide) {
    for (const s of perSide) {
      if (s.ratingLb < EXTENSION_RATING_LIMITS_LB.min) {
        warnings.push({ level: 'stop', message: `${s.ratingLb} lb is lighter than stock extension springs. Check the door weight.` });
        break;
      }
      if (s.ratingLb > EXTENSION_RATING_LIMITS_LB.max) {
        warnings.push({ level: 'stop', message: springsPerSide === 1 ? `${s.ratingLb} lb is more than one stock spring a side carries. Use two springs a side, or convert the door to torsion.` : `${s.ratingLb} lb is more than stock springs carry. Convert the door to torsion.` });
        break;
      }
      if (s.ratingLb > 300) {
        warnings.push({ level: 'caution', message: `${s.ratingLb} lb is heavier than DASMA's color chart (to 300 lb). Order by the rating, not the color, and consider torsion.` });
        break;
      }
    }
  }

  // Length: the stock size for the height, compared with the old spring.
  if (!stock) {
    warnings.push({ level: 'info', message: `No stock size on file for this height. Order a ${formatIn(stretchIn)} stretch (half the door height) and match the old spring's length.` });
  } else if (old?.lengthIn !== undefined) {
    const lengths = [stock.lengthIn, ...(stock.otherLengthsIn ?? [])];
    if (!lengths.some((l) => Math.abs(l - old.lengthIn!) <= 0.5)) {
      const diff = stock.lengthIn - old.lengthIn;
      warnings.push({
        level: 'caution',
        message:
          diff < 0
            ? `The old spring was ${formatIn(old.lengthIn)}, the stock one is ${formatIn(stock.lengthIn)}. A shorter spring needs 2" more cable or hook-up for every inch shorter (${formatIn(-2 * diff)} here), or order the old length.`
            : `The old spring was ${formatIn(old.lengthIn)}, the stock one is ${formatIn(stock.lengthIn)}. A longer spring needs the cables shortened to keep the pull, or order the old length.`,
      });
    }
  }

  warnings.push({ level: 'info', message: springCount === 4 ? 'Replace all four springs at once, and the pulleys if they are worn.' : 'Replace both springs at once, and the pulleys if they are worn.' });
  warnings.push({ level: 'caution', message: 'Run a safety cable through every spring. Without one a broken spring flies.' });

  return {
    ...(perSide ? { perSide, liftsLb: perSide.reduce((n, s) => n + s.ratingLb, 0) } : {}),
    springCount,
    basis,
    ...(colorCandidates && !perSide ? { colorCandidatesLb: colorCandidates } : {}),
    ...sizeInfo,
    warnings,
  };
}

function formatIn(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}"`;
}
