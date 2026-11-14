import { nearDays } from '../lib/routeDays';
import { addDays, startOfDay } from '../lib/schedule';

const D0 = startOfDay(new Date(2026, 10, 16, 12).getTime());
const v = (dayOffset: number, address: string, name = 'Pat', status: 'booked' | 'done' | 'cancelled' = 'booked') => ({ start: addDays(D0, dayOffset) + 9 * 3600000, status, address, name });
const KYLE = { lat: 29.989, lon: -97.877 };
const BUDA = { lat: 30.085, lon: -97.84 }; // about 7 mi
const AUSTIN = { lat: 30.267, lon: -97.743 }; // about 22 mi

describe('nearDays', () => {
  const days = [0, 1, 2, 3].map((i) => addDays(D0, i));
  const points = { '1 A St': BUDA, '2 B St': AUSTIN, '3 C St': { lat: 29.99, lon: -97.878 }, '4 D St': null };

  it('lists days with a booked visit within 10 miles, closest first', () => {
    const out = nearDays([v(0, '1 A St', 'Ann'), v(1, '2 B St'), v(2, '3 C St', 'Cy'), v(2, '1 A St', 'Ann')], points, KYLE, days);
    expect(out.map((n) => n.day)).toEqual([days[2], days[0]]);
    expect(out[0]).toMatchObject({ name: 'Cy', count: 2 });
    expect(out[1].miles).toBeGreaterThan(5);
  });

  it('skips cancelled, done, unfound, out-of-window visits and the same address', () => {
    expect(nearDays([v(0, '1 A St', 'x', 'cancelled'), v(1, '1 A St', 'x', 'done'), v(2, '4 D St'), v(9, '1 A St'), v(3, '3 C St')], points, KYLE, days, 10, '3 C St')).toEqual([]);
  });

  it('gives nothing without a point for the new address', () => {
    expect(nearDays([v(0, '1 A St')], points, null, days)).toEqual([]);
  });
});
