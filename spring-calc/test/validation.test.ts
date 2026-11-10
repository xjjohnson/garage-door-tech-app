/**
 * Checks the formulas against numbers printed by spring makers and suppliers.
 * Each case names its source. If one of these fails after a change, the
 * change broke agreement with a published chart: fix the code, not the test.
 */
import { describe, expect, it } from 'vitest';
import { LIFE_SERVICE_FACTOR, RATE_FACTOR_LOW, WIRES } from '../src/data';
import {
  allowableTorque,
  balancedWeight,
  doorTorque,
  estimateLife,
  findWire,
  ippt,
  rateConstant,
  springWeightLb,
  standardLiftTurns,
} from '../src/springMath';

const wire = (d: number) => {
  const w = findWire(d);
  if (!w) throw new Error(`wire ${d} missing from table`);
  return w;
};

/** Relative difference, as a fraction. */
const rel = (ours: number, theirs: number) => (ours - theirs) / theirs;

describe('Canimex spring charts (IDC Spring, RCI2_50 / RCI2_63 / RCI3_75)', () => {
  // [wire, coil ID, length, dead coils, IPPT printed on the chart]
  const ipptRows: [number, number, number, number, number][] = [
    [0.2253, 3.75, 9, 3, 51.6],
    [0.2253, 3.75, 23, 3, 19.2],
    [0.177, 2.5, 11, 5, 18.9],
    [0.177, 2.5, 58, 5, 3.3],
    [0.25, 2.63, 17, 5, 63.3],
    [0.25, 2.63, 21, 5, 50.5],
    [0.2253, 2.63, 14, 5, 46.4],
    [0.207, 2.63, 10, 5, 44.0],
    [0.273, 2.63, 20, 5, 82.4],
    [0.295, 2.63, 24, 5, 99.7],
  ];
  // The chart prints one decimal, so allow 1% or the 0.05 rounding, whichever is larger.
  it.each(ipptRows)('IPPT %s wire, %s" ID, %s" long matches the chart within 1%% (or print rounding)', (d, id, len, dead, chart) => {
    expect(Math.abs(ippt(d, id, len, dead) - chart)).toBeLessThanOrEqual(Math.max(0.05, 0.01 * chart));
  });

  // [wire, coil ID, rate constant K printed on the chart summary line]
  const rateRows: [number, number, number][] = [
    [0.177, 2.5, 1078],
    [0.2253, 2.5, 2780],
    [0.25, 2.5, 4177],
    [0.295, 2.5, 7969],
    [0.2253, 2.63, 2654],
    [0.2253, 3.75, 1906],
  ];
  it.each(rateRows)('rate constant %s wire on %s" ID is within 0.5%% of %s', (d, id, chart) => {
    expect(Math.abs(rel(rateConstant(d, id), chart))).toBeLessThan(0.005);
  });

  it('turns-at-life for .177 x 2.5" x 11" match the chart (7.3, 6.7, 6.1, 5.2, 4.5)', () => {
    const rate = ippt(0.177, 2.5, 11, 5);
    const chart = [7.3, 6.7, 6.1, 5.2, 4.5];
    chart.forEach((turns, i) => {
      expect(allowableTorque(wire(0.177), 2.5, i) / rate).toBeCloseTo(turns, 0);
      expect(Math.abs(allowableTorque(wire(0.177), 2.5, i) / rate - turns)).toBeLessThanOrEqual(0.08);
    });
  });

  // [wire, coil ID, weight per inch printed on the chart]
  const weightRows: [number, number, number][] = [
    [0.177, 2.5, 0.3311],
    [0.295, 2.5, 0.5762],
    [0.2253, 3.75, 0.6258],
  ];
  it.each(weightRows)('weight per inch %s wire on %s" ID within 1%% of %s lb', (d, id, chart) => {
    expect(Math.abs(rel(springWeightLb(d, id, 1), chart))).toBeLessThan(0.01);
  });

  it('MIP never rises above the chart value for larger IDs', () => {
    for (const w of WIRES) {
      for (let i = 0; i < 5; i++) {
        expect(allowableTorque(w, 3.75, i)).toBe(w.mipInLb[i]);
      }
    }
  });
});

