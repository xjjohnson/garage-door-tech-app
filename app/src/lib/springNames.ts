/** How springs are named and rated on screen and in quotes. No React, so plain logic can use it too. */
import { formatInches, formatNumber } from './measure';
import { LifeEstimate, SpringSpec } from '../springCalc';

export function formatLife(life: LifeEstimate): string {
  if (life.belowMinimum) return 'Under 10,000';
  if (life.atOrAboveMaximum) return '100,000+';
  return formatNumber(life.cycles);
}

/** ".225 × 2" × 24"" */
export function springName(s: Pick<SpringSpec, 'wire' | 'insideDiameterIn' | 'lengthIn'>): string {
  return `${s.wire} × ${formatInches(s.insideDiameterIn)} × ${formatInches(s.lengthIn)}`;
}
