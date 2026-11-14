/** How springs are named and rated on screen and in quotes. No React, so plain logic can use it too. */
import { formatInches, formatNumber } from './measure';
import { LifeEstimate, SpringSpec } from '../springCalc';

export function formatLife(life: LifeEstimate): string {
  if (life.belowMinimum) return 'Under 10,000';
  if (life.atOrAboveMaximum) return '100,000+';
  return formatNumber(life.cycles);
}

/** How long a spring should last at this many uses a day: "about 17 years", "about 8 months". */
export function expectedLife(life: LifeEstimate, usesPerDay: number): string {
  const days = life.cycles / Math.max(0.1, usesPerDay);
  const years = days / 365;
  const text = years >= 1.5 ? `${Math.round(years)} years` : `${Math.max(1, Math.round(years * 12))} months`;
  return life.belowMinimum ? `under ${text}` : life.atOrAboveMaximum ? `${text} or more` : `about ${text}`;
}

/** ".225 × 2" × 24"" */
export function springName(s: Pick<SpringSpec, 'wire' | 'insideDiameterIn' | 'lengthIn'>): string {
  return `${s.wire} × ${formatInches(s.insideDiameterIn)} × ${formatInches(s.lengthIn)}`;
}
