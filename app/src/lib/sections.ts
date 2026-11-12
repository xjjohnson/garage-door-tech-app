import type { Href } from 'expo-router';

/**
 * The bottom tabs. `name` is the route file in src/app/(tabs); `href` its
 * address. Today, Jobs, Sales, Customers and Tools.
 */
export const SECTIONS = [
  { id: 'today', name: 'index', href: '/', label: 'Today', title: 'Today', subtitle: '' },
  { id: 'jobs', name: 'jobs', href: '/jobs', label: 'Jobs', title: 'Jobs', subtitle: 'Saved jobs and visits' },
  { id: 'sales', name: 'sales', href: '/sales', label: 'Sales', title: 'Sales', subtitle: 'Owed, quotes and follow-ups' },
  { id: 'customers', name: 'customers', href: '/customers', label: 'Customers', title: 'Customers', subtitle: 'Doors, history and contact' },
  { id: 'tools', name: 'tools', href: '/tools', label: 'Tools', title: 'Tools', subtitle: 'Calculators, manuals and diagnose' },
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
