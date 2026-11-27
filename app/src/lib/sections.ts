import type { Href } from 'expo-router';

/**
 * The bottom tabs. `name` is the route file in src/app/(tabs); `href` its
 * address. Today, Jobs, Customers, Sales and More (the tools page).
 */
export const SECTIONS = [
  { id: 'today', name: 'index', href: '/', label: 'Home', title: 'Home', subtitle: '' },
  { id: 'jobs', name: 'jobs', href: '/jobs', label: 'Jobs', title: 'Jobs', subtitle: 'Jobs and visits' },
  { id: 'needs', name: 'needs', href: '/needs', label: 'Needs you', title: 'Needs you', subtitle: 'Late, unassigned and double booked' },
  { id: 'week', name: 'week', href: '/week', label: 'Week', title: 'Week', subtitle: 'Every tech, the next 7 days' },
  { id: 'customers', name: 'customers', href: '/customers', label: 'Customers', title: 'Customers', subtitle: 'Doors, history and contact' },
  { id: 'sales', name: 'sales', href: '/sales', label: 'Sales', title: 'Sales', subtitle: 'Owed, quotes and follow-ups' },
  { id: 'tools', name: 'tools', href: '/tools', label: 'More', title: 'Tools', subtitle: 'Calculators, manuals, day tools' },
] as const satisfies readonly { id: string; name: string; href: Href; label: string; title: string; subtitle: string }[];

/**
 * Pages opened from Tools that keep the header and tabs (Tools stays lit).
 * Each has a Tools button back.
 */
export const TOOL_PAGES = [
  { id: 'springs', name: 'springs', href: '/springs', label: 'Springs', title: 'Spring calculator', subtitle: 'Torsion and extension' },
  { id: 'manuals', name: 'manuals', href: '/manuals', label: 'Manuals', title: 'Manuals', subtitle: "Makers' install and owner's manuals" },
  { id: 'diagnose', name: 'diagnose', href: '/diagnose', label: 'Diagnose', title: 'Diagnose', subtitle: 'Opener codes, symptoms and programming, works offline' },
] as const satisfies readonly { id: string; name: string; href: Href; label: string; title: string; subtitle: string }[];

export type SectionId = (typeof SECTIONS)[number]['id'];

/** What a plain technician sees on the bar: no Customers list and no Sales. Both stay open for the other roles. */
export const TECH_SECTION_IDS: readonly SectionId[] = ['today', 'jobs', 'tools'];

/** Routes a tech is sent home from (old links, notifications); the pages they open from a job stay open. */
export const TECH_HIDDEN_HREFS: readonly string[] = ['/customers', '/sales'];
/** Routes only the dispatcher-only bar uses; anyone else who lands on one goes Home. */
export const DISPATCH_ONLY_HREFS: readonly string[] = ['/needs', '/week'];

/** The dispatcher-only bar: Today, Jobs (the team board), Needs you, Week and More. No Customers, Sales or field tools. */
export const DISPATCH_SECTION_IDS: readonly SectionId[] = ['today', 'jobs', 'needs', 'week', 'tools'];

/** Tabs that only the dispatcher-only bar shows. Everyone else keeps the bar they had. */
export const DISPATCH_ONLY_IDS: readonly SectionId[] = ['needs', 'week'];

/** The bar for a person: dispatcher-only, a plain tech, or everyone else. */
export function barFor(kind: 'dispatcher' | 'tech' | 'other'): readonly SectionId[] {
  if (kind === 'dispatcher') return DISPATCH_SECTION_IDS;
  if (kind === 'tech') return TECH_SECTION_IDS;
  return SECTIONS.map((x) => x.id).filter((id) => !DISPATCH_ONLY_IDS.includes(id));
}
