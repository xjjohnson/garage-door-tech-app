import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen } from '@testing-library/react-native';
import { addressKey, GeoFetch } from '../lib/geocode';
import { SCHEDULE_STORAGE_KEY } from '../lib/schedule';
import { setGeocodeDeps } from '../lib/useGeocode';
import { setWeatherDeps } from '../lib/useWeather';
import { hourStamp, hoursFor, parseHours, summarize, weatherText, weatherUrl } from '../lib/weather';
import { renderApp } from '../testing/renderApp';

const hour = (time: string, tempF: number, rain: number, code = 0) => ({ time, tempF, rain, code });

describe('weather (plain logic)', () => {
  it('asks Open-Meteo in Fahrenheit for the house and reads the hours', () => {
    expect(weatherUrl({ lat: 30.0049, lon: -97.8731 })).toMatch(/^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=30\.00&longitude=-97\.87&hourly=.*temperature_unit=fahrenheit&timezone=auto/);
    const h = parseHours({ hourly: { time: ['2026-11-14T09:00', 'x'], temperature_2m: [71.2, 'bad'], precipitation_probability: [20, 0], weather_code: [3, 0] } });
    expect(h).toEqual([hour('2026-11-14T09:00', 71.2, 20, 3)]);
    expect(parseHours(null)).toEqual([]);
  });

  it('picks the hours of a visit and describes the worst of them', () => {
    const start = new Date(2026, 10, 14, 14, 30).getTime();
    expect(hourStamp(start)).toBe('2026-11-14T14');
    const hours = [hour('2026-11-14T13:00', 80, 0), hour('2026-11-14T14:00', 84, 70, 61), hour('2026-11-14T15:00', 83, 40), hour('2026-11-14T16:00', 80, 0)];
    expect(hoursFor(hours, start, 60).map((x) => x.time)).toEqual(['2026-11-14T14:00', '2026-11-14T15:00']);
    const s = summarize(hoursFor(hours, start, 60))!;
    expect(s).toMatchObject({ tempF: 84, rain: 70, label: 'Rain likely', warn: true });
    expect(weatherText(s)).toBe('Rain likely · 84°F · 70% rain');
    expect(summarize([hour('t', 95, 0)])).toMatchObject({ label: 'Hot', warn: false });
    expect(summarize([hour('t', 102, 0)])).toMatchObject({ label: 'Very hot', warn: true });
    expect(summarize([])).toBeNull();
  });
});

describe('weather on Today', () => {
  it('shows rain on the next visit, and nothing when the forecast cannot be reached', async () => {
    await AsyncStorage.clear();
    const start = Date.now() + 3600000;
    const appt = { id: 'a1', start, minutes: 60, name: 'Pat Lee', address: '1 Elm St', phone: '', what: 'Gate', status: 'booked', createdAt: 1, updatedAt: 1 };
    await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify([appt]));
    const geo: GeoFetch = async (url) => {
      expect(addressKey(decodeURIComponent(new URL(url).searchParams.get('q') ?? ''))).toContain('1 elm st');
      return { ok: true, json: async () => [{ lat: '40.00', lon: '-75.00' }] };
    };
    const resetGeo = setGeocodeDeps({ fetchFn: geo, sleep: async () => undefined });
    const stamp = hourStamp(start);
    const resetWeather = setWeatherDeps({
      fetchFn: async () => ({
        ok: true,
        json: async () => ({ hourly: { time: [`${stamp}:00`], temperature_2m: [66], precipitation_probability: [80], weather_code: [63] } }),
      }),
    });
    await renderApp();
    expect(await screen.findByTestId('weather-a1')).toHaveTextContent('Rain likely · 66°F · 80% rain');
    expect(screen.getByTestId('today-weather-day')).toHaveTextContent(/rain likely/i);
    resetWeather();
    setWeatherDeps({
      fetchFn: async () => {
        throw new Error('offline');
      },
    });
    await renderApp();
    expect(await screen.findByTestId('today-next')).toBeTruthy();
    expect(screen.queryByTestId('weather-a1')).toBeNull();
    resetGeo();
  });
});
