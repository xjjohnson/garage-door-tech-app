import { Appearance } from 'react-native';

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
    return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** The scheme this run of the app drew itself in. */
export const scheme: 'light' | 'dark' = startScheme();
export const isDark = scheme === 'dark';

export const colors: typeof light = isDark ? dark : light;

/** min: any button or chip. bar: the pinned answer bar and the bottom tabs. */
export const touch = { min: 56, bar: 64 } as const;

export const type = {
  label: 18,
  body: 18,
  value: 22,
  big: 30,
  huge: 40,
} as const;

/** Corners: fields and buttons, cards, sheets, and full pills. */
export const radius = { field: 12, card: 16, sheet: 22, pill: 999 } as const;

/** The soft card shadow from the approved screens. */
export const shadow = {
  shadowColor: colors.shadow,
  shadowOpacity: isDark ? 0.4 : 0.08,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;
