import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { Linking } from 'react-native';
import WebView from 'react-native-webview';
import { addressKey, cached, GEOCODE_STORAGE_KEY, GeoFetch, googleNavLink, googleRouteLink, lookUp, miles, MISS_RETRY_MS, nominatimUrl, parseCache, wazeNavLink } from '../lib/geocode';
import { INVOICES_STORAGE_KEY } from '../lib/invoices';
import { mapHtml, parseMapMessage, setDataScript } from '../lib/mapHtml';
import { SCHEDULE_STORAGE_KEY } from '../lib/schedule';
import { setGeocodeDeps } from '../lib/useGeocode';
import { routeStops } from '../screens/TodayMapScreen';
import { renderApp } from '../testing/renderApp';

const injected = (WebView as unknown as { injected: string[] }).injected;

const PLACES: Record<string, { lat: string; lon: string } | undefined> = {
  '1 elm st': { lat: '40.00', lon: '-75.00' },
  '9 oak ave': { lat: '40.05', lon: '-75.02' },
  '5 far rd': { lat: '42.00', lon: '-70.00' },
  '7 pine ln': { lat: '40.02', lon: '-75.01' },
};

function fakeNominatim() {
  const asked: string[] = [];
  const fetchFn: GeoFetch = async (url) => {
    const q = decodeURIComponent(new URL(url).searchParams.get('q') ?? '');
    asked.push(q);
    const hit = PLACES[addressKey(q)];
    return { ok: true, json: async () => (hit ? [hit] : []) };
  };
  return { fetchFn, asked };
}

const at = (h: number) => {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.getTime();
};

describe('geocoding and map links (plain logic)', () => {
  it('keys, caches and retries misses after a week', () => {
    expect(addressKey('  1 Elm St ,Springfield  ')).toBe('1 elm st, springfield');
    const c = parseCache(JSON.stringify({ '1 elm st': { p: { lat: 1, lon: 2 }, t: 5 }, 'nope': { p: null, t: 10 }, bad: { p: 'x' } }));
    expect(Object.keys(c)).toEqual(['1 elm st', 'nope']);
    expect(cached(c, '1 Elm St', 100)).toEqual({ lat: 1, lon: 2 });
    expect(cached(c, 'nope', 11)).toBeNull();
    expect(cached(c, 'nope', 11 + MISS_RETRY_MS)).toBeUndefined();
    expect(cached(c, 'new', 0)).toBeUndefined();
    expect(parseCache('garbage')).toEqual({});
  });

  it('asks Nominatim with the app name and reads the answer', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const point = await lookUp(async (url, init) => {
      seen.push({ url, headers: init.headers });
      return { ok: true, json: async () => [{ lat: '40.1', lon: '-75.2' }] };
    }, '1 Elm St');
    expect(point).toEqual({ lat: 40.1, lon: -75.2 });
    expect(seen[0].url).toBe(nominatimUrl('1 Elm St'));
    expect(seen[0].url).toMatch(/^https:\/\/nominatim\.openstreetmap\.org\/search\?format=jsonv2&limit=1&countrycodes=us&q=1%20Elm%20St$/);
    expect(seen[0].headers['User-Agent']).toMatch(/Johnsons/);
    expect(await lookUp(async () => ({ ok: true, json: async () => [] }), 'x')).toBeNull();
    await expect(lookUp(async () => ({ ok: false, json: async () => [] }), 'x')).rejects.toThrow();
  });

  it('measures miles and builds Google Maps and Waze links', () => {
    expect(miles({ lat: 40, lon: -75 }, { lat: 41, lon: -75 })).toBeCloseTo(69.1, 0);
    expect(googleNavLink('1 Elm St', { lat: 40, lon: -75 })).toBe('https://www.google.com/maps/dir/?api=1&destination=40%2C-75&travelmode=driving');
    expect(googleNavLink('1 Elm St')).toBe('https://www.google.com/maps/dir/?api=1&destination=1%20Elm%20St&travelmode=driving');
    expect(wazeNavLink('1 Elm St', { lat: 40, lon: -75 })).toBe('https://waze.com/ul?ll=40,-75&navigate=yes');
    expect(wazeNavLink('1 Elm St')).toBe('https://waze.com/ul?q=1%20Elm%20St&navigate=yes');
    expect(googleRouteLink(['1 Elm St', '', '9 Oak Ave', '7 Pine Ln'])).toBe('https://www.google.com/maps/dir/?api=1&destination=7%20Pine%20Ln&travelmode=driving&waypoints=1%20Elm%20St%7C9%20Oak%20Ave');
    expect(googleRouteLink([])).toBeUndefined();
  });

  it('numbers the day in order and marks the next stop', () => {
    const base = { minutes: 60, phone: '', what: '', createdAt: 1, updatedAt: 1 };
    const stops = routeStops(
      [
        { ...base, id: 'b', start: at(13), name: 'B', address: '9 Oak Ave', status: 'booked' },
        { ...base, id: 'a', start: at(9), name: 'A', address: '1 Elm St', status: 'done' },
        { ...base, id: 'x', start: at(10), name: 'X', address: '', status: 'cancelled' },
        { ...base, id: 'c', start: at(15), name: 'C', address: '7 Pine Ln', status: 'booked' },
      ],
      at(11),
    );
    expect(stops.map((s) => [s.label, s.kind, s.appointment?.id])).toEqual([['1', 'done', 'a'], ['2', 'next', 'b'], ['3', 'stop', 'c']]);
  });

  it('builds a page that loads Leaflet with OpenStreetMap tiles and talks back', () => {
    const html = mapHtml('#002D04');
    expect(html).toMatch(/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.js/);
    expect(html).toMatch(/tile\.openstreetmap\.org/);
    expect(html).toMatch(/OpenStreetMap contributors/);
    expect(parseMapMessage('{"type":"pick","id":"stop-a"}')).toEqual({ type: 'pick', id: 'stop-a' });
    expect(parseMapMessage('{"type":"pick"}')).toBeNull();
    expect(parseMapMessage('nope')).toBeNull();
    expect(setDataScript({ pins: [{ id: '</script>', lat: 1, lon: 2, label: '1', kind: 'stop' }], route: [], fit: true })).toBe(
      'window.setData && window.setData({"pins":[{"id":"</script>","lat":1,"lon":2,"label":"1","kind":"stop"}],"route":[],"fit":true}); true;',
    );
  });
});

