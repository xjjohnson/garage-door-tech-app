/**
 * Checks against a second set of reference sheets: Canimex's 1.75" and
 * 2.00" spring charts and its cable drum manual, Service Spring's
 * weight-per-inch chart and ordering sheet, DASMA's color sheet #171, DDM's
 * measuring guide, the industry cable length rule, and a worked example from
 * the Spring Engineering app. Only the numbers are copied, each next to its
 * source. If one of these fails after a change, the change broke agreement
 * with a published chart: fix the code, not the test.
 */
import { describe, expect, it } from 'vitest';
import { DRUMS, LIFE_SERVICE_FACTOR, RATE_FACTOR_LOW, WIRES } from '../src/data';
import {
  allowableTorque,
  balancedWeight,
  cableLengthIn,
  findWire,
  ippt,
  lengthForIppt,
  rateConstant,
  springWeightLb,
  standardLiftTurns,
  wireFromTwentyCoils,
} from '../src/springMath';
import { matchOldSpring, sizeFromDoor } from '../src/calculator';

const rel = (ours: number, theirs: number) => (ours - theirs) / theirs;
const wire = (d: number) => {
  const w = findWire(d);
  if (!w) throw new Error(`wire ${d} missing from table`);
  return w;
};

describe('Canimex 1.75" and 2.00" spring charts', () => {
  // [wire, coil ID, rate constant K, weight per inch], from each chart's summary line
  const rows: [number, number, number, number][] = [
    [0.177, 1.75, 1498, 0.2383],
    [0.207, 1.75, 2759, 0.2831],
    [0.2187, 1.75, 3417, 0.3009],
    [0.25, 1.75, 5744, 0.3494],
    [0.177, 2.0, 1326, 0.2693],
    [0.207, 2.0, 2446, 0.3192],
    [0.2253, 2.0, 3405, 0.3503],
    [0.2437, 2.0, 4623, 0.3821],
    [0.295, 2.0, 9705, 0.4731],
  ];
  it.each(rows)('%s wire on %s" ID: rate constant within 0.5%% of %s, weight within 0.5%% of %s lb/in', (d, id, k, wpi) => {
    expect(Math.abs(rel(rateConstant(d, id), k))).toBeLessThan(0.005);
    expect(Math.abs(rel(springWeightLb(d, id, 1), wpi))).toBeLessThan(0.005);
  });

  // MIP at 10k, 15k, 25k, 50k, 100k cycles, as printed for each ID.
  // The 2.00" chart prints the same MIP as the 2.5" chart for every wire.
  const mipRows: [number, number, number[]][] = [
    [0.177, 1.75, [137, 127, 114, 98, 85]],
    [0.1875, 1.75, [161, 149, 134, 115, 99]],
    [0.207, 1.75, [212, 196, 177, 152, 131]],
    [0.2187, 1.75, [247, 229, 206, 177, 153]],
    [0.2253, 1.75, [268, 249, 224, 193, 166]],
    [0.25, 1.75, [358, 332, 300, 257, 222]],
    [0.2625, 1.75, [411, 381, 343, 295, 254]],
    [0.177, 2.0, [137, 127, 115, 98, 85]],
    [0.207, 2.0, [212, 197, 177, 152, 131]],
    [0.2253, 2.0, [269, 249, 225, 193, 166]],
    [0.2437, 2.0, [334, 310, 280, 240, 207]],
    [0.295, 2.0, [570, 528, 477, 409, 352]],
  ];
  it.each(mipRows)('max torque for %s on %s" ID is never above the chart and at most 4%% below it', (d, id, chart) => {
    chart.forEach((mip, i) => {
      const ours = allowableTorque(wire(d), id, i);
      expect(ours).toBeLessThanOrEqual(mip + 0.5); // the chart rounds to whole in-lb
      expect(ours).toBeGreaterThanOrEqual(mip * 0.96);
    });
  });

  it('the 2.5" MIP table in data.ts is the same as the 2.00" chart for every wire', () => {
    const printed2in: Record<string, number[]> = {
      '.177': [137, 127, 115, 98, 85],
      '.187': [161, 149, 135, 116, 99],
      '.192': [172, 159, 144, 123, 106],
      '.207': [212, 197, 177, 152, 131],
      '.218': [247, 229, 207, 178, 153],
      '.225': [269, 249, 225, 193, 166],
      '.234': [299, 277, 250, 214, 185],
      '.243': [334, 310, 280, 240, 207],
      '.250': [359, 333, 300, 258, 222],
      '.262': [411, 382, 344, 295, 254],
      '.273': [459, 426, 384, 330, 284],
      '.283': [507, 471, 424, 364, 314],
      '.289': [538, 499, 450, 386, 333],
      '.295': [570, 528, 477, 409, 352],
    };
    for (const w of WIRES) expect([...w.mipInLb]).toEqual(printed2in[w.nominal]);
  });
});

