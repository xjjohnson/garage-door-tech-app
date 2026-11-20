import { Appointment, upcoming, visitDone } from '../lib/schedule';
import { routeStops } from '../screens/TodayMapScreen';

const NOW = new Date(2026, 10, 20, 8, 0).getTime();
const visit = (id: string, hour: number, extra: Partial<Appointment> = {}): Appointment => ({ id, start: new Date(2026, 10, 20, hour).getTime(), minutes: 60, name: id, address: '', phone: '', what: '', status: 'booked', createdAt: 1, updatedAt: 1, ...extra });

describe('a finished visit is never the next stop', () => {
  it('counts a visit as done when it is marked done, or its job is closed or has the work done', () => {
    expect(visitDone(visit('a', 11, { status: 'done' }))).toBe(true);
    expect(visitDone(visit('a', 11, { jobId: 'j' }), [{ id: 'j', status: 'done' }])).toBe(true);
    expect(visitDone(visit('a', 11, { jobId: 'j' }), [{ id: 'j', status: 'open', steps: { workDoneAt: 5 } }])).toBe(true);
    expect(visitDone(visit('a', 11, { jobId: 'j' }), [{ id: 'j', status: 'open' }])).toBe(false);
    expect(visitDone(visit('a', 11))).toBe(false);
  });

  it('skips the closed job when finding what is next', () => {
    const list = [visit('flash', 11, { jobId: 'j' }), visit('later', 14)];
    expect(upcoming(list, NOW, 3, [{ id: 'j', status: 'done' }]).map((a) => a.id)).toEqual(['later']);
    expect(upcoming([list[0]], NOW, 3, [{ id: 'j', status: 'done' }])).toEqual([]);
  });

  it('marks a closed job done on the map and gives it no next pin', () => {
    const stops = routeStops([visit('flash', 11, { jobId: 'j' })], NOW, NOW, [{ id: 'j', status: 'done' }]);
    expect(stops.map((s) => s.kind)).toEqual(['done']);
  });
});
