import { miles, Point } from './geocode';
import { Appointment, startOfDay } from './schedule';

/** A booked visit counts as "near" the new address when it is within this many miles. */
export const NEAR_VISIT_MILES = 10;

/** A day with a booked visit near the address being booked. */
export interface NearDay {
  /** Start of the day, ms. */
  day: number;
  /** Miles to the closest booked visit that day. */
  miles: number;
  /** How many booked visits that day are near. */
  count: number;
  /** The closest one's customer, for "near Smith". */
  name: string;
}

/**
 * Days in the window on which someone is already booked within `within`
 * miles of `target`, closest first. Visits without a found map point are
 * skipped, and so are cancelled and done ones. `points` is keyed by the
 * address as `useGeocode` gives it (trimmed).
 */
export function nearDays(
  appointments: Pick<Appointment, 'start' | 'status' | 'address' | 'name'>[],
  points: Record<string, Point | null>,
  target: Point | null | undefined,
  days: number[],
  within = NEAR_VISIT_MILES,
  excludeAddress?: string,
): NearDay[] {
  if (!target) return [];
  const want = new Set(days);
  const best = new Map<number, NearDay>();
  for (const a of appointments) {
    if (a.status !== 'booked' || !a.address.trim()) continue;
    if (excludeAddress && a.address.trim() === excludeAddress.trim()) continue;
    const day = startOfDay(a.start);
    if (!want.has(day)) continue;
    const p = points[a.address.trim()];
    if (!p) continue;
    const m = miles(target, p);
    if (m > within) continue;
    const prev = best.get(day);
    if (!prev) best.set(day, { day, miles: m, count: 1, name: a.name });
    else {
      prev.count++;
      if (m < prev.miles) {
        prev.miles = m;
        prev.name = a.name;
      }
    }
  }
  return [...best.values()].sort((x, y) => x.miles - y.miles || x.day - y.day);
}
