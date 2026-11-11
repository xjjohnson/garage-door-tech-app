import type { Href } from 'expo-router';

/** The app's sections. `name` is the route file in src/app/(tabs); `href` its address. */
export const SECTIONS = [
  { id: 'springs', name: 'index', href: '/', label: 'Springs', title: 'Spring calculator', subtitle: 'Torsion, standard lift' },
  { id: 'jobs', name: 'jobs', href: '/jobs', label: 'Jobs', title: 'Jobs', subtitle: 'Saved on this phone' },
  { id: 'manuals', name: 'manuals', href: '/manuals', label: 'Manuals', title: 'Manuals', subtitle: "Makers' install and owner's manuals" },
  { id: 'diagnose', name: 'diagnose', href: '/diagnose', label: 'Diagnose', title: 'Diagnose', subtitle: 'Opener codes, symptoms and programming, works offline' },
] as const satisfies readonly { id: string; name: string; href: Href; label: string; title: string; subtitle: string }[];
