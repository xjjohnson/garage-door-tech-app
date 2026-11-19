import { BUTTON_PX, brandPalette, cleanBrandColor, contrast, LEGACY_LOOK, nudge, parsePalette, parseShape, parseSize, scaleBorder, scaleFont, scaleHeight, scaleRadius, SIZES } from '../lib/themeLook';

describe('themeLook', () => {
  it('legacy changes nothing', () => {
    expect(scaleRadius(14, 'round')).toBe(14);
    expect(scaleFont(18, 'legacy')).toBe(18);
    expect(scaleHeight(56, 'legacy')).toBe(56);
    expect(scaleBorder(1.5, 'round')).toBe(1.5);
    expect(LEGACY_LOOK).toEqual({ shape: 'round', size: 'legacy', palette: 'johnsons' });
  });
  it('square caps corners but keeps pills; borders get firmer', () => {
    expect(scaleRadius(16, 'square')).toBe(3);
    expect(scaleRadius(2, 'square')).toBe(2);
    expect(scaleRadius(999, 'square')).toBe(999);
    expect(scaleBorder(1, 'square')).toBe(2);
    expect(scaleBorder(0, 'square')).toBe(0);
  });
  it('sizes shrink buttons to the planned heights and never below the floors', () => {
    expect(SIZES.map((s) => BUTTON_PX[s.value])).toEqual([56, 48, 44, 40]);
    expect(scaleHeight(56, 'compact')).toBe(44);
    expect(scaleHeight(56, 'tight')).toBe(40);
    expect(scaleFont(18, 'compact')).toBe(15);
    expect(scaleFont(13, 'tight')).toBeGreaterThanOrEqual(12);
  });
  it('unknown saved values fall back to legacy', () => {
    expect(parseShape('x')).toBe('round');
    expect(parseSize(undefined)).toBe('legacy');
    expect(parsePalette(3)).toBe('johnsons');
    expect(parseSize('tight')).toBe('tight');
  });
  it('cleans brand colors from Odoo', () => {
    expect(cleanBrandColor('#abc')).toBe('#AABBCC');
    expect(cleanBrandColor(' #00ff7f ')).toBe('#00FF7F');
    expect(cleanBrandColor('red')).toBeNull();
    expect(cleanBrandColor(false)).toBeNull();
  });
  it('contrast and nudge', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    const darker = nudge('#FFD000', '#FFFFFF', 7, -1);
    expect(contrast(darker, '#FFFFFF')).toBeGreaterThanOrEqual(7);
  });
  // Any brand color from Odoo must still give readable text on the header and buttons, in both modes.
  it.each(['#FFFFFF', '#000000', '#FFD000', '#00FF7F', '#FF0000', '#002D04', '#1E90FF', '#808080', '#F5F5F5'])('brand %s stays readable', (c) => {
    for (const dark of [false, true]) {
      const p = brandPalette(c, dark);
      const card = dark ? '#12201A' : '#FFFFFF';
      expect(contrast(p.head, '#FFFFFF')).toBeGreaterThanOrEqual(7);
      expect(contrast(p.selected, card)).toBeGreaterThanOrEqual(4.4);
      expect(contrast(p.selected, p.onSelected)).toBeGreaterThanOrEqual(4.4);
    }
  });
});
