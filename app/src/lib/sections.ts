import type { Href } from 'expo-router';

/**
 * The bottom tabs. `name` is the route file in src/app/(tabs); `href` its
 * address. Today, Jobs, Customers, Sales and More (the tools page).
 */
export const SECTIONS = [
  { id: 'today', name: 'index', href: '/', label: 'Home', title: 'Home', subtitle: '' },
  { id: 'jobs', name: 'jobs', href: '/jobs', label: 'Jobs', title: 'Jobs', subtitle: 'Jobs and visits' },
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
