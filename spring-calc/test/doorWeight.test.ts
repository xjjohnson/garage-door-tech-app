import { describe, expect, it } from 'vitest';
import { estimateDoorWeight } from '../src/doorWeight';

describe('door weight estimate', () => {
  it('gives back the published doors it came from', () => {
    expect(estimateDoorWeight({ widthIn: 192, heightIn: 84, construction: 'steel-plain' })).toMatchObject({ lowLb: 150, highLb: 160 });
    expect(estimateDoorWeight({ widthIn: 96, heightIn: 84, construction: 'steel-plain' })).toMatchObject({ lowLb: 75, highLb: 80 });
    expect(estimateDoorWeight({ widthIn: 192, heightIn: 84, construction: 'steel-insulated' })).toMatchObject({ lowLb: 165, highLb: 180 });
    expect(estimateDoorWeight({ widthIn: 96, heightIn: 84, construction: 'steel-insulated' })).toMatchObject({ lowLb: 80, highLb: 90 });
    expect(estimateDoorWeight({ widthIn: 192, heightIn: 84, construction: 'steel-sandwich' })).toMatchObject({ lowLb: 260, highLb: 260 });
    expect(estimateDoorWeight({ widthIn: 192, heightIn: 84, construction: 'wood-older' })).toMatchObject({ lowLb: 350, highLb: 360 });
  });
  it('scales with area', () => {
    const r = estimateDoorWeight({ widthIn: 108, heightIn: 84, construction: 'wood-newer' });
    expect(r.lowLb).toBe(135); // 63 sq ft x 2.14
    expect(r.highLb).toBe(145);
  });
  it('always says to weigh the door, and flags windows', () => {
    const r = estimateDoorWeight({ widthIn: 192, heightIn: 84, construction: 'steel-sandwich', windows: true });
    expect(r.warnings[0]?.message).toMatch(/Weigh the door/);
    expect(r.warnings.some((w) => /Windows/.test(w.message))).toBe(true);
  });
  it('rejects silly sizes', () => {
    expect(() => estimateDoorWeight({ widthIn: 10, heightIn: 84, construction: 'steel-plain' })).toThrow();
  });
});
