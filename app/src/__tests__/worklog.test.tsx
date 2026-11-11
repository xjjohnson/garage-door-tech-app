import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Share } from 'react-native';
import { makeBackup, parseBackup } from '../lib/backup';
import { DEFAULT_PRICE_SHEET } from '../lib/prices';
import { DEFAULT_CENTS_PER_MILE, formatHours, inPeriod, mergeWorkLog, openShift, parseWorkLog, Shift, shiftMiles, totals, weekOf, WORK_LOG_STORAGE_KEY, workLogCsv } from '../lib/worklog';
import { renderApp } from '../testing/renderApp';

const H = 3_600_000;
const WED = new Date(2026, 10, 11, 7, 30).getTime(); // Wed, Nov 11 2026
const shift = (id: string, start: number, extra: Partial<Shift> = {}): Shift => ({ id, start, end: start + 8 * H, note: '', updatedAt: start, ...extra });

describe('time and miles (plain logic)', () => {
  it('works out miles from the odometer, unless typed in', () => {
    expect(shiftMiles(shift('a', WED, { odoStart: 1000, odoEnd: 1084 }))).toBe(84);
    expect(shiftMiles(shift('a', WED, { odoStart: 1000, odoEnd: 1084, miles: 90 }))).toBe(90);
    expect(shiftMiles(shift('a', WED, { odoStart: 1000 }))).toBe(0);
    expect(shiftMiles(shift('a', WED, { odoStart: 1000, odoEnd: 900 }))).toBe(0);
    expect(formatHours(3 * H + 5 * 60_000)).toBe('3h 05m');
  });

  it('totals a Monday-to-Sunday week with the deduction', () => {
    const week = weekOf(WED);
    expect(new Date(week.start)).toEqual(new Date(2026, 10, 9));
    const list = [shift('mon', new Date(2026, 10, 9, 8).getTime(), { miles: 50 }), shift('wed', WED, { odoStart: 100, odoEnd: 200 }), shift('prev', new Date(2026, 10, 8, 8).getTime(), { miles: 999 })];
    const mine = inPeriod(list, week);
    expect(mine.map((s) => s.id)).toEqual(['mon', 'wed']);
    expect(totals(mine, 70, WED)).toEqual({ days: 2, ms: 16 * H, miles: 150, deductionCents: 10500 });
    expect(inPeriod(list, weekOf(WED, -1)).map((s) => s.id)).toEqual(['prev']);
  });

  it('finds the day still on the clock', () => {
    expect(openShift([shift('a', WED), shift('b', WED + H, { end: undefined })])?.id).toBe('b');
    expect(openShift([shift('a', WED)])).toBeUndefined();
  });

  it('writes a CSV with a total row', () => {
    const csv = workLogCsv([shift('a', WED, { odoStart: 100, odoEnd: 150, note: 'Parts run, "Home Depot"' })], 70, WED);
    expect(csv.split('\n')).toEqual([
      'Date,Start,End,Hours,Odometer start,Odometer end,Miles,Deduction ($),Note',
      '2026-11-11,7:30 am,3:30 pm,8.00,100,150,50,35.00,"Parts run, ""Home Depot"""',
      'Total,,,8.00,,,50,35.00,',
    ]);
  });

  it('reads saved data safely, merges, and goes into backups', () => {
    expect(parseWorkLog('junk')).toEqual({ shifts: [], centsPerMile: DEFAULT_CENTS_PER_MILE });
    expect(parseWorkLog({ shifts: [{ id: 'x' }, { id: 'ok', start: 5, miles: -3 }], centsPerMile: 72 })).toEqual({ shifts: [{ id: 'ok', start: 5, note: '', updatedAt: 5 }], centsPerMile: 72 });
    const merged = mergeWorkLog({ shifts: [shift('a', 1, { updatedAt: 10, note: 'mine' })], centsPerMile: 70 }, { shifts: [shift('a', 1, { updatedAt: 5 }), shift('b', 2)], centsPerMile: 72 });
    expect(merged.shifts.map((s) => [s.id, s.note])).toEqual([
      ['a', 'mine'],
      ['b', ''],
    ]);
    expect(merged.centsPerMile).toBe(72);
    const file = makeBackup({ jobs: [], workLog: { shifts: [shift('a', 1)], centsPerMile: 72 }, priceSheet: DEFAULT_PRICE_SHEET }, WED);
    const parsed = parseBackup(file);
    expect(parsed.ok && parsed.backup.workLog?.centsPerMile).toBe(72);
  });
});

describe('time and miles screen', () => {
  afterEach(() => jest.restoreAllMocks());
  const settle = async (n = 5) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };
  const typeKeys = async (digits: string) => {
    for (const d of digits) await fireEvent.press(screen.getByTestId(`key-${d}`));
    await fireEvent.press(screen.getByTestId('keypad-done'));
  };

  it('clocks in and out with the odometer and totals the week', async () => {
    await AsyncStorage.clear();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    const app = await renderApp('/jobs');
    jest.setSystemTime(WED);
    await settle();
    expect(screen.getByTestId('open-time-log')).toHaveTextContent('Time and miles');
    await fireEvent.press(screen.getByTestId('open-time-log'));
    expect(app.getPathname()).toBe('/time-log');
    expect(screen.getByTestId('clock-status')).toHaveTextContent('Off the clock');

    await fireEvent.press(screen.getByTestId('clock-odometer'));
    await typeKeys('45210');
    await fireEvent.press(screen.getByTestId('clock-in'));
    await act(async () => {
      jest.advanceTimersByTime(2 * H + 15 * 60_000);
    });
    expect(screen.getByTestId('clock-status')).toHaveTextContent('On the clock 2h 15m');

    await fireEvent.press(screen.getByTestId('clock-odometer'));
    await typeKeys('45272');
    await fireEvent.press(screen.getByTestId('clock-out'));
    await settle(3);
    expect(screen.getByTestId('clock-status')).toHaveTextContent('Off the clock');
    expect(screen.getByTestId('time-totals')).toHaveTextContent(/2h 15m.*62.*\$43\.40/);

    const saved = parseWorkLog(await AsyncStorage.getItem(WORK_LOG_STORAGE_KEY));
    expect(saved.shifts).toHaveLength(1);
    expect(saved.shifts[0]).toMatchObject({ odoStart: 45210, odoEnd: 45272 });

    await fireEvent.press(screen.getByTestId('time-share'));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining(',45210,45272,62,43.40,') }));
  });
});