describe('Service Spring weight-per-inch chart (1-3/4", 2", 2-5/8" columns)', () => {
  // [wire as printed, lb per inch at 1.75", 2", 2.625" ID]
  const rows: [number, number, number, number][] = [
    [0.177, 0.2382, 0.2691, 0.3463],
    [0.1875, 0.2537, 0.2864, 0.3682],
    [0.192, 0.2604, 0.2939, 0.3777],
    [0.207, 0.2829, 0.319, 0.4094],
    [0.2187, 0.3007, 0.3389, 0.4344],
    [0.2253, 0.3108, 0.3501, 0.4485],
    [0.2343, 0.3248, 0.3657, 0.4681],
    [0.2437, 0.3393, 0.3818, 0.4882],
    [0.25, 0.3491, 0.3928, 0.5019],
    [0.2625, 0.3689, 0.4147, 0.5293],
    [0.273, 0.3872, 0.4351, 0.5547],
    [0.283, 0.4017, 0.4511, 0.5746],
    [0.289, 0.4123, 0.4628, 0.5892],
  ];
  it.each(rows)('%s wire matches within 0.5%%', (d, a, b, c) => {
    expect(Math.abs(rel(springWeightLb(d, 1.75, 1), a))).toBeLessThan(0.005);
    expect(Math.abs(rel(springWeightLb(d, 2.0, 1), b))).toBeLessThan(0.005);
    expect(Math.abs(rel(springWeightLb(d, 2.625, 1), c))).toBeLessThan(0.005);
  });

  it('.295 row runs 1.3% heavier than the formula; Canimex agrees with the formula', () => {
    // Service Spring prints 0.4788 lb/in at 2"; Canimex's 2.00" chart prints 0.4731.
    expect(Math.abs(rel(springWeightLb(0.295, 2.0, 1), 0.4788))).toBeLessThan(0.015);
    expect(Math.abs(rel(springWeightLb(0.295, 2.0, 1), 0.4731))).toBeLessThan(0.002);
  });

  it('reproduces the worked example: .2437 x 2" x 28.5" weighs 10.88 lb', () => {
    expect(springWeightLb(0.2437, 2.0, 28.5)).toBeCloseTo(10.88, 1);
  });
});

describe('DASMA color sheet #171 and Service Spring ordering sheet', () => {
  const dasma: Record<string, string> = {
    '.177': 'Gold',
    '.187': 'Blue',
    '.192': 'Orange',
    '.207': 'Yellow',
    '.218': 'White',
    '.225': 'Red',
    '.234': 'Brown',
    '.243': 'Green',
    '.250': 'Gold',
    '.262': 'Blue',
    '.273': 'Orange',
    '.283': 'Light Blue',
    '.289': 'Yellow',
    '.295': 'White',
  };
  it('every wire has the DASMA color', () => {
    for (const w of WIRES) expect(w.color).toBe(dasma[w.nominal]);
  });
});

describe('20-coil lengths (DDM measuring guide, Service Spring wire chart)', () => {
  it('every 20-coil length is within 0.04" of 20 wire diameters', () => {
    // .177 (3-1/2") and .273 (5-1/2") are the furthest off, by 0.04". DASMA's
    // 4-5/8" for .234 was 0.06" off, which is why the table uses DDM's 4-11/16".
    for (const w of WIRES) expect(Math.abs(w.twentyCoilIn! - 20 * w.diameterIn)).toBeLessThanOrEqual(0.04 + 1e-9);
  });
  it('4-11/16" reads as .234 without doubt (DDM)', () => {
    const m = wireFromTwentyCoils(4 + 11 / 16);
    expect(m?.wire.nominal).toBe('.234');
    expect(m?.ambiguous).toBe(false);
  });
});

