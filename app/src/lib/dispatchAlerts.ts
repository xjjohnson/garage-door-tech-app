/**
 * What a dispatcher has to look at from the day's jobs: running late and
 * double booked. Plain logic on jobs already read from Odoo, so it is
 * tested without Odoo and works from the last sync.
 */
import type { OdooTask } from './odoo';

/** A job isn't late until its start is this many minutes behind. */
export const LATE_GRACE_MIN = 15;
const MINUTE = 60_000;

const endOf = (t: OdooTask) => (t.start ?? 0) + (t.minutes ?? 60) * MINUTE;

/**
 * Jobs with a tech whose planned start passed more than the grace ago and
 * that Odoo shows no Actual Start for (the tech hasn't tapped Arrived, or
 * hasn't synced). Soonest start first.
 */
export function lateJobs(jobs: OdooTask[], now: number): OdooTask[] {
  return jobs
    .filter((t) => t.assignees.length > 0 && t.start !== undefined && t.arrivedAt === undefined && t.start + LATE_GRACE_MIN * MINUTE <= now)
    .sort((a, b) => a.start! - b.start!);
}

/** Jobs that overlap another job of the same tech. Both jobs of a clash are listed, by tech and then time. */
export function doubleBooked(jobs: OdooTask[]): OdooTask[] {
  const clash = new Set<number>();
  const byTech = new Map<number, OdooTask[]>();
  for (const t of jobs) {
    if (t.start === undefined) continue;
    for (const w of t.assignees) byTech.set(w, [...(byTech.get(w) ?? []), t]);
  }
  for (const list of byTech.values()) {
    const sorted = [...list].sort((a, b) => a.start! - b.start!);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length && sorted[j]!.start! < endOf(sorted[i]!); j++) {
        clash.add(sorted[i]!.id);
        clash.add(sorted[j]!.id);
      }
    }
  }
  return jobs.filter((t) => clash.has(t.id)).sort((a, b) => (a.assignees[0] ?? 0) - (b.assignees[0] ?? 0) || a.start! - b.start!);
}
