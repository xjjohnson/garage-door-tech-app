import { Appearance } from 'react-native';
import { readStartChoice, readStartValue } from './lib/themeStart';
import { BAR_PX, BUTTON_PX, Look, brandPalette, cleanBrandColor, parsePalette, scaleBorder, scaleFont, scaleHeight, scaleRadius, scaleSpace } from './lib/themeLook';
import { parseTheme, themeById, ThemeId } from './lib/themes';

/**
 * The Johnsons look (style H1): forest green on a soft page, white rounded
 * cards, quiet lines and one accent for actions, in light and dark mode.
 * Text and buttons stay big and high-contrast so they read in sunlight and
 * work with gloves.
 *
 * The palette is picked once when the app starts, from the phone's light or
 * dark setting (screens build their styles at load). `watchColorScheme`
 * (src/lib/useColorSchemeReload.ts) restarts the app's JS when the phone
 * switches while the app is closed or in the background.
 */
const light = {
  /** The page behind everything. */
  bg: '#EAF0EC',
  text: '#10241A',
  /** Secondary text. 6:1 on white, 5:1 on the page. */
  muted: '#465A4E',
  /** Outlines of buttons and fields: a quiet green-grey, not black. */
  border: '#B7C8BD',
  /** White cards on the page. */
  card: '#FFFFFF',
  /** Johnsons green, from the logo: the header and the brand marks. White text on it is 15:1. */
  brand: '#002D04',
  /** The roof grey in the logo. Decoration only, never text on white. */
  brandGrey: '#A8A8A8',
  /** Chosen and main buttons, the open tab, links. */
  selected: '#12633A',
  onSelected: '#FFFFFF',
  safety: '#FFD000',
  stop: '#B00020',
  onStop: '#FFFFFF',
  caution: '#FFB300',
  /** A soft tint of the accent: chip fills, pressed rows, switch tracks. */
  info: '#DCEBE2',
  /** Done, paid, synced. */
  ok: '#12633A',
  /** Hairlines between rows and around cards. */
  line: '#D2DFD6',
  /** Header gradient, top and bottom. */
  head: '#12633A',
  head2: '#0B2A1A',
  /** Text on the header. */
  onHead: '#FFFFFF',
  /** Warning chips: text and fill. */
  warn: '#9A5B00',
  warnBg: '#FBEBCB',
  backdrop: 'rgba(0,0,0,0.55)',
  shadow: '#10241A',
};

const dark: typeof light = {
  bg: '#0A1410',
  text: '#E3F0E8',
  muted: '#9DB5A5',
  border: '#2F473A',
  card: '#12201A',
  brand: '#0F3D26',
  brandGrey: '#6B7C71',
  selected: '#52C48A',
  onSelected: '#04130B',
  safety: '#F2B33D',
  stop: '#FF8A94',
  onStop: '#2A0008',
  caution: '#F2B33D',
  info: '#17291F',
  ok: '#52C48A',
  line: '#223529',
  head: '#0F3D26',
  head2: '#07170F',
  onHead: '#FFFFFF',
  warn: '#F2B33D',
  warnBg: '#3A2C10',
  backdrop: 'rgba(0,0,0,0.7)',
  shadow: '#000000',
};

