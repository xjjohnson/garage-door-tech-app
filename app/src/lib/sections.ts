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
  { id: 'quotes', name: 'quotes', href: '/quotes', label: 'Quotes', title: 'Quotes', subtitle: 'Quiet, open, won and lost' },
  { id: 'invoices', name: 'sales-invoices', href: '/sales-invoices', label: 'Invoices', title: 'Invoices', subtitle: 'Unpaid and overdue' },
  { id: 'money', name: 'money', href: '/money', label: 'Money', title: 'Money', subtitle: 'In, out, owed and who to chase' },
  { id: 'areas', name: 'areas', href: '/areas', label: 'Areas', title: 'Areas', subtitle: 'Every part of the business' },
  { id: 'manage', name: 'manage', href: '/manage', label: 'Manage', title: 'Manage', subtitle: 'Approvals and setup, owner only' },
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

/** The sales-only bar: Home, Quotes, Invoices, Customers and More. No Jobs board or field tools. */
export const SALES_SECTION_IDS: readonly SectionId[] = ['today', 'quotes', 'invoices', 'customers', 'tools'];

/** Tabs that only the sales-only bar shows. */
export const SALES_ONLY_IDS: readonly SectionId[] = ['quotes', 'invoices'];

/** Routes only the sales-only bar uses; anyone else who lands on one goes Home. */
export const SALES_ONLY_HREFS: readonly string[] = ['/quotes', '/sales-invoices'];

/** The owner bar: Home, Jobs, Money, Areas, Manage. Customers, Sales and Tools stay open from Areas, so the owner can still do everything. */
export const OWNER_SECTION_IDS: readonly SectionId[] = ['today', 'jobs', 'money', 'areas', 'manage'];

/** Tabs that only the owner bar shows. */
export const OWNER_ONLY_IDS: readonly SectionId[] = ['money', 'areas', 'manage'];

/** Routes only the owner bar uses; anyone else who lands on one goes Home. */
export const OWNER_ONLY_HREFS: readonly string[] = ['/money', '/areas', '/manage'];

/** Pages the owner opens from Areas (they keep the owner bar, with Areas lit). */
export const OWNER_AREAS_HREFS: readonly string[] = ['/customers', '/sales', '/tools'];

/** The bar for a person: owner, dispatcher-only, sales-only, a plain tech, or everyone else. */
export function barFor(kind: 'owner' | 'dispatcher' | 'sales' | 'tech' | 'other'): readonly SectionId[] {
  if (kind === 'owner') return OWNER_SECTION_IDS;
  if (kind === 'dispatcher') return DISPATCH_SECTION_IDS;
  if (kind === 'sales') return SALES_SECTION_IDS;
  if (kind === 'tech') return TECH_SECTION_IDS;
  return SECTIONS.map((x) => x.id).filter((id) => !DISPATCH_ONLY_IDS.includes(id) && !SALES_ONLY_IDS.includes(id) && !OWNER_ONLY_IDS.includes(id));
}