describe('Spring Engineering app example ("correct springs without a scale")', () => {
  it('.2187 x 2" x 25" is within 1% of the 27.74 IPPT the app gives', () => {
    expect(Math.abs(rel(ippt(0.2187, 2.0, 25), 27.74))).toBeLessThan(0.01);
  });
  it('a pair balanced at 10-1/2 turns needs .234 x 2" about 25-1/2" long at 7.64 turns', () => {
    const neededPerSpring = (2 * 27.74 * 10.5) / 7.64 / 2; // 38.13 IPPT
    expect(neededPerSpring).toBeCloseTo(38.13, 1);
    // The example lands on 25.55"; we're within half an inch, so the same 25-1/2" spring.
    expect(Math.abs(lengthForIppt(0.2343, 2.0, neededPerSpring) - 25.55)).toBeLessThan(0.5);
  });
});

describe('Canimex cable drum manual (D400-96 and D400-144)', () => {
  // Canimex multiplier = high moment arm / turns on spring, for a 7' door.
  // [drum, 12" track multiplier, turns, 15" track multiplier, turns]
  const rows: ['400-8' | '400-12', number, number, number, number][] = [
    ['400-8', 0.298, 7.6, 0.2866, 7.9],
    ['400-12', 0.3026, 7.6, 0.291, 7.9],
  ];

  it.each(rows)('%s: multipliers are the high moment arm over the turns, within 1%%', (drum, m12, t12, m15, t15) => {
    expect(Math.abs(rel(DRUMS[drum].highMomentArmIn / t12, m12))).toBeLessThan(0.01);
    expect(Math.abs(rel(DRUMS[drum].highMomentArmIn / t15, m15))).toBeLessThan(0.01);
  });

  it.each(rows)('%s: Canimex lifts a spring set for 0.88-0.93x our figure, within 0.04 of RATE_FACTOR_LOW', (drum, m12, _t12, m15) => {
    const totalIppt = 2 * ippt(0.207, 2.0, 22);
    const ours = balancedWeight(totalIppt, standardLiftTurns(84, '400-8'), drum);
    const on12 = totalIppt / m12 / ours; // 12" radius track: 0.895 (400-8), 0.881 (400-12)
    const on15 = totalIppt / m15 / ours; // 15" radius track: 0.930 (400-8), 0.916 (400-12)
    expect(on12).toBeLessThan(on15);
    expect(on12).toBeLessThan(RATE_FACTOR_LOW);
    expect(Math.abs(on12 - RATE_FACTOR_LOW)).toBeLessThan(0.04);
    expect(Math.abs(on15 - RATE_FACTOR_LOW)).toBeLessThan(0.04);
  });

  it('LIFE_SERVICE_FACTOR is within 2% of the D400-96 high moment arm over 2"', () => {
    expect(Math.abs(rel(LIFE_SERVICE_FACTOR, DRUMS['400-8'].highMomentArmIn / DRUMS['400-8'].cableRadiusIn))).toBeLessThan(0.02);
  });
});

describe('Cable length (floor to shaft center + 8" for 400-8 and 400-12)', () => {
  it('a shaft 96" off the floor takes 104" cables', () => {
    expect(cableLengthIn(96, '400-8')).toBe(104);
    expect(cableLengthIn(96, '400-12')).toBe(104);
  });
  it('rejects a missing or silly measurement', () => {
    expect(() => cableLengthIn(0, '400-8')).toThrow();
    expect(() => cableLengthIn(300, '400-8')).toThrow();
  });
  it('both modes return it when floor to shaft center is entered, and only then', () => {
    const door = { doorWeightLb: 164, doorHeightIn: 84, drum: '400-8' as const, springCount: 2 as const };
    expect(sizeFromDoor({ ...door, floorToShaftCenterIn: 94 }).cableLengthIn).toBe(102);
    expect(sizeFromDoor(door).cableLengthIn).toBeUndefined();
    const old = { twentyCoilIn: 4.5, insideDiameterIn: 2, lengthIn: 24, wind: 'left' as const, springCount: 2 as const, doorHeightIn: 84 };
    expect(matchOldSpring({ ...old, floorToShaftCenterIn: 94 }).cableLengthIn).toBe(102);
    expect(matchOldSpring(old).cableLengthIn).toBeUndefined();
  });
  it('refuses a shaft below the top of the door', () => {
    expect(() => sizeFromDoor({ doorWeightLb: 164, doorHeightIn: 84, drum: '400-8', springCount: 2, floorToShaftCenterIn: 80 })).toThrow(/more than the door height/);
  });
});
