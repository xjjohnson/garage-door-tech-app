import { Appearance } from 'react-native';
import { readStartChoice, readStartValue } from './lib/themeStart';
import { BAR_PX, BUTTON_PX, Look, brandPalette, cleanBrandColor, parsePalette, parseShape, parseSize, scaleBorder, scaleFont, scaleHeight, scaleRadius, scaleSpace } from './lib/themeLook';

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

/** The look this run drew itself in (shape, size and palette), read at start like the scheme. Legacy until a look is picked. */
function startLook(): Look {
  try {
    return { shape: parseShape(readStartValue('shape')), size: parseSize(readStartValue('size')), palette: parsePalette(readStartValue('palette')) };
  } catch {
    return { shape: 'round', size: 'legacy', palette: 'johnsons' };
  }
}
export const look: Look = startLook();

function startColors(): typeof light {
  const base = isDark ? dark : light;
  if (look.palette !== 'brand') return base;
  // The company's own color from Odoo (saved by companyBrand.ts). None saved: the Johnsons palette stays.
  const brand = cleanBrandColor(readStartValue('brandcolor'));
  return brand ? { ...base, ...brandPalette(brand, isDark) } : base;
}
export const colors: typeof light = startColors();

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
  label: scaleFont(18, look.size),
  body: scaleFont(18, look.size),
  value: scaleFont(22, look.size),
  big: scaleFont(30, look.size),
  huge: scaleFont(40, look.size),
};

/** Corners: fields and buttons, cards, sheets, and full pills. */
export const radius = { field: rad(12), card: rad(16), sheet: rad(22), pill: 999 };


/** The soft card shadow from the approved screens. */
export const shadow = look.shape === 'square'
  ? ({ shadowColor: colors.shadow, shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 } as const)
  : ({
      shadowColor: colors.shadow,
      shadowOpacity: isDark ? 0.4 : 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    } as const);
