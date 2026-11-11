/**
 * A rough door weight from its size and construction, for quoting before a
 * door is weighed. It is never a substitute for the scale: DDM, which
 * gathered these weights over decades of spring jobs, says they "are only
 * approximations" and "not reliable for ordering garage door springs".
 *
 * Door makers don't publish weights by size, so each construction below is
 * the weight per square foot of door that a published figure works out to,
 * named next to it. Nothing is added for windows, struts beyond those noted,
 * or other gauges: the screen says so.
 */
import type { Warning } from './calculator';

export type DoorConstruction = 'steel-plain' | 'steel-insulated' | 'steel-sandwich' | 'wood-newer' | 'wood-older';

export interface ConstructionData {
  id: DoorConstruction;
  label: string;
  detail: string;
  /** Weight per square foot of door, low and high, lb. */
  lbPerSqFt: { low: number; high: number };
  source: string;
}

const SQFT_16X7 = 16 * 7;
const SQFT_8X7 = 8 * 7;

export const DOOR_CONSTRUCTIONS: readonly ConstructionData[] = [
  {
    id: 'steel-plain',
    label: 'Steel, not insulated',
    detail: '25 gauge, single skin',
    // 75-80 lb for 8x7 and 150-160 lb for 16x7: both 1.34-1.43 lb/sq ft.
    lbPerSqFt: { low: 75 / SQFT_8X7, high: 160 / SQFT_16X7 },
    source: 'Wayne Dalton 25 gauge figures quoted by Compaan Door (compaandoor.com), read Nov 2026',
  },
  {
    id: 'steel-insulated',
    label: 'Steel, insulated back',
    detail: '25 gauge, foam or vinyl-backed insulation',
    // 85-90 lb for 8x7 and 165-180 lb for 16x7: 1.47-1.61 lb/sq ft.
    lbPerSqFt: { low: 165 / SQFT_16X7, high: 90 / SQFT_8X7 },
    source: 'Wayne Dalton 25 gauge insulated figures quoted by Compaan Door, read Nov 2026',
  },
  {
    id: 'steel-sandwich',
    label: 'Steel both sides, 2"',
    detail: 'Steel inside and out, insulated between, one strut',
    // One door: a Clopay 16x7 at 260 lb.
    lbPerSqFt: { low: 260 / SQFT_16X7, high: 260 / SQFT_16X7 },
    source: 'DDM, "Calculators for garage door weight" (Clopay 2" sandwich, 16x7, 260 lb), read Nov 2026',
  },
  {
    id: 'wood-newer',
    label: 'Wood, newer',
    detail: '1/8"-3/16" panels, narrow rails, 3 struts',
    lbPerSqFt: { low: 240 / SQFT_16X7, high: 250 / SQFT_16X7 },
    source: 'DDM (16x7, 240-250 lb), read Nov 2026',
  },
  {
    id: 'wood-older',
    label: 'Wood, older',
    detail: '1/4" panels, wide rails, painted many times',
    lbPerSqFt: { low: 350 / SQFT_16X7, high: 360 / SQFT_16X7 },
    source: 'DDM (16x7, 350-360 lb), read Nov 2026',
  },
];

export interface DoorWeightEstimate {
  lowLb: number;
  highLb: number;
  construction: ConstructionData;
  warnings: Warning[];
}

/** Rough weight for a door of this size and construction, rounded out to whole 5 lb. */
export function estimateDoorWeight(input: { widthIn: number; heightIn: number; construction: DoorConstruction; windows?: boolean }): DoorWeightEstimate {
  if (!(input.widthIn >= 36 && input.widthIn <= 360)) throw new RangeError('Door width must be between 3\' and 30\'.');
  if (!(input.heightIn >= 60 && input.heightIn <= 240)) throw new RangeError('Door height must be between 5\' and 20\'.');
  const c = DOOR_CONSTRUCTIONS.find((x) => x.id === input.construction);
  if (!c) throw new RangeError('Pick how the door is built.');
  const sqft = (input.widthIn * input.heightIn) / 144;
  const lowLb = Math.floor((sqft * c.lbPerSqFt.low) / 5) * 5;
  const highLb = Math.ceil((sqft * c.lbPerSqFt.high) / 5) * 5;
  const warnings: Warning[] = [
    { level: 'caution', message: 'Estimate only, from a few published doors. Weigh the door before ordering springs.' },
  ];
  if (input.windows) warnings.push({ level: 'caution', message: 'Windows add weight the estimate leaves out. Expect the door to be heavier.' });
  if (input.construction.startsWith('steel-') && input.construction !== 'steel-sandwich') {
    warnings.push({ level: 'info', message: 'Figures are for 25 gauge steel. A 24 gauge door is heavier; a 26 or 27 gauge door is lighter.' });
  }
  const sizeOfSource = 16 * 7 * 144;
  const area = input.widthIn * input.heightIn;
  if (area > sizeOfSource * 1.5 || area < 8 * 7 * 144 * 0.6) {
    warnings.push({ level: 'info', message: 'This size is far from the 8x7 and 16x7 doors the figures come from, so it is rougher still.' });
  }
  return { lowLb, highLb, construction: c, warnings };
}
