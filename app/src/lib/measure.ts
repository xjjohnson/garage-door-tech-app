/**
 * Measurements as techs say them: "24 1/2", "4-7/16", ".225", "84".
 * Parsing, formatting back to fractions, and the keypad's key handling all
 * live here as plain functions so they can be tested without a phone.
 */

/**
 * Fraction keys on the keypad, in the order they're laid out. Eighths show by
 * default; a toggle swaps in the odd sixteenths, which 20-coil readings need
 * (4 7/16" sits between .218 and .225).
 */
export const EIGHTHS = ['1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8'] as const;
export const SIXTEENTHS = ['1/16', '3/16', '5/16', '7/16', '9/16', '11/16', '13/16', '15/16'] as const;
export type FractionKey = (typeof EIGHTHS)[number] | (typeof SIXTEENTHS)[number];
export type DigitKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type KeypadKey = DigitKey | FractionKey | '.' | 'back' | 'clear';

export interface KeypadOptions {
  allowFraction: boolean;
  allowDecimal: boolean;
}

const MAX_DIGITS = 6;

/**
 * Turn what the tech entered into inches (or pounds). Accepts whole numbers,
 * decimals, "whole fraction" and a bare fraction. Returns undefined for an
 * empty or unreadable entry.
 */
export function parseMeasurement(text: string): number | undefined {
  const s = text.trim().replace(/["”]/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ');
  if (s === '') return undefined;
  let m = /^(\d+) (\d+)\/(\d+)$/.exec(s);
  if (m) {
    const den = Number(m[3]);
    return den === 0 ? undefined : Number(m[1]) + Number(m[2]) / den;
  }
  m = /^(\d+)\/(\d+)$/.exec(s);
  if (m) {
    const den = Number(m[2]);
    return den === 0 ? undefined : Number(m[1]) / den;
  }
  if (/^(\d+\.?\d*|\.\d+)$/.test(s)) return Number(s);
  return undefined;
}

/**
 * Inches to the nearest 1/16 (or another power of two), reduced:
 * 24.5 -> 24 1/2", 1.6875 -> 1 11/16", 0.25 -> 1/4".
 */
export function formatInches(value: number, denominator = 16, unit = true): string {
  const q = unit ? '"' : '';
  const total = Math.round(value * denominator);
  const whole = Math.floor(total / denominator);
  let num = total - whole * denominator;
  let den = denominator;
  while (num !== 0 && num % 2 === 0 && den % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  if (num === 0) return `${whole}${q}`;
  if (whole === 0) return `${num}/${den}${q}`;
  return `${whole} ${num}/${den}${q}`;
}

/** 84 -> 7', 90 -> 7' 6", 81.5 -> 6' 9 1/2". */
export function formatFeetInches(inches: number): string {
  const rounded = Math.round(inches * 16) / 16;
  const feet = Math.floor(rounded / 12);
  const rest = rounded - feet * 12;
  if (rest === 0) return `${feet}'`;
  if (feet === 0) return formatInches(rest);
  return `${feet}' ${formatInches(rest)}`;
}

/** Turns are always quarter turns: 7.5 -> "7 1/2". */
export function formatTurns(turns: number): string {
  return formatInches(turns, 4, false);
}

/** 12000 -> "12,000". Written out because Intl isn't guaranteed on every phone. */
export function formatNumber(value: number, decimals = 0): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [int = '0', frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${value < 0 ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`;
}

/**
 * Apply one keypad press to the current entry.
 *  - Digits append, up to six, but not after a fraction.
 *  - A fraction key sets (or replaces) the fraction after the whole number.
 *  - "." is only for decimal fields, and not together with a fraction.
 *  - Back removes the whole fraction at once, otherwise one character.
 */
export function applyKey(entry: string, key: KeypadKey, opts: KeypadOptions): string {
  const hasFraction = entry.includes('/');
  const hasDecimal = entry.includes('.');
  if (key === 'clear') return '';
  if (key === 'back') {
    if (hasFraction) {
      const space = entry.lastIndexOf(' ');
      return space === -1 ? '' : entry.slice(0, space);
    }
    return entry.slice(0, -1);
  }
  if (key === '.') {
    if (!opts.allowDecimal || hasDecimal || hasFraction) return entry;
    return entry === '' ? '0.' : `${entry}.`;
  }
  if (key.includes('/')) {
    if (!opts.allowFraction || hasDecimal) return entry;
    const whole = hasFraction ? (entry.includes(' ') ? entry.slice(0, entry.indexOf(' ')) : '') : entry;
    return whole === '' ? key : `${whole} ${key}`;
  }
  // A digit.
  if (hasFraction) return entry;
  if (entry.replace('.', '').length >= MAX_DIGITS) return entry;
  if (entry === '0') return key; // no leading zeros
  return `${entry}${key}`;
}