describe('American Garage Door Supply product pages (2" and 1-3/4" ID)', () => {
  // [wire, ID, length, published IPPT, published turns at 10k, 25k, 50k, 100k]
  const rows: [number, number, number, number, [number, number, number, number]][] = [
    [0.2253, 2.0, 24, 32.83, [8.0, 6.7, 5.8, 4.9]],
    [0.207, 2.0, 22, 24.16, [8.8, 7.3, 6.3, 5.4]],
    [0.2253, 2.0, 43, 18.11, [14.6, 12.2, 10.5, 9.1]],
    [0.273, 2.0, 23, 90.69, [5.1, 4.2, 3.6, 3.1]],
    [0.2187, 1.75, 24, 32.63, [7.6, 6.3, 5.4, 4.7]],
    [0.2187, 1.75, 35, 22.05, [11.2, 9.3, 8.0, 6.9]],
  ];
  const lifeIdx = [0, 2, 3, 4]; // 10k, 25k, 50k, 100k in LIFE_POINTS

  it.each(rows)('IPPT %s x %s" x %s" within 2.5%% of %s', (d, id, len, published) => {
    expect(Math.abs(rel(ippt(d, id, len), published))).toBeLessThan(0.025);
  });

  it.each(rows)('max torque for %s x %s" ID is never more than 2%% above theirs, nor more than 5%% below', (d, id, _len, publishedIppt, turns) => {
    turns.forEach((t, k) => {
      const theirs = t * publishedIppt; // their MIP = turns x IPPT
      const ours = allowableTorque(wire(d), id, lifeIdx[k]!);
      expect(rel(ours, theirs)).toBeLessThan(0.02);
      expect(rel(ours, theirs)).toBeGreaterThan(-0.05);
    });
  });
});

describe('DDM Garage Doors spring pairs (7\' door, 4" drums)', () => {
  // [wire, ID, length, DDM door weight low, high]
  const rows: [number, number, number, number, number][] = [
    [0.207, 2.0, 22, 159, 169],
    [0.2253, 2.0, 23.5, 230, 240],
  ];
  it.each(rows)('pair of %s x %s" x %s" overlaps DDM\'s %s-%s lb range', (d, id, len, lo, hi) => {
    const turns = standardLiftTurns(84, '400-8');
    const high = balancedWeight(2 * ippt(d, id, len), turns, '400-8');
    const low = high * RATE_FACTOR_LOW;
    // Our range must overlap theirs.
    expect(low).toBeLessThanOrEqual(hi);
    expect(high).toBeGreaterThanOrEqual(lo);
  });
});

describe('DDM cycle ratings (7\' door, 4" drums, 15" radius track)', () => {
  // [wire, ID, length, DDM door weight midpoint, DDM rated cycles]
  const rows: [number, number, number, number, number][] = [
    [0.207, 2.0, 22, 164, 19_000],
    [0.2187, 2.0, 24, 197, 16_000],
  ];
  it.each(rows)('%s x %s" x %s" on a %s lb door rates within 15%% of DDM\'s %s cycles', (d, id, _len, door, cycles) => {
    const torquePerSpring = doorTorque(door, '400-8') / 2;
    const ours = estimateLife(wire(d), id, torquePerSpring * LIFE_SERVICE_FACTOR).cycles;
    expect(Math.abs(rel(ours, cycles))).toBeLessThan(0.15);
  });
});

describe('Turns and torque rules', () => {
  it('7\' door on 4" drums: 7-1/2 turns (DDM, Service Spring, Kinch)', () => {
    expect(standardLiftTurns(84, '400-8')).toBe(7.5);
  });
  it('8\' door on 4" drums: 8-1/2 turns (DDM)', () => {
    expect(standardLiftTurns(96, '400-8')).toBe(8.5);
  });
  it('rejects a 9\' door on a 400-8 drum', () => {
    expect(() => standardLiftTurns(108, '400-8')).toThrow();
  });
  it('350 lb on a 2" radius is 700 in-lb (Kinch)', () => {
    expect(doorTorque(350, '400-8')).toBe(700);
  });
  it('reproduces Dr. Drang\'s .234 x 1.75" spring at 136 active coils: 32.73 IPPT', () => {
    expect(rateConstant(0.234, 1.75) / 136).toBeCloseTo(32.73, 1);
  });
});
