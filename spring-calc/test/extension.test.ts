import { describe, expect, it } from 'vitest';
import { extensionColor, extensionSprings, ratingsForColor, springsForSide } from '../src/extension';

describe('extension spring colors (DASMA TDS-171, DDM)', () => {
  it('matches the published chart', () => {
    expect(extensionColor(100)).toBe('Tan');
    expect(extensionColor(110)).toBe('White');
    expect(extensionColor(140)).toBe('Blue');
    expect(extensionColor(150)).toBe('Red');
    expect(extensionColor(190)).toBe('Light Blue');
    expect(extensionColor(300)).toBe('Tan');
    expect(extensionColor(50)).toBe('Red');
  });
  it('lists every rating a color can be', () => {
    expect(ratingsForColor('Blue')).toEqual([40, 140, 240]);
    expect(ratingsForColor('Tan')).toEqual([100, 200, 300]);
    expect(ratingsForColor('Red')).toEqual([50, 150, 250]);
  });
  it('rejects ratings off the 10 lb steps', () => {
    expect(() => extensionColor(145)).toThrow();
  });
});

describe('sizing from the door weight', () => {
  it('a 100 lb 7\' door takes two 100 lb springs, 25 x 42 (DDM 25-42-100)', () => {
    const r = extensionSprings({ doorHeightIn: 84, springsPerSide: 1, doorWeightLb: 100 });
    expect(r.perSide).toEqual([{ ratingLb: 100, color: 'Tan' }]);
    expect(r.springCount).toBe(2);
    expect(r.lengthIn).toBe(25);
    expect(r.stretchIn).toBe(42);
  });
  it('rounds down between ratings (DDM: select the lower weight)', () => {
    const r = extensionSprings({ doorHeightIn: 96, springsPerSide: 1, doorWeightLb: 147 });
    expect(r.perSide?.[0]?.ratingLb).toBe(140);
    expect(r.lengthIn).toBe(27);
    expect(r.stretchIn).toBe(48);
    expect(r.warnings.some((w) => /rounded down/.test(w.message))).toBe(true);
  });
  it("DDM's four-spring example: 214 lb takes 110 + 100 a side", () => {
    expect(springsForSide(214, 2).map((s) => s.ratingLb)).toEqual([110, 100]);
    const r = extensionSprings({ doorHeightIn: 84, springsPerSide: 2, doorWeightLb: 214 });
    expect(r.springCount).toBe(4);
    expect(r.liftsLb).toBe(210);
  });
  it('stops on a spring heavier than stock', () => {
    const r = extensionSprings({ doorHeightIn: 84, springsPerSide: 1, doorWeightLb: 600 });
    expect(r.warnings.some((w) => w.level === 'stop')).toBe(true);
  });
  it('flags old springs that disagree with the weighed door', () => {
    const r = extensionSprings({ doorHeightIn: 84, springsPerSide: 1, doorWeightLb: 150, old: { color: 'Tan' } });
    expect(r.perSide?.[0]?.ratingLb).toBe(150);
    expect(r.warnings.some((w) => w.level === 'caution' && /Tan springs/.test(w.message))).toBe(true);
  });
  it('a matching old color raises no mismatch', () => {
    const r = extensionSprings({ doorHeightIn: 84, springsPerSide: 1, doorWeightLb: 145, old: { color: 'Blue' } });
    expect(r.warnings.some((w) => /none close/.test(w.message))).toBe(false);
  });
});

describe('matching the old springs', () => {
  it('a color alone is a STOP: it repeats every 100 lb', () => {
    const r = extensionSprings({ doorHeightIn: 84, springsPerSide: 1, old: { color: 'Blue' } });
    expect(r.perSide).toBeUndefined();
    expect(r.colorCandidatesLb).toEqual([40, 140, 240]);
    expect(r.warnings[0]?.level).toBe('stop');
  });
  it('the tag rating is used as is', () => {
    const r = extensionSprings({ doorHeightIn: 84, springsPerSide: 1, old: { ratingLb: 140, color: 'Red' } });
    expect(r.perSide).toEqual([{ ratingLb: 140, color: 'Blue' }]);
    expect(r.basis).toBe('old tag');
    expect(r.warnings.some((w) => /not Red/.test(w.message))).toBe(true);
  });
  it('a shorter stock spring needs 2" of cable per inch', () => {
    const r = extensionSprings({ doorHeightIn: 84, springsPerSide: 1, old: { ratingLb: 140, lengthIn: 26 } });
    expect(r.warnings.some((w) => /2" more cable/.test(w.message) && /\(2"/.test(w.message))).toBe(true);
  });
  it('the 29" length counts as stock on an 8\' door', () => {
    const r = extensionSprings({ doorHeightIn: 96, springsPerSide: 1, old: { ratingLb: 100, lengthIn: 29 } });
    expect(r.warnings.some((w) => /stock one/.test(w.message))).toBe(false);
  });
  it('needs a weight, a tag or a color', () => {
    expect(() => extensionSprings({ doorHeightIn: 84, springsPerSide: 1 })).toThrow();
  });
  it('a height with no stock size orders by stretch', () => {
    const r = extensionSprings({ doorHeightIn: 90, springsPerSide: 1, doorWeightLb: 130 });
    expect(r.lengthIn).toBeUndefined();
    expect(r.stretchIn).toBe(45);
  });
});
