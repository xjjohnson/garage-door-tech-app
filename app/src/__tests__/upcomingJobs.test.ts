import { startOfTomorrow } from '../components/OdooJobsList';

describe('upcoming jobs', () => {
  it('starts at the next midnight on the phone', () => {
    const noon = new Date(2026, 10, 17, 12, 30).getTime();
    const t = new Date(startOfTomorrow(noon));
    expect([t.getFullYear(), t.getMonth(), t.getDate(), t.getHours(), t.getMinutes()]).toEqual([2026, 10, 18, 0, 0]);
    const late = new Date(2026, 10, 17, 23, 59).getTime();
    expect(new Date(startOfTomorrow(late)).getDate()).toBe(18);
  });
});
