/**
 * High-contrast look for use outdoors: near-black on white, bold type,
 * safety yellow for the warning banner, and touch targets of at least 56 px
 * so they work with gloves.
 */
export const colors = {
  bg: '#FFFFFF',
  text: '#0B0B0B',
  muted: '#333333',
  border: '#0B0B0B',
  card: '#F2F2F2',
  selected: '#0B0B0B',
  onSelected: '#FFFFFF',
  safety: '#FFD000',
  stop: '#B00020',
  onStop: '#FFFFFF',
  caution: '#FFB300',
  info: '#E3E3E3',
  backdrop: 'rgba(0,0,0,0.55)',
} as const;

export const touch = { min: 56 } as const;

export const type = {
  label: 18,
  body: 18,
  value: 22,
  big: 30,
  huge: 40,
} as const;
