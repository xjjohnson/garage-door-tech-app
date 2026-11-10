import { describe, expect, it } from 'vitest';
import { matchOldSpring, sizeFromDoor } from '../src/calculator';
import { findWire } from '../src/springMath';
import { estimateLife, ippt, lengthForIppt, wireFromTwentyCoils, wireFromCaliper } from '../src/springMath';

describe('wire identification', () => {
  it('4-1/2" for 20 coils is .225', () => {
    expect(wireFromTwentyCoils(4.5)?.wire.nominal).toBe('.225');
    expect(wireFromTwentyCoils(4.5)?.ambiguous).toBe(false);
  });
  it('4-7/16" is flagged as between .218 and .225', () => {
    const m = wireFromTwentyCoils(4.4375);
    expect(m?.ambiguous).toBe(true);
  });
  it('a measurement far from any size returns nothing', () => {
    expect(wireFromTwentyCoils(7)).toBeUndefined();
  });
  it('caliper .226 reads as .225 (actual .2253)', () => {
    expect(wireFromCaliper(0.226)?.nominal).toBe('.225');
  });
});

describe('formula round trips', () => {
  it('lengthForIppt inverts ippt', () => {
    const len = lengthForIppt(0.2253, 2, 30);
    expect(ippt(0.2253, 2, len)).toBeCloseTo(30, 6);
  });
  it('life estimate never extrapolates past the chart', () => {
    const w = findWire(0.2253)!;
    expect(estimateLife(w, 2.5, 400).belowMinimum).toBe(true);
    expect(estimateLife(w, 2.5, 100).atOrAboveMaximum).toBe(true);
    const mid = estimateLife(w, 2.5, 240);
    expect(mid.cycles).toBeGreaterThan(15_000);
    expect(mid.cycles).toBeLessThan(25_000);
  });
});

describe('mode 1: match the old spring', () => {
  const base = {
    twentyCoilIn: 4.5,
    insideDiameterIn: 2,
    lengthIn: 24,
    wind: 'left' as const,
    springCount: 2 as const,
    doorHeightIn: 84,
  };

  it('describes a .225 x 2" x 24" pair on a 7\' door', () => {
    const r = matchOldSpring(base);
    expect(r.old.wire).toBe('.225');
    expect(r.turns).toBe(7.5);
    expect(r.old.ippt).toBeCloseTo(33.3, 0);
    expect(r.balancesDoorLb.high).toBeGreaterThan(240);
    expect(r.balancesDoorLb.high).toBeLessThan(255);
    // A standard 10,000-cycle spring on the conservative rating; more on the maker chart.
    expect(r.old.life.cycles).toBeGreaterThanOrEqual(10_000);
    expect(r.old.life.cycles).toBeLessThan(15_000);
    expect(r.old.makerChartLife.cycles).toBeGreaterThan(r.old.life.cycles);
    expect(r.warnings.filter((w) => w.level === 'stop')).toHaveLength(0);
  });

  it('every equivalent has the same IPPT within 2% and lasts at least as long', () => {
    const r = matchOldSpring(base);
    expect(r.equivalents.length).toBeGreaterThan(0);
    for (const e of r.equivalents) {
      expect(Math.abs(e.ippt - r.old.ippt) / r.old.ippt).toBeLessThan(0.02);
      expect(e.life.cycles).toBeGreaterThanOrEqual(r.old.life.cycles);
    }
  });

  it('upgrades use heavier wire, keep the rate, and reach the target', () => {
    const r = matchOldSpring(base);
    expect(r.upgrades.map((u) => u.targetCycles)).toEqual([25_000, 50_000]);
    for (const u of r.upgrades) {
      expect(u.spring.wireIn).toBeGreaterThan(r.old.wireIn);
      expect(u.spring.life.cycles).toBeGreaterThanOrEqual(u.targetCycles);
      expect(Math.abs(u.spring.ippt - r.old.ippt) / r.old.ippt).toBeLessThan(0.02);
      expect(u.spring.lengthIn).toBeGreaterThan(r.old.lengthIn);
    }
  });

  it('respects the shaft length limit', () => {
    const r = matchOldSpring({ ...base, maxLengthIn: 30 });
    for (const u of r.upgrades) expect(u.spring.lengthIn + u.spring.growthIn).toBeLessThanOrEqual(30);
  });

  it('stops on an ambiguous 20-coil measurement', () => {
    const r = matchOldSpring({ ...base, twentyCoilIn: 4.4375 });
    expect(r.warnings.some((w) => w.level === 'stop')).toBe(true);
  });

  it('rejects missing wire and missing height', () => {
    expect(() => matchOldSpring({ ...base, twentyCoilIn: undefined })).toThrow();
    expect(() => matchOldSpring({ ...base, doorHeightIn: undefined })).toThrow();
  });
});

describe('mode 2: size from the door', () => {
  it('164 lb, 7\' door, pair on 400-8: a .207 x 2" option within 1" of DDM\'s 22"', () => {
    const r = sizeFromDoor({ doorWeightLb: 164, doorHeightIn: 84, drum: '400-8', springCount: 2 });
    expect(r.turns).toBe(7.5);
    const opt = r.options.find((o) => o.wire === '.207');
    expect(opt).toBeDefined();
    expect(Math.abs(opt!.lengthIn - 22)).toBeLessThanOrEqual(1);
    expect(opt!.balancesDoorLb.low).toBeLessThanOrEqual(164);
    expect(opt!.balancesDoorLb.high).toBeGreaterThanOrEqual(164);
  });

  it('229 lb door: a .225 x 2" option within 1" of DDM\'s 24" (224-234 lb)', () => {
    const r = sizeFromDoor({ doorWeightLb: 229, doorHeightIn: 84, drum: '400-8', springCount: 2 });
    const opt = r.options.find((o) => o.wire === '.225');
    expect(opt).toBeDefined();
    expect(Math.abs(opt!.lengthIn - 24)).toBeLessThanOrEqual(1);
  });

  it('235 lb door: .225 drops out as under 10,000 cycles on the conservative rating, .234 is offered', () => {
    const r = sizeFromDoor({ doorWeightLb: 235, doorHeightIn: 84, drum: '400-8', springCount: 2 });
    expect(r.options.find((o) => o.wire === '.225')).toBeUndefined();
    expect(r.options.find((o) => o.wire === '.234')).toBeDefined();
  });

  it('every option meets the cycle target', () => {
    const r = sizeFromDoor({ doorWeightLb: 200, doorHeightIn: 84, drum: '400-8', springCount: 2, targetCycles: 25_000 });
    expect(r.options.length).toBeGreaterThan(0);
    for (const o of r.options) expect(o.life.cycles).toBeGreaterThanOrEqual(25_000);
  });

  it('says so when nothing fits', () => {
    const r = sizeFromDoor({ doorWeightLb: 900, doorHeightIn: 84, drum: '400-8', springCount: 1, targetCycles: 100_000 });
    expect(r.options).toHaveLength(0);
    expect(r.warnings.some((w) => w.level === 'stop')).toBe(true);
  });

  it('rejects an 8\'+ door on a 400-8 drum', () => {
    expect(() => sizeFromDoor({ doorWeightLb: 250, doorHeightIn: 120, drum: '400-8', springCount: 2 })).toThrow();
  });
});
