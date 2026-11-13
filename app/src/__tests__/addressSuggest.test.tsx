import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { customerAddresses, fromPhoton, photonUrl, suggestAddresses, typedNumber, worthAsking } from '../lib/addressSuggest';
import { searchAddresses } from '../lib/odooContacts';
import type { OdooClient } from '../lib/odoo';
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

describe('house numbers OpenStreetMap doesn\'t have', () => {
  const street = (over: Record<string, unknown> = {}) => house({ housenumber: undefined, street: undefined, name: 'Main St', type: 'street', ...over });

  it('puts the typed number on a street with none, and drops its point', () => {
    expect(typedNumber('400 Main')).toBe('400');
    expect(typedNumber('12b Oak')).toBe('12b');
    expect(typedNumber('Main St')).toBe('');
    expect(fromPhoton(street(), '400')).toEqual({ address: '400 Main St, Kyle, TX 78640', street: '400 Main St', city: 'Kyle', zip: '78640' });
    // A numbered house keeps its own number and point.
    expect(fromPhoton(house({ housenumber: '402' }), '400')).toMatchObject({ street: '402 Main St', point: { lat: 29.989, lon: -97.877 } });
  });

  it('lists numbered houses first', async () => {
    const fetchFn = jest.fn(async () => ({ ok: true, json: async () => ({ features: [street({ name: 'Main Ave', city: 'Buda' }), house()] }) }));
    expect((await suggestAddresses(fetchFn, '400 Main')).map((a) => a.address)).toEqual(['400 Main St, Kyle, TX 78640', '400 Main Ave, Buda, TX 78640']);
  });
});

describe('houses under customers in Odoo', () => {
  it('finds a property manager\'s house by its street', async () => {
    const call = jest.fn(async () => [{ id: 21, type: 'delivery', name: false, street: '400 Main St', street2: false, city: 'Kyle', zip: '78640', phone: false, email: false, parent_id: [7, 'Oak Property Mgmt'] }]);
    const c = { call } as unknown as Pick<OdooClient, 'call'>;
    expect(await searchAddresses(c, '400 Main')).toEqual([{ id: 21, type: 'delivery', name: '', address: '400 Main St, Kyle 78640', phone: '', email: '', parentId: 7, parentName: 'Oak Property Mgmt' }]);
    expect(call).toHaveBeenCalledWith('res.partner', 'search_read', [[['parent_id', '!=', false], ['type', 'in', ['delivery', 'other']], '|', ['street', 'ilike', '400 Main'], ['name', 'ilike', '400 Main']]], expect.anything());
    expect(await searchAddresses(c, 'ab')).toEqual([]);
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

  it('suggests addresses when editing a customer and fills the picked one', async () => {
    await AsyncStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify([customer({ address: '' })]));
    await renderApp('/customer/c1');
    await settle();
    await fireEvent.press(screen.getByTestId('customer-edit'));
    const field = screen.getByTestId('customer-field-address');
    await fireEvent(field, 'focus');
    await fireEvent.changeText(field, '400 Main');
    await act(async () => {
      jest.advanceTimersByTime(DEBOUNCE_MS);
    });
    await settle();
    expect(screen.getByTestId('customer-place-0')).toHaveTextContent(/400 Main St.*Kyle 78640/);
    await fireEvent.press(screen.getByTestId('customer-place-0'));
    await settle();
    expect(screen.queryByTestId('customer-place-0')).toBeNull();
    expect(screen.getByTestId('customer-field-address').props.value).toBe('400 Main St, Kyle, TX 78640');
    await fireEvent.press(screen.getByTestId('customer-sheet-save'));
    await settle();
    const saved = JSON.parse((await AsyncStorage.getItem(CUSTOMERS_STORAGE_KEY)) ?? '[]');
    expect(saved[0].address).toBe('400 Main St, Kyle, TX 78640');
  });
});
