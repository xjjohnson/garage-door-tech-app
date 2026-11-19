/**
 * The look of the app besides light/dark, as plain numbers (no React). A look
 * is three independent picks:
 *  - shape: how round the corners are,
 *  - size: how big buttons, rows and text are,
 *  - colors: the Johnsons palette, or the company's own brand color from Odoo.
 * "Legacy" shape + size is exactly the app as it was before looks existed:
 * every helper returns its input unchanged there.
 */
export type Shape = 'round' | 'square';
export type SizeName = 'legacy' | 'comfortable' | 'compact' | 'tight';
export type Palette = 'johnsons' | 'brand';

export const SHAPES: { value: Shape; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'square', label: 'Square' },
];

export const SIZES: { value: SizeName; label: string; detail: string }[] = [
  { value: 'legacy', label: 'Legacy', detail: 'Large buttons, as before' },
  { value: 'comfortable', label: 'Comfortable', detail: '48 px buttons' },
  { value: 'compact', label: 'Compact', detail: '44 px buttons' },
  { value: 'tight', label: 'Tight', detail: '40 px buttons, the smallest' },
];

export const PALETTES: { value: Palette; label: string }[] = [
  { value: 'johnsons', label: 'Johnsons green' },
  { value: 'brand', label: 'Company brand (Odoo)' },
];

/** Main button height for each size; the floor is 40 so thumbs still hit them. */
export const BUTTON_PX: Record<SizeName, number> = { legacy: 56, comfortable: 48, compact: 44, tight: 40 };
/** The pinned bar and bottom tabs. */
export const BAR_PX: Record<SizeName, number> = { legacy: 64, comfortable: 58, compact: 54, tight: 50 };
/** Text scale (applied to every font size). */
export const TEXT_SCALE: Record<SizeName, number> = { legacy: 1, comfortable: 0.9, compact: 0.84, tight: 0.78 };
/** Space between and around things (padding, margin, gap), as a share of the legacy number. */
export const SPACE_SCALE: Record<SizeName, number> = { legacy: 1, comfortable: 0.9, compact: 0.75, tight: 0.62 };
/** Corner scale for round, and a hard cap for square. */
export const SQUARE_MAX_RADIUS = 3;

export interface Look {
  shape: Shape;
  size: SizeName;
  palette: Palette;
}

export const LEGACY_LOOK: Look = { shape: 'round', size: 'legacy', palette: 'johnsons' };

export const parseShape = (v: unknown): Shape => (v === 'square' ? 'square' : 'round');
export const parseSize = (v: unknown): SizeName => (v === 'comfortable' || v === 'compact' || v === 'tight' ? v : 'legacy');
export const parsePalette = (v: unknown): Palette => (v === 'brand' ? 'brand' : 'johnsons');

/** A corner radius for this look. Pills (very large radii) stay pills; square caps the rest. */
export function scaleRadius(n: number, shape: Shape): number {
  if (n >= 100 || n <= 0) return n;
  return shape === 'square' ? Math.min(n, SQUARE_MAX_RADIUS) : n;
}

/** A font size for this look, never below 12 so small print stays readable. */
export function scaleFont(n: number, size: SizeName): number {
  if (size === 'legacy') return n;
  return Math.max(12, Math.round(n * TEXT_SCALE[size]));
}

/** A control height written for the legacy 56 px button, scaled to this size. */
export function scaleHeight(n: number, size: SizeName): number {
  if (size === 'legacy') return n;
  return Math.round((n * BUTTON_PX[size]) / BUTTON_PX.legacy);
}

/** Padding, margin or gap for this look. Tiny gaps (2 or less) stay; legacy is unchanged. */
export function scaleSpace(n: number, size: SizeName): number {
  if (size === 'legacy' || Math.abs(n) <= 2) return n;
  return Math.max(2, Math.round(n * SPACE_SCALE[size]));
}

/** Border width: square looks draw a firmer line. */
export function scaleBorder(n: number, shape: Shape): number {
  return shape === 'square' && n >= 1 ? Math.max(n, 2) : n;
}

// ---- brand color -----------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c: [number, number, number]) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();

function lum([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio of two hex colors (1 to 21); 1 when either is not a color. */
export function contrast(a: string, b: string): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  if (!x || !y) return 1;
  const [hi, lo] = lum(x) > lum(y) ? [lum(x), lum(y)] : [lum(y), lum(x)];
  return (hi + 0.05) / (lo + 0.05);
}

/** Moves a color toward black (dir -1) or white (dir 1) until it has `min` contrast against `against`. */
export function nudge(hex: string, against: string, min: number, dir: 1 | -1): string {
  const c = hexToRgb(hex);
  if (!c) return hex;
  let cur: [number, number, number] = c;
  for (let i = 0; i < 40 && contrast(toHex(cur), against) < min; i++) {
    cur = cur.map((v) => (dir === 1 ? v + (255 - v) * 0.08 : v * 0.92)) as [number, number, number];
  }
  return toHex(cur);
}

/** A valid #RRGGBB from whatever Odoo stores (it may hold #RGB, a name or nothing); null when unusable. */
export function cleanBrandColor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (/^#[0-9a-f]{3}$/i.test(t)) return ('#' + t.slice(1).split('').map((c) => c + c).join('')).toUpperCase();
  return /^#[0-9a-f]{6}$/i.test(t) ? t.toUpperCase() : null;
}

/** The brand color, made safe to carry white text and to read as a button on each background. */
export function brandPalette(brand: string, dark: boolean): { head: string; head2: string; selected: string; onSelected: string; info: string; ok: string; brand: string } {
  const white = '#FFFFFF';
  const bg = dark ? '#12201A' : white;
  // Header: darkened until white text on it is easy to read.
  const head = nudge(brand, white, 7, -1);
  const head2 = nudge(head, white, 12, -1);
  // Buttons and links: must read against the page (a card), and carry text.
  const selected = dark ? nudge(brand, bg, 4.5, 1) : nudge(brand, bg, 4.5, -1);
  const onSelected = contrast(selected, white) >= contrast(selected, '#04130B') ? white : '#04130B';
  const rgb = hexToRgb(selected) ?? [0, 0, 0];
  const info = dark ? toHex(rgb.map((v) => v * 0.2 + 18) as [number, number, number]) : toHex(rgb.map((v) => v * 0.12 + 255 * 0.88) as [number, number, number]);
  return { head, head2, selected, onSelected, info, ok: selected, brand: head };
}
