import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { customerAddresses, fromPhoton, photonUrl, suggestAddresses, worthAsking } from '../lib/addressSuggest';
import type { Customer } from '../lib/customers';
import { CUSTOMERS_STORAGE_KEY } from '../lib/customers';
import { addressKey, GEOCODE_STORAGE_KEY, parseCache } from '../lib/geocode';
import { DEBOUNCE_MS, setAddressSuggestDeps } from '../lib/useAddressSuggestions';
import { renderApp } from '../testing/renderApp';

const house = (over: Record<string, unknown> = {}, coords: [number, number] = [-97.877, 29.989]) => ({
  geometry: { coordinates: coords },
  properties: { countrycode: 'US', housenumber: '400', street: 'Main St', city: 'Kyle', state: 'Texas', postcode: '78640-1234', type: 'house', ...over },
});

const customer = (over: Partial<Customer>): Customer => ({ id: 'c1', name: 'Pat Lee', phone: '', email: '', address: '12 Elm St, Buda, TX 78610', notes: '', createdAt: 1, updatedAt: 1, ...over });

describe('address suggestions from Photon', () => {
  it('asks only once a few characters with a letter are typed', () => {
    expect(worthAsking('400')).toBe(false);
    expect(worthAsking('40 M')).toBe(true);
    expect(worthAsking('  ab ')).toBe(false);
  });

  it('leans the search toward Kyle and keeps houses and streets', () => {
    const u = photonUrl(' 400 Main ');
    expect(u).toContain('q=400%20Main');
    expect(u).toContain('lat=29.99&lon=-97.88');
    expect(u).toContain('layer=house&layer=street');
  });

  it('formats a house as street, city, state and ZIP with its map point', () => {
    expect(fromPhoton(house())).toEqual({ address: '400 Main St, Kyle, TX 78640', street: '400 Main St', city: 'Kyle', zip: '78640', point: { lat: 29.989, lon: -97.877 } });
  });

  it('uses the name of a street result and skips places that are not US streets', () => {
    expect(fromPhoton(house({ street: undefined, housenumber: undefined, name: 'Center St', type: 'street' }))?.address).toBe('Center St, Kyle, TX 78640');
    expect(fromPhoton(house({ countrycode: 'MX' }))).toBeNull();
    expect(fromPhoton(house({ street: undefined, name: 'Kyle City Hall', type: 'house' }))).toBeNull();
  });

  it('drops repeats and throws when Photon fails', async () => {
    const ok = jest.fn(async () => ({ ok: true, json: async () => ({ features: [house(), house(), house({ housenumber: '402' })] }) }));
    expect((await suggestAddresses(ok, '400 Main')).map((a) => a.address)).toEqual(['400 Main St, Kyle, TX 78640', '402 Main St, Kyle, TX 78640']);
    expect(await suggestAddresses(ok, 'ab')).toEqual([]);
    expect(ok).toHaveBeenCalledTimes(1);
    await expect(suggestAddresses(async () => ({ ok: false, json: async () => ({}) }), '400 Main')).rejects.toThrow('Photon error');
  });
});

describe('saved customers in the suggestions', () => {
  it('matches the address or the name, ignoring spaces and commas', () => {
    const list = [customer({}), customer({ id: 'c2', name: 'Sam Ortiz', address: '9 Oak Ave, Kyle' }), customer({ id: 'c3', name: 'No Address', address: '' })];
    expect(customerAddresses(list, '12 elm').map((a) => a.customerId)).toEqual(['c1']);
    expect(customerAddresses(list, 'ortiz')).toEqual([expect.objectContaining({ customerId: 'c2', name: 'Sam Ortiz', address: '9 Oak Ave, Kyle' })]);
    expect(customerAddresses(list, 'no a')).toEqual([]);
    expect(customerAddresses(list, 'el')).toEqual([]);
  });
});

describe('New job address autofill', () => {
  let reset: () => void;
  const fetchFn = jest.fn(async () => ({ ok: true, json: async () => ({ features: [house()] }) }));

  beforeEach(async () => {
    await AsyncStorage.clear();
    fetchFn.mockClear();
    reset = setAddressSuggestDeps({ fetchFn });
  });
  afterEach(() => reset());

  const settle = async () => {
    for (let i = 0; i < 5; i++) await act(async () => undefined);
  };

  it('suggests an address after a pause, fills it on a tap and pins it for the map', async () => {
    await renderApp('/new-job');
    await fireEvent.changeText(screen.getByTestId('new-job-address'), '400 Ma');
    await fireEvent.changeText(screen.getByTestId('new-job-address'), '400 Main');
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE_MS);
    });
    await settle();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('new-job-place-0')).toHaveTextContent(/400 Main St.*Kyle 78640/);

    await fireEvent.press(screen.getByTestId('new-job-place-0'));
    await settle();
    expect(screen.getByTestId('new-job-address').props.value).toBe('400 Main St, Kyle, TX 78640');
    expect(screen.queryByTestId('new-job-place-0')).toBeNull();
    const cache = parseCache(await AsyncStorage.getItem(GEOCODE_STORAGE_KEY));
    expect(cache[addressKey('400 Main St, Kyle, TX 78640')]?.p).toEqual({ lat: 29.989, lon: -97.877 });
  });

  it('lists a saved customer first and picking one fills their details', async () => {
    await AsyncStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify([customer({ phone: '555 010 0100' })]));
    await renderApp('/new-job');
    await settle();
    await fireEvent.changeText(screen.getByTestId('new-job-address'), '12 Elm');
    await settle();
    expect(screen.getByTestId('new-job-place-0')).toHaveTextContent(/Pat Lee.*Saved customer/);
    await fireEvent.press(screen.getByTestId('new-job-place-0'));
    await settle();
    expect(screen.getByTestId('new-job-name').props.value).toBe('Pat Lee');
    expect(screen.getByTestId('new-job-address').props.value).toBe('12 Elm St, Buda, TX 78610');
  });
});