function startScheme(): 'light' | 'dark' {
  try {
    // The tech's own choice wins from the first frame, so a phone set to the
    // other scheme doesn't draw the wrong colors first and restart (a flicker).
    const chosen = readStartChoice();
    if (chosen) {
      Appearance.setColorScheme?.(chosen);
      return chosen;
    }
    return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** The scheme this run of the app drew itself in. */
export const scheme: 'light' | 'dark' = startScheme();
export const isDark = scheme === 'dark';

const startThemeId = (() => {
  try {
    return parseTheme(readStartValue('apptheme'));
  } catch {
    return parseTheme(null);
  }
})();

/**
 * The theme in use, read at start and changeable while the app runs (`applyTheme`).
 * These exports (themeDef, layouts, look, colors, touch, type, radius, shadow) are the same
 * objects for the whole run and are updated in place, so the numbers a screen reads at draw
 * time are always current. Styles built once at load would be stale: screens build theirs with
 * `makeStyles` (lib/makeStyles.ts), which rebuilds them when the theme changes.
 */
export const themeDef = { ...themeById(startThemeId) };
export const layouts = { ...themeDef.layouts };

/** The look in use: the theme's shape and size, and whether the company color tints it. */
function palettePick() {
  try {
    return parsePalette(readStartValue('palette'));
  } catch {
    return 'johnsons' as const;
  }
}
export const look: Look = { shape: themeDef.shape, size: themeDef.size, palette: palettePick() };

function themeColors(): typeof light {
  const base = isDark ? dark : light;
  // The company's own color from Odoo (saved by companyBrand.ts) wins when the tech chose it. None saved: the theme's own color.
  const brand = look.palette === 'brand' ? cleanBrandColor(readStartValue('brandcolor')) : null;
  const tint = brand ?? themeDef.accent;
  const tinted = tint ? { ...base, ...brandPalette(tint, isDark) } : base;
  // A theme with its own colors (Owner) lays them over the tint: its page, cards and text, and a green header.
  const own = themeDef.colors?.[isDark ? 'dark' : 'light'];
  return own ? { ...tinted, ...own } : tinted;
}
export const colors: typeof light = themeColors();

/** min: any button or chip. bar: the pinned answer bar and the bottom tabs. Scaled by the size pick. */
export const touch = { min: BUTTON_PX[look.size], bar: BAR_PX[look.size] };

/**
 * Helpers for screens. Write the legacy number; the look scales it. Under the
 * Legacy look each returns its input unchanged.
 * rad: a corner radius. fs: a font size. sz: a control height written for a
 * 56 px button. bw: a border width.
 */
export const rad = (n: number) => scaleRadius(n, look.shape);
export const fs = (n: number) => scaleFont(n, look.size);
export const sz = (n: number) => scaleHeight(n, look.size);
/** sp: padding, margin or gap. */
export const sp = (n: number) => scaleSpace(n, look.size);
export const bw = (n: number) => scaleBorder(n, look.shape);

export const type = {
  label: fs(18),
  body: fs(18),
  value: fs(22),
  big: fs(30),
  huge: fs(40),
};

/** Corners: fields and buttons, cards, sheets, and full pills. */
export const radius = { field: rad(12), card: rad(16), sheet: rad(22), pill: 999 };

type Shadow = { shadowColor: string; shadowOpacity: number; shadowRadius: number; shadowOffset: { width: number; height: number }; elevation: number };

function themeShadow(): Shadow {
  return look.shape === 'square'
    ? { shadowColor: colors.shadow, shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 }
    : { shadowColor: colors.shadow, shadowOpacity: isDark ? 0.4 : 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 };
}

/** The soft card shadow from the approved screens. */
export const shadow: Shadow = themeShadow();

let version = 0;
const listeners = new Set<() => void>();

/** Goes up every time the theme changes; styles built for an older number are rebuilt. */
export function themeVersion(): number {
  return version;
}

export function onThemeChange(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/**
 * Switches the running app to another theme: updates every exported look object in place and
 * tells the screens to redraw. Nothing is saved here (the caller saves the pick for the next start).
 */
export function applyTheme(id: ThemeId): void {
  const next = themeById(id);
  Object.assign(themeDef, next);
  for (const k of Object.keys(layouts)) delete (layouts as Record<string, unknown>)[k];
  Object.assign(layouts, next.layouts);
  look.shape = next.shape;
  look.size = next.size;
  look.palette = palettePick();
  Object.assign(colors, themeColors());
  touch.min = BUTTON_PX[look.size];
  touch.bar = BAR_PX[look.size];
  Object.assign(type, { label: fs(18), body: fs(18), value: fs(22), big: fs(30), huge: fs(40) });
  Object.assign(radius, { field: rad(12), card: rad(16), sheet: rad(22), pill: 999 });
  Object.assign(shadow, themeShadow());
  version += 1;
  listeners.forEach((l) => l());
}
