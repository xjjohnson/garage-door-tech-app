import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { makeBackup, parseBackup } from '../lib/backup';
import { CUSTOMERS_STORAGE_KEY } from '../lib/customers';
import { DEFAULT_PRICE_SHEET } from '../lib/prices';
import { addDays, Appointment, dayLabel, formatTime, mapsLink, mergeSchedule, onDay, onMyWayText, overlaps, parseSchedule, reminderText, SCHEDULE_STORAGE_KEY, slotsFor, startOfDay, upcoming } from '../lib/schedule';
import { renderApp } from '../testing/renderApp';

const DAY0 = new Date(2026, 10, 11).getTime(); // Wed, Nov 11
const at = (day: number, h: number, m = 0) => {
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};
const appt = (id: string, start: number, extra: Partial<Appointment> = {}): Appointment => ({
  id,
  start,
  minutes: 60,
  name: 'Pat Smith',
  address: '1 Oak St',
  phone: '555-123-4567',
  what: 'Broken spring',
  status: 'booked',
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

describe('schedule (plain logic)', () => {
  it('offers half-hour slots from 7am to 6pm and labels days', () => {
    const slots = slotsFor(at(DAY0, 15));
    expect(slots).toHaveLength(23);
    expect(formatTime(slots[0])).toBe('7:00 am');
    expect(formatTime(slots[10])).toBe('12:00 pm');
    expect(formatTime(slots[22])).toBe('6:00 pm');
    expect(dayLabel(DAY0, at(DAY0, 9))).toBe('Today');
    expect(dayLabel(addDays(DAY0, 1), DAY0)).toBe('Tomorrow');
    expect(dayLabel(addDays(DAY0, 2), DAY0)).toBe('Fri, Nov 13');
  });

  it('sorts a day, finds clashes and the next visits', () => {
    const list = [appt('b', at(DAY0, 13)), appt('a', at(DAY0, 9)), appt('c', at(DAY0, 9, 30), { status: 'cancelled' }), appt('t', at(addDays(DAY0, 1), 8))];
    expect(onDay(list, DAY0).map((a) => a.id)).toEqual(['a', 'c', 'b']);
    // 9:30 overlaps 9:00-10:00; the cancelled one doesn't count.
    expect(overlaps(list, { id: 'new', start: at(DAY0, 9, 30), minutes: 30 }).map((a) => a.id)).toEqual(['a']);
    expect(overlaps(list, { id: 'new', start: at(DAY0, 10), minutes: 60 })).toEqual([]);
    expect(upcoming(list, at(DAY0, 9, 30), 2).map((a) => a.id)).toEqual(['a', 'b']);
    expect(upcoming(list, at(DAY0, 10, 1), 5).map((a) => a.id)).toEqual(['b', 't']);
  });

  it('writes the texts and a maps link', () => {
    expect(onMyWayText({ name: 'Pat Smith' }, 'Ace Doors', 30)).toBe("Hi Pat, it's Ace Doors. I'm on my way and should be there in about 30 minutes.");
    expect(reminderText({ name: 'Pat', start: at(addDays(DAY0, 1), 9) }, 'Ace Doors', DAY0)).toBe("Hi Pat, it's Ace Doors. Just confirming your garage door appointment tomorrow at 9:00 am. Reply if you need to change it.");
    expect(reminderText({ name: '', start: at(addDays(DAY0, 2), 14, 30) }, '', DAY0)).toBe(
      "Hi there, it's your garage door tech. Just confirming your garage door appointment on Fri, Nov 13 at 2:30 pm. Reply if you need to change it.",
    );
    expect(mapsLink('1 Oak St, Springfield')).toBe('https://www.google.com/maps/search/?api=1&query=1%20Oak%20St%2C%20Springfield');
    expect(mapsLink('  ')).toBeUndefined();
  });

  it('reads saved visits safely and merges by last change', () => {
    expect(parseSchedule('junk')).toEqual([]);
    expect(parseSchedule([{ id: 'x' }, null, { id: 'ok', start: 5, status: 'weird' }])).toEqual([
      { id: 'ok', start: 5, minutes: 60, name: '', address: '', phone: '', what: '', status: 'booked', createdAt: 5, updatedAt: 5 },
    ]);
    const mine = appt('a', 1, { updatedAt: 10, what: 'Mine' });
    const merged = mergeSchedule([mine], [appt('a', 1, { updatedAt: 5, what: 'Old' }), appt('b', 2)]);
    expect(merged.map((a) => [a.id, a.what])).toEqual([
      ['a', 'Mine'],
      ['b', 'Broken spring'],
    ]);
  });

  it('goes into backups, and older backups read as having none', () => {
    const file = makeBackup({ jobs: [], appointments: [appt('a', 1)], priceSheet: DEFAULT_PRICE_SHEET }, DAY0);
    const parsed = parseBackup(file);
    expect(parsed.ok && parsed.backup.appointments.map((a) => a.id)).toEqual(['a']);
    const old = parseBackup(JSON.stringify({ format: 'garage-door-tech-backup', version: 1, jobs: [] }));
    expect(old.ok && old.backup.appointments).toEqual([]);
  });
});

describe('schedule screen', () => {
  afterEach(() => jest.restoreAllMocks());

  async function settle(n = 5) {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  }

  it('books a visit for a saved customer from their page, then texts on the day', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify([{ id: 'c1', name: 'Pat Smith', phone: '555-123-4567', email: '', address: '1 Oak St', notes: '', createdAt: 1, updatedAt: 1 }]));
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const app = await renderApp('/customer/c1');
    await settle();
    await fireEvent.press(screen.getByTestId('customer-book'));
    await settle();
    expect(app.getPathname()).toBe('/schedule');
    const sheet = screen.getByTestId('book-sheet');
    expect(screen.getByTestId('book-address').props.value).toBe('1 Oak St');
    await fireEvent.press(within(sheet).getByText('Tune-up'));
    await fireEvent.press(within(screen.getByTestId('book-day')).getByText('Tomorrow'));
    await fireEvent.press(within(screen.getByTestId('book-time')).getByText('9:00 am'));
    expect(screen.getByTestId('book-save')).toHaveTextContent('Book Tomorrow 9:00 am');
    await fireEvent.press(screen.getByTestId('book-save'));
    await settle(3);

    const saved = parseSchedule(await AsyncStorage.getItem(SCHEDULE_STORAGE_KEY));
    expect(saved).toHaveLength(1);
    const a = saved[0];
    expect(a).toMatchObject({ customerId: 'c1', name: 'Pat Smith', what: 'Tune-up', minutes: 60, status: 'booked' });
    expect(a.start).toBe(at(addDays(startOfDay(Date.now()), 1), 9));
    expect(screen.getByTestId('schedule-day')).toHaveTextContent('Tomorrow: 1 booked');

    await fireEvent.press(screen.getByTestId(`visit-omw-${a.id}`));
    await fireEvent.press(screen.getByTestId(`visit-eta-30-${a.id}`));
    expect(open).toHaveBeenLastCalledWith(expect.stringMatching(/^sms:5551234567\?body=Hi%20Pat.*30%20minutes/));
    await fireEvent.press(screen.getByTestId(`visit-maps-${a.id}`));
    expect(open).toHaveBeenLastCalledWith(expect.stringContaining('query=1%20Oak%20St'));
    await fireEvent.press(screen.getByTestId(`visit-done-${a.id}`));
    await settle(3);
    expect(parseSchedule(await AsyncStorage.getItem(SCHEDULE_STORAGE_KEY))[0].status).toBe('done');
    expect(screen.getByTestId('schedule-day')).toHaveTextContent('Tomorrow: 0 booked');
  });

  it('shows the next visit on Jobs and warns about a clash when booking', async () => {
    await AsyncStorage.clear();
    const tomorrow = addDays(startOfDay(Date.now()), 1);
    await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify([appt('a', at(tomorrow, 9))]));
    const app = await renderApp('/jobs');
    await settle();
    expect(screen.getByTestId('open-schedule')).toHaveTextContent(/Tomorrow 9:00 am · Pat Smith/);
    await fireEvent.press(screen.getByTestId('open-schedule'));
    expect(app.getPathname()).toBe('/schedule');
    await fireEvent.press(screen.getByTestId('schedule-book'));
    await fireEvent.changeText(screen.getByTestId('book-name'), 'Lee');
    await fireEvent.press(within(screen.getByTestId('book-day')).getByText('Tomorrow'));
    await fireEvent.press(within(screen.getByTestId('book-time')).getByText('9:30 am'));
    expect(screen.getByTestId('book-clash')).toHaveTextContent('Overlaps 9:00 am Pat Smith');
    await fireEvent.press(within(screen.getByTestId('book-time')).getByText('10:00 am'));
    expect(screen.queryByTestId('book-clash')).toBeNull();
  });
});