describe('Today › Map', () => {
  let reset: () => void;
  let openURL: jest.SpyInstance;
  let nominatim: ReturnType<typeof fakeNominatim>;
  const settle = async (n = 12) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
    injected.length = 0;
    nominatim = fakeNominatim();
    reset = setGeocodeDeps({ fetchFn: nominatim.fetchFn, sleep: async () => undefined });
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });
  afterEach(() => {
    reset();
    openURL.mockRestore();
  });

  const visits = () => {
    const base = { minutes: 60, phone: '555-010-0100', createdAt: 1, updatedAt: 1, status: 'booked' };
    return [
      { ...base, id: 'v1', start: at(23) - 3600000 * 2, name: 'Pat Lee', address: '1 Elm St', what: 'Broken spring' },
      { ...base, id: 'v2', start: at(23) - 3600000, name: 'Sam Ortiz', address: '9 Oak Ave', what: 'Tune-up' },
    ];
  };
  const pickPin = async (id: string) => {
    const props = screen.getByTestId('map-webview').props.webProps;
    await act(async () => props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'pick', id }) } }));
  };

  it('pins the day in order, navigates, and remembers addresses', async () => {
    await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(visits()));
    await renderApp();
    await settle();
    await fireEvent.press(within(screen.getByTestId('today-view')).getByText('Map'));
    await settle();
    const props = screen.getByTestId('map-webview').props.webProps;
    expect(props.source.html).toMatch(/leaflet/);
    await act(async () => props.onMessage({ nativeEvent: { data: '{"type":"ready"}' } }));
    await settle();

    expect(nominatim.asked).toEqual(['1 Elm St', '9 Oak Ave']);
    const last = injected.at(-1)!;
    expect(last).toContain('"id":"stop-v1","lat":40,"lon":-75,"label":"1","kind":"next"');
    expect(last).toContain('"id":"stop-v2","lat":40.05,"lon":-75.02,"label":"2","kind":"stop"');
    expect(last).toContain('"route":[[40,-75],[40.05,-75.02]]');
    expect(screen.getByTestId('map-row-stop-v1')).toHaveTextContent(/1 · Pat Lee.*1 Elm St · Broken spring/);

    await pickPin('stop-v2');
    expect(screen.getByTestId('map-selected')).toHaveTextContent(/2 · Sam Ortiz.*3\.6 mi from 1/);
    await fireEvent.press(screen.getByTestId('map-nav-google'));
    expect(openURL).toHaveBeenLastCalledWith('https://www.google.com/maps/dir/?api=1&destination=40.05%2C-75.02&travelmode=driving');
    await fireEvent.press(screen.getByTestId('map-nav-waze'));
    expect(openURL).toHaveBeenLastCalledWith('https://waze.com/ul?ll=40.05,-75.02&navigate=yes');
    await fireEvent.press(screen.getByTestId('map-route'));
    expect(openURL).toHaveBeenLastCalledWith(expect.stringMatching(/destination=9%20Oak%20Ave.*waypoints=1%20Elm%20St$/));

    const saved = parseCache(await AsyncStorage.getItem(GEOCODE_STORAGE_KEY));
    expect(saved['9 oak ave'].p).toEqual({ lat: 40.05, lon: -75.02 });
  });

  it('opens the job from a pin', async () => {
    await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(visits()));
    const app = await renderApp();
    await settle();
    await fireEvent.press(within(screen.getByTestId('today-view')).getByText('Map'));
    await settle();
    await pickPin('stop-v1');
    await fireEvent.press(screen.getByTestId('map-open-job'));
    expect(app.getPathname()).toMatch(/^\/job\//);
  });

  it('shows customers who owe money near the route, not far ones, and says which addresses it could not find', async () => {
    await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify([...visits(), { ...visits()[0], id: 'v3', address: '404 Nowhere', name: 'Lost' }]));
    const inv = (id: string, address: string, billTo: string) => ({
      id, number: id, jobId: 'j', billTo, address, tier: 'good', lines: [{ id: 'l', label: 'Spring', qty: 1, cents: 25000 }], subtotal: 25000, tax: 0, total: 25000, payments: [], createdAt: 1, updatedAt: 1,
    });
    await AsyncStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify([inv('1001', '7 Pine Ln', 'Kim Park'), inv('1002', '5 Far Rd', 'Far Away')]));
    await renderApp();
    await settle();
    await fireEvent.press(within(screen.getByTestId('today-view')).getByText('Map'));
    await settle();
    await fireEvent.press(screen.getByTestId('map-nearby'));
    await settle();
    expect(screen.getByTestId('map-row-owed-1001')).toHaveTextContent(/\$.*Kim Park owes \$250(?!\d)/);
    expect(screen.queryByTestId('map-row-owed-1002')).toBeNull();
    expect(screen.getByTestId('map-status')).toHaveTextContent(/1 address not found.*1 nearby/);
    await pickPin('owed-1001');
    expect(screen.getByTestId('map-selected')).toHaveTextContent(/Kim Park owes/);
    expect(screen.queryByTestId('map-open-job')).toBeNull();
  });
});
