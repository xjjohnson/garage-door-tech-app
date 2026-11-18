import { doubleBooked, lateJobs } from '../lib/dispatchAlerts';
import type { OdooTask } from '../lib/odoo';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 18, 15, 0);
const job = (id: number, tech: number, startMin: number | undefined, extra: Partial<OdooTask> = {}): OdooTask => ({
  id, name: `J${id}`, customer: '', phone: '', address: '', stage: 'Scheduled', notes: '', assignees: tech ? [tech] : [],
  ...(startMin !== undefined ? { start: T0 + startMin * MIN } : {}), ...extra,
});

describe('running late', () => {
  it('needs a tech, a start more than 15 minutes ago, and no Actual Start', () => {
    const now = T0 + 30 * MIN;
    const jobs = [
      job(1, 7, 0), // 30 min behind: late
      job(2, 7, 20), // 10 min behind: not yet
      job(3, 7, 0, { arrivedAt: T0 + 5 * MIN }), // arrived
      job(4, 0, 0), // nobody assigned
      job(5, 8, undefined), // no time
      job(6, 8, -10), // 40 min behind: late, and listed first
    ];
    expect(lateJobs(jobs, now).map((t) => t.id)).toEqual([6, 1]);
  });
});

describe('double booked', () => {
  it('lists both jobs of a clash for one tech and ignores other techs and touching jobs', () => {
    const jobs = [
      job(1, 7, 0, { minutes: 60 }),
      job(2, 7, 30, { minutes: 60 }), // clashes with 1
      job(3, 7, 90, { minutes: 30 }), // starts as 2 ends (30+60): fine, but overlaps nothing
      job(4, 8, 0, { minutes: 60 }), // other tech, same time: fine
      job(5, 7, undefined),
    ];
    expect(doubleBooked(jobs).map((t) => t.id)).toEqual([1, 2]);
  });
  it('uses an hour when the length is unknown', () => {
    expect(doubleBooked([job(1, 7, 0), job(2, 7, 59)]).map((t) => t.id)).toEqual([1, 2]);
    expect(doubleBooked([job(1, 7, 0), job(2, 7, 60)])).toEqual([]);
  });
});
