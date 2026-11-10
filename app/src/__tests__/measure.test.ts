import { applyKey, formatFeetInches, formatInches, formatNumber, formatTurns, KeypadKey, parseMeasurement } from '../lib/measure';

describe('parseMeasurement', () => {
  it.each([
    ['24', 24],
    ['24.5', 24.5],
    ['.225', 0.225],
    ['24 1/2', 24.5],
    ['4-7/16', 4.4375],
    ['3/4', 0.75],
    ['  26 3/8" ', 26.375],
  ])('reads %p as %p', (text, value) => {
    expect(parseMeasurement(text)).toBeCloseTo(value, 6);
  });
  it.each(['', ' ', 'abc', '1/0', '24 1/', '.', '1.2.3'])('rejects %p', (text) => {
    expect(parseMeasurement(text)).toBeUndefined();
  });
});

describe('formatting', () => {
  it('rounds to sixteenths and reduces', () => {
    expect(formatInches(24.5)).toBe('24 1/2"');
    expect(formatInches(1.6875)).toBe('1 11/16"');
    expect(formatInches(0.25)).toBe('1/4"');
    expect(formatInches(2)).toBe('2"');
    expect(formatInches(23.99)).toBe('24"');
  });
  it('shows feet and inches', () => {
    expect(formatFeetInches(84)).toBe("7'");
    expect(formatFeetInches(90)).toBe('7\' 6"');
    expect(formatFeetInches(81.5)).toBe('6\' 9 1/2"');
  });
  it('shows quarter turns', () => {
    expect(formatTurns(7.5)).toBe('7 1/2');
    expect(formatTurns(8.25)).toBe('8 1/4');
    expect(formatTurns(8)).toBe('8');
  });
  it('groups thousands', () => {
    expect(formatNumber(12000)).toBe('12,000');
    expect(formatNumber(100000)).toBe('100,000');
    expect(formatNumber(245.6)).toBe('246');
    expect(formatNumber(33.333, 1)).toBe('33.3');
  });
});

describe('keypad', () => {
  const both = { allowFraction: true, allowDecimal: true };
  const press = (keys: KeypadKey[], opts = both) => keys.reduce((e, k) => applyKey(e, k, opts), '');

  it('builds a whole number with a fraction', () => {
    expect(press(['2', '4', '1/2'])).toBe('24 1/2');
  });
  it('a second fraction replaces the first', () => {
    expect(press(['2', '4', '1/2', '3/4'])).toBe('24 3/4');
  });
  it('allows a bare fraction', () => {
    expect(press(['3/4'])).toBe('3/4');
  });
  it('back removes the whole fraction, then digits', () => {
    expect(press(['2', '4', '1/16', 'back'])).toBe('24');
    expect(press(['2', '4', 'back'])).toBe('2');
    expect(press(['1/2', 'back'])).toBe('');
  });
  it('ignores digits after a fraction', () => {
    expect(press(['4', '1/2', '7'])).toBe('4 1/2');
  });
  it('decimal entry for a caliper reading', () => {
    expect(press(['.', '2', '2', '5'])).toBe('0.225');
    expect(parseMeasurement(press(['.', '2', '2', '5']))).toBeCloseTo(0.225);
  });
  it('does not mix decimals and fractions', () => {
    expect(press(['2', '.', '5', '1/2'])).toBe('2.5');
    expect(press(['2', '1/2', '.'])).toBe('2 1/2');
  });
  it('respects fields that take no fractions or no decimals', () => {
    expect(press(['2', '1/2'], { allowFraction: false, allowDecimal: true })).toBe('2');
    expect(press(['2', '.', '5'], { allowFraction: true, allowDecimal: false })).toBe('25');
  });
  it('drops leading zeros and caps the length', () => {
    expect(press(['0', '7'])).toBe('7');
    expect(press(['1', '2', '3', '4', '5', '6', '7'])).toBe('123456');
  });
  it('clear empties the entry', () => {
    expect(press(['2', '4', '1/2', 'clear'])).toBe('');
  });
});
