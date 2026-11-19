/**
 * The app's themes, as plain data (no React). One theme is a whole look: how
 * the screens are arranged (layouts), how round and how big things are, and a
 * color accent. Light and dark stay a separate switch. "Classic" is the app as
 * it was before themes, so nothing changes until a theme is picked.
 */
import type { Palette, SizeName, Shape } from './themeLook';

export type ThemeId = 'classic' | 'field' | 'dispatch' | 'office' | 'owner' | 'map' | 'simple';

/** How one visit or job is drawn in a list. */
export type RowStyle = 'card' | 'dense' | 'edge' | 'tile' | 'big' | 'table';
export type HomeLayout = 'classic' | 'field' | 'inbox' | 'owner' | 'map' | 'simple';
export type JobsGroup = 'none' | 'status' | 'day';
export type CustomersLayout = 'classic' | 'big' | 'table' | 'owed' | 'near';
export type ToolsLayout = 'classic' | 'tiles' | 'compact' | 'business' | 'calc';
/** What the top of an opened job puts first: its steps, the visit and who has it, the money, or directions. */
export type JobDetailLayout = 'steps' | 'assign' | 'billing' | 'directions';
export type SalesLayout = 'classic' | 'dense' | 'table' | 'aging' | 'chase' | 'grouped';

export interface Layouts {
  /** Rows of today's visits on Home. */
  visitRows: RowStyle;
  /** Rows of the Jobs list. */
  jobRows: RowStyle;
  /** Headings in the Jobs list. */
  jobsGroup: JobsGroup;
  /** Jobs show their start time in a column to the left, like a day plan. */
  jobsRail: boolean;
  /** Jobs opens on the Team board for people who can dispatch. */
  jobsTeamFirst: boolean;
  /** Jobs shows today's route map above the list. */
  jobsMap: boolean;
  home: HomeLayout;
  /** Home opens on the map instead of the list. */
  homeStartsOnMap: boolean;
  sales: SalesLayout;
  customers: CustomersLayout;
  tools: ToolsLayout;
  jobDetail: JobDetailLayout;
}

export interface ThemeDef {
  id: ThemeId;
  label: string;
  /** Who it is made for. */
  who: string;
  detail: string;
  shape: Shape;
  size: SizeName;
  /** A base color that tints the header and buttons (null keeps Johnsons green). */
  accent: string | null;
  /** Three dots shown on the picker card. */
  swatch: [string, string, string];
  layouts: Layouts;
}

const CLASSIC_LAYOUTS: Layouts = { visitRows: 'card', jobRows: 'card', jobsGroup: 'none', jobsRail: false, jobsTeamFirst: false, jobsMap: false, home: 'classic', homeStartsOnMap: false, sales: 'classic', customers: 'classic', tools: 'classic', jobDetail: 'steps' };

export const THEMES: ThemeDef[] = [
  { id: 'classic', label: 'Classic', who: 'Everyone, as before', detail: 'The app as it was: large cards and buttons.', shape: 'round', size: 'legacy', accent: null, swatch: ['#12633A', '#52C48A', '#EAF0EC'], layouts: CLASSIC_LAYOUTS },
  {
    id: 'field',
    label: 'Field',
    who: 'Technicians on the road',
    detail: 'Big thumb targets, next job and one big action on Home, jobs grouped by day.',
    shape: 'round',
    size: 'comfortable',
    accent: null,
    swatch: ['#0F3D26', '#52C48A', '#F2B33D'],
    layouts: { visitRows: 'edge', jobRows: 'edge', jobsGroup: 'day', jobsRail: true, jobsTeamFirst: false, jobsMap: false, home: 'field', homeStartsOnMap: false, sales: 'dense', customers: 'big', tools: 'tiles', jobDetail: 'steps' },
  },
  {
    id: 'dispatch',
    label: 'Dispatch',
    who: 'Dispatcher',
    detail: 'Opens on the map and the technician board. Square, tight, more on screen.',
    shape: 'square',
    size: 'tight',
    accent: '#1F6FB5',
    swatch: ['#14283A', '#5AA9E6', '#F2B33D'],
    layouts: { visitRows: 'dense', jobRows: 'dense', jobsGroup: 'none', jobsRail: false, jobsTeamFirst: true, jobsMap: false, home: 'map', homeStartsOnMap: true, sales: 'table', customers: 'table', tools: 'compact', jobDetail: 'assign' },
  },
  {
    id: 'office',
    label: 'Office',
    who: 'Office and billing',
    detail: 'Tables, an action inbox on Home and an unpaid-by-age view. The densest theme.',
    shape: 'square',
    size: 'tight',
    accent: '#2E7D57',
    swatch: ['#2B2F36', '#8CC8A5', '#FF8A94'],
    layouts: { visitRows: 'dense', jobRows: 'table', jobsGroup: 'none', jobsRail: false, jobsTeamFirst: false, jobsMap: false, home: 'inbox', homeStartsOnMap: false, sales: 'aging', customers: 'table', tools: 'compact', jobDetail: 'billing' },
  },
  {
    id: 'owner',
    label: 'Owner',
    who: 'Owner',
    detail: 'Money first: dashboard on Home, jobs grouped by status, a list of who to chase.',
    shape: 'round',
    size: 'compact',
    accent: '#8A6A12',
    swatch: ['#3A2F0F', '#E3B341', '#52C48A'],
    layouts: { visitRows: 'edge', jobRows: 'edge', jobsGroup: 'status', jobsRail: false, jobsTeamFirst: false, jobsMap: false, home: 'owner', homeStartsOnMap: false, sales: 'chase', customers: 'owed', tools: 'business', jobDetail: 'billing' },
  },
  {
    id: 'map',
    label: 'Map',
    who: 'Techs who drive between jobs',
    detail: 'The map is the first thing you see on Home and above your jobs.',
    shape: 'round',
    size: 'compact',
    accent: null,
    swatch: ['#0F3D26', '#7FD6A8', '#F2B33D'],
    layouts: { visitRows: 'edge', jobRows: 'edge', jobsGroup: 'day', jobsRail: false, jobsTeamFirst: false, jobsMap: true, home: 'map', homeStartsOnMap: true, sales: 'grouped', customers: 'near', tools: 'calc', jobDetail: 'directions' },
  },
  {
    id: 'simple',
    label: 'Simple',
    who: 'New hires, gloves, anyone who wants less',
    detail: 'Big text and big buttons, today in large rows, jobs as tiles.',
    shape: 'round',
    size: 'legacy',
    accent: null,
    swatch: ['#0F3D26', '#52C48A', '#FFFFFF'],
    layouts: { visitRows: 'big', jobRows: 'tile', jobsGroup: 'none', jobsRail: false, jobsTeamFirst: false, jobsMap: false, home: 'simple', homeStartsOnMap: false, sales: 'dense', customers: 'big', tools: 'tiles', jobDetail: 'steps' },
  },
];

export const DEFAULT_THEME: ThemeId = 'classic';

export function parseTheme(v: unknown): ThemeId {
  return THEMES.some((t) => t.id === v) ? (v as ThemeId) : DEFAULT_THEME;
}

export function themeById(id: ThemeId): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** The tech's saved pick: a theme, and whether the company color from Odoo tints it. */
export interface LookPick {
  theme: ThemeId;
  palette: Palette;
}
