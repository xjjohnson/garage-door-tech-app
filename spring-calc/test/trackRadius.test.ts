/**
 * Track radius (12" or 15"), checked against the standard-lift multiplier
 * tables in Canimex's cable drum manual (D400-96 and D400-144). Only the
 * numbers are copied, in data.ts and below. 15" is the default and must
 * leave every result exactly as it was before the choice existed.
 */
import { describe, expect, it } from 'vitest';
import { CANIMEX_STANDARD_LIFT_MULTIPLIERS, DRUMS, DrumId, RATE_FACTOR_MID } from '../src/data';
import { heightForTurns, standardLiftTurns, trackRadiusFactor } from '../src/springMath';
import { matchOldSpring, sizeFromDoor } from '../src/calculator';

const rel = (ours: number, theirs: number) => (ours - theirs) / theirs;

describe('Canimex standard-lift multiplier table', () => {
  it.each(['400-8', '400-12'] as DrumId[])('%s rows go up in height, and 12" track always takes the larger multiplier', (drum) => {
    const rows = CANIMEX_STANDARD_LIFT_MULTIPLIERS[drum];
    rows.forEach((r, i) => {
      expect(r[1]).toBeGreaterThan(r[2]);
      if (i > 0) expect(r[0]).toBeGreaterThan(rows[i - 1]![0]);
    });
  });

  it('the drums reach the heights Canimex lists them for (98" and 148")', () => {
    expect(CANIMEX_STANDARD_LIFT_MULTIPLIERS['400-8'].at(-1)![0]).toBe(98);
    expect(CANIMEX_STANDARD_LIFT_MULTIPLIERS['400-12'].at(-1)![0]).toBe(148);
  });

  // Turns on spring as printed beside each multiplier: [drum, height, 12" turns, 15" turns].
  // Multiplier = high moment arm / turns, so this catches a mistyped multiplier.
  const turnsRows: [DrumId, number, number, number][] = [
    ['400-8', 72, 6.7, 7.1],
    ['400-8', 84, 7.6, 7.9],
    ['400-8', 96, 8.5, 8.8],
    ['400-12', 84, 7.6, 7.9],
    ['400-12', 120, 10.3, 10.5],
    ['400-12', 144, 12.1, 12.4],
  ];
  it.each(turnsRows)('%s at %s": multipliers are the high moment arm over %s and %s turns, within 1%%', (drum, h, t12, t15) => {
    const row = CANIMEX_STANDARD_LIFT_MULTIPLIERS[drum].find((r) => r[0] === h)!;
    const hma = DRUMS[drum].highMomentArmIn;
    // The printed turns are rounded to 0.1, which alone can be 0.7% off.
    expect(Math.abs(rel(hma / t12, row[1]))).toBeLessThan(0.01);
    expect(Math.abs(rel(hma / t15, row[2]))).toBeLessThan(0.01);
  });
});

describe('trackRadiusFactor', () => {
  it('is 1 on 15" track at any height', () => {
    for (const h of [60, 84, 96, 130]) {
      expect(trackRadiusFactor(15, '400-8', h)).toBe(1);
      expect(trackRadiusFactor(15, '400-12', h)).toBe(1);
    }
  });

  it('is Canimex\'s 15" multiplier over its 12" one: 0.962 for a 7\' door on 400-8 drums', () => {
    expect(trackRadiusFactor(12, '400-8', 84)).toBeCloseTo(0.2866 / 0.298, 6);
    expect(trackRadiusFactor(12, '400-8', 84)).toBeCloseTo(0.962, 3);
  });

  it('interpolates between rows and holds the end rows outside the table', () => {
    const a = trackRadiusFactor(12, '400-8', 84);
    const b = trackRadiusFactor(12, '400-8', 87);
    const mid = trackRadiusFactor(12, '400-8', 85.5);
    expect(mid).toBeCloseTo((a + b) / 2, 6);
    expect(trackRadiusFactor(12, '400-8', 60)).toBe(trackRadiusFactor(12, '400-8', 72));
    expect(trackRadiusFactor(12, '400-8', 120)).toBe(trackRadiusFactor(12, '400-8', 98));
  });

  it(`stays between 0.95 and 0.98 on both drums: 12" track costs 2% (12' door) to 5% (6' door)`, () => {
    for (const drum of ['400-8', '400-12'] as DrumId[]) {
      for (let h = 60; h <= 150; h += 3) {
        const f = trackRadiusFactor(12, drum, h);
        expect(f).toBeGreaterThan(0.95);
        expect(f).toBeLessThan(0.985);
      }
    }
  });

  it('rejects a radius it has no chart for', () => {
    expect(() => trackRadiusFactor(14 as 12, '400-8', 84)).toThrow(/12" or 15"/);
  });

  it('heightForTurns undoes the turns rule before rounding', () => {
    const exact = 84 / (2 * Math.PI * 2) + 1;
    expect(heightForTurns(exact, '400-8')).toBeCloseTo(84, 6);
    expect(heightForTurns(0.5, '400-8')).toBe(0);
  });
});

