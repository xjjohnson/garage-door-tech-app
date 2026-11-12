/**
 * High-contrast look for use outdoors: near-black on white, bold type, the
 * Johnsons green (from the logo) for chosen and main buttons, safety yellow
 * and red only for warnings, and touch targets of at least 56 px so they
 * work with gloves.
 */
export const colors = {
  bg: '#FFFFFF',
  text: '#0B0B0B',
  muted: '#333333',
  border: '#0B0B0B',
  card: '#F2F2F2',
  /** Johnsons green, from the logo. White text on it is 15:1. */
  brand: '#002D04',
  /** The roof grey in the logo. Decoration only, never text on white. */
  brandGrey: '#A8A8A8',
  selected: '#002D04',
  onSelected: '#FFFFFF',
  safety: '#FFD000',
  stop: '#B00020',
  onStop: '#FFFFFF',
  caution: '#FFB300',
  info: '#E3E3E3',
  /** Done, paid, synced. */
  ok: '#15803D',
  backdrop: 'rgba(0,0,0,0.55)',
} as const;

/** min: any button or chip. bar: the pinned answer bar and the bottom tabs. */
export const touch = { min: 56, bar: 64 } as const;

export const type = {
  label: 18,
  body: 18,
  value: 22,
  big: 30,
  huge: 40,
} as const;
