import { useSyncExternalStore } from 'react';
import { Badges, getBadges, onBadges } from './deptBadges';

/** The latest red-number counts (see deptBadges.ts). All zero until the first sync. */
export function useBadges(): Badges {
  return useSyncExternalStore(onBadges, getBadges, getBadges);
}
