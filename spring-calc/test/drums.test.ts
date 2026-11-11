import { describe, expect, it } from 'vitest';
import { D400_54_CHART, D400_54_HEIGHTS_IN, d400_54, drumsThatFit, highLiftD400_54 } from '../src/drums';

/** Turns Canimex prints on the D400-54 chart (p. 28), [high lift, door height, turns]. */
const PRINTED_TURNS: [number, number, number][] = [
  [0, 72, 6.3], [0, 84, 7.2], [0, 120, 9.9], [3, 72, 6.6], [21, 72, 8.4], [21, 120, 11.6],
  [24, 96, 10.2], [36, 84, 10.7], [42, 72, 11.3], [42, 120, 13.1], [45, 90, 11.8],
];

describe('D400-54 high-lift chart', () => {
  it('HMA / multiplier gives the printed turns on every check point', () => {
    for (const [lift, h, t] of PRINTED_TURNS) {
      const row = D400_54_CHART.find((r) => r[0] === lift)!;
      const m = row[2][D400_54_HEIGHTS_IN.indexOf(h as (typeof D400_54_HEIGHTS_IN)[number])]!;
      expect(Math.abs(row[1] / m - t)).toBeLessThanOrEqual(0.051);
    }
  });
  it('every row is consistent: turns rise with high lift and door height', () => {
    for (let i = 1; i < D400_54_CHART.length; i++) {
      const a = D400_54_CHART[i - 1]!;
      const b = D400_54_CHART[i]!;
      b[2].forEach((m, j) => expect(b[1] / m).toBeGreaterThan(a[1] / a[2][j]!));
    }
  });
  it('interpolates between rows and columns', () => {
    const mid = d400_54(87, 22.5);
    expect(mid.turns).toBeGreaterThan(d400_54(84, 21).turns);
    expect(mid.turns).toBeLessThan(d400_54(90, 24).turns);
    expect(d400_54(84, 36).turns).toBeCloseTo(10.66, 1);
  });
  it('refuses to extrapolate', () => {
    expect(() => d400_54(126, 12)).toThrow();
    expect(() => d400_54(96, 45)).toThrow();
    expect(() => d400_54(84, 45)).not.toThrow();
  });
});

describe('high lift on D400-54', () => {
  it('7\' door, 36" high lift, 150 lb pair', () => {
    const r = highLiftD400_54({ doorHeightIn: 84, highLiftIn: 36, doorWeightLb: 150, springCount: 2 });
    expect(r.turns).toBe(10.5);
    // IPPT = 0.2451 x 150 / 2
    expect(r.ipptPerSpring).toBeCloseTo(18.38, 1);
    expect(r.options.length).toBeGreaterThan(0);
    for (const o of r.options) expect(Math.abs(o.ippt - r.ipptPerSpring) / r.ipptPerSpring).toBeLessThan(0.05);
  });
  it('cable: floor to shaft center + 63" - high lift', () => {
    const r = highLiftD400_54({ doorHeightIn: 84, highLiftIn: 36, doorWeightLb: 150, springCount: 2, floorToShaftCenterIn: 126 });
    expect(r.cableLengthIn).toBe(126 + 63 - 36);
  });
  it('stops past the drum rating', () => {
    const r = highLiftD400_54({ doorHeightIn: 96, highLiftIn: 24, doorWeightLb: 600, springCount: 2 });
    expect(r.warnings.some((w) => w.level === 'stop' && /D525-54/.test(w.message))).toBe(true);
  });
});

describe('which drum fits', () => {
  it('a 7\' 200 lb door fits a 400-8 (D400-96)', () => {
    const fits = drumsThatFit({ lift: 'standard', doorHeightIn: 84, doorWeightLb: 200 });
    expect(fits.find((f) => f.drum.model === 'D400-96')?.fits).toBe(true);
  });
  it('an 800 lb door is too heavy for 4" drums', () => {
    const fits = drumsThatFit({ lift: 'standard', doorHeightIn: 96, doorWeightLb: 800, floorToShaftCenterIn: 110 });
    expect(fits.find((f) => f.drum.model === 'D400-144')?.fits).toBe(false);
    const d525 = fits.find((f) => f.drum.model === 'D525-216')!;
    expect(d525.fits).toBe(true);
    expect(d525.cableLengthIn).toBe(120);
  });
  it('high lift checks the flat capacity: door height minus high lift', () => {
    const fits = drumsThatFit({ lift: 'high', doorHeightIn: 168, highLiftIn: 30 });
    expect(fits.find((f) => f.drum.model === 'D400-54')?.fits).toBe(false);
    expect(fits.find((f) => f.drum.model === 'D525-54')?.fits).toBe(true);
  });
  it('vertical lift lists the three vertical drums', () => {
    expect(drumsThatFit({ lift: 'vertical', doorHeightIn: 144, doorWeightLb: 800 }).filter((f) => f.fits).map((f) => f.drum.model)).toEqual(['D1100-216', 'D1350-336']);
  });
});