describe('Mode 2 (size from the door) on 12" and 15" track', () => {
  const door = { doorWeightLb: 164, doorHeightIn: 84, drum: '400-8' as const, springCount: 2 as const };

  it('15" is the default and gives the same answer as before', () => {
    expect(sizeFromDoor(door)).toEqual(sizeFromDoor({ ...door, trackRadiusIn: 15 }));
    expect(sizeFromDoor(door).trackRadiusIn).toBe(15);
  });

  it('12" track orders each wire about 4% stronger (shorter), with the same cycle life', () => {
    const on15 = sizeFromDoor({ ...door, trackRadiusIn: 15 });
    const on12 = sizeFromDoor({ ...door, trackRadiusIn: 12 });
    expect(on12.trackRadiusIn).toBe(12);
    for (const o12 of on12.options) {
      const o15 = on15.options.find((o) => o.wire === o12.wire && o.insideDiameterIn === o12.insideDiameterIn);
      if (!o15) continue;
      expect(o12.lengthIn).toBeLessThanOrEqual(o15.lengthIn);
      expect(o12.ippt).toBeGreaterThanOrEqual(o15.ippt);
      expect(o12.life.cycles).toBe(o15.life.cycles);
    }
    const first12 = on12.options[0]!;
    const first15 = on15.options[0]!;
    expect(first12.wire).toBe('.207');
    expect(first12.lengthIn).toBe(22);
    expect(first15.lengthIn).toBe(23);
  });

  it.each([12, 15] as const)('on %s" track every option balances a range that holds the door weight', (track) => {
    for (const drum of ['400-8', '400-12'] as const) {
      for (const h of [78, 84, 96]) {
        const r = sizeFromDoor({ ...door, doorHeightIn: h, drum, trackRadiusIn: track });
        for (const o of r.options) {
          expect(o.balancesDoorLb.low).toBeLessThanOrEqual(door.doorWeightLb * 1.02);
          expect(o.balancesDoorLb.high).toBeGreaterThanOrEqual(door.doorWeightLb * 0.98);
        }
      }
    }
  });

  it('ends up the same distance from Canimex\'s own sizing on both radii', () => {
    // Spring set rate Mode 2 aims for, per lb of door, vs Canimex's multiplier.
    const turns = standardLiftTurns(84, '400-8');
    const row = CANIMEX_STANDARD_LIFT_MULTIPLIERS['400-8'].find((r) => r[0] === 84)!;
    const ours = (track: 12 | 15) => 2 / turns / (RATE_FACTOR_MID * trackRadiusFactor(track, '400-8', 84));
    const gap12 = rel(ours(12), row[1]);
    const gap15 = rel(ours(15), row[2]);
    expect(Math.abs(gap12 - gap15)).toBeLessThan(0.001);
    expect(Math.abs(gap15)).toBeLessThan(0.04);
  });
});

describe('Mode 1 (match the old spring) on 12" and 15" track', () => {
  const old = { twentyCoilIn: 4.5, insideDiameterIn: 2, lengthIn: 24, wind: 'left' as const, springCount: 2 as const, doorHeightIn: 84 };

  it('15" is the default and gives the same answer as before', () => {
    expect(matchOldSpring(old)).toEqual(matchOldSpring({ ...old, trackRadiusIn: 15 }));
  });

  it('12" track lowers the door the springs balance by the track factor and changes nothing else', () => {
    const on15 = matchOldSpring({ ...old, trackRadiusIn: 15 });
    const on12 = matchOldSpring({ ...old, trackRadiusIn: 12 });
    const f = trackRadiusFactor(12, '400-8', 84);
    expect(on12.balancesDoorLb.low).toBeCloseTo(on15.balancesDoorLb.low * f, 6);
    expect(on12.balancesDoorLb.high).toBeCloseTo(on15.balancesDoorLb.high * f, 6);
    // Same spring, same turns, same stress: the replacements don't move.
    expect(on12.old).toEqual(on15.old);
    expect(on12.equivalents).toEqual(on15.equivalents);
    expect(on12.upgrades).toEqual(on15.upgrades);
    expect(on12.turns).toBe(on15.turns);
  });

  it('with turns entered and no door height, looks the factor up at the height those turns imply', () => {
    const { doorHeightIn: _h, ...noHeight } = old;
    const on15 = matchOldSpring({ ...noHeight, turns: 9.5, trackRadiusIn: 15 });
    const on12 = matchOldSpring({ ...noHeight, turns: 9.5, trackRadiusIn: 12 });
    const f = trackRadiusFactor(12, '400-8', heightForTurns(9.5, '400-8'));
    expect(heightForTurns(9.5, '400-8')).toBeCloseTo(106.8, 1);
    expect(on12.balancesDoorLb.high / on15.balancesDoorLb.high).toBeCloseTo(f, 6);
  });
});
