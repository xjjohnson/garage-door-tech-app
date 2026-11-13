import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { appsFound, Fetch, OdooClient } from '../lib/odoo';
import { DEFAULT_PRICE_SHEET, importOdooProducts, isSpareOdooItem, linkLine, parsePriceSheet, PRICE_SHEET_STORAGE_KEY, priceLines, priceText, setLinePrice } from '../lib/prices';
import { renderApp } from '../testing/renderApp';

const PRODUCTS = [
  { id: 1, name: 'Service call', default_code: 'SVC', lst_price: 89, sale_ok: true },
  { id: 2, name: 'Torsion spring 25k', default_code: 'SPR-25', lst_price: 92.5, sale_ok: true },
  { id: 3, name: 'Nylon rollers (10)', default_code: false, lst_price: 80, sale_ok: true },
  { id: 4, name: 'Shop rag', default_code: false, lst_price: 1, sale_ok: false },
];

/** A pretend Odoo 19 community: OCA Field Service, Sales, Invoicing and products. */
function fakeOdoo({ products = true } = {}) {
  const calls: { model: string; method: string; args: unknown[]; kw: Record<string, unknown> }[] = [];
  const fetchFn: Fetch = async (_url, init) => {
    const { params } = JSON.parse(init.body);
    const reply = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) });
    const missing = (model: string) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'Odoo Server Error', data: { name: 'builtins.KeyError', message: `Object ${model} doesn't exist` } } }) });
    if (params.service === 'common') return reply(2);
    const [, , , model, method, args, kw] = params.args as [string, number, string, string, string, unknown[], Record<string, unknown>];
    calls.push({ model, method, args, kw: kw ?? {} });
    if (model === 'res.users') return reply([{ id: 2, name: 'Justin', partner_id: [90, 'Justin'] }]);
    if (method === 'fields_get') {
      if (model === 'fsm.order') return reply({ name: {}, location_id: {}, person_id: {} });
      if (model === 'fsm.stage') return reply({ is_closed: {} });
      if (model === 'product.product') return products ? reply({ name: {}, lst_price: {}, sale_ok: {}, default_code: {} }) : missing(model);
      if (model === 'sale.order' || model === 'account.move') return reply({ name: {} });
      return missing(model);
    }
    if (model === 'fsm.person' || model === 'fsm.order') return reply([]);
    if (model === 'product.product' && method === 'search_read') {
      const domain = args[0] as unknown[];
      const saleOnly = domain.some((d) => Array.isArray(d) && d[0] === 'sale_ok');
      const like = domain.find((d) => Array.isArray(d) && d[0] === 'name' && d[1] === 'ilike') as [string, string, string] | undefined;
      return reply(PRODUCTS.filter((p) => (!saleOnly || p.sale_ok) && (!like || p.name.toLowerCase().includes(like[2].toLowerCase()))));
    }
    return missing(model);
  };
  return { fetchFn, calls };
}

const login = { url: 'johnsons.example.com', db: 'johnsons', login: 'j@x.test' };

describe('Odoo prices (plain logic)', () => {
  it('finds which Odoo apps are installed', async () => {
    const c = await OdooClient.signIn(fakeOdoo().fetchFn, login, 'key');
    expect(c.session.apps).toEqual({ products: true, sales: true, invoicing: true });
    expect(appsFound(c.session)).toEqual(['Field Service', 'Sales', 'Invoicing', 'Products']);
    const bare = await OdooClient.signIn(fakeOdoo({ products: false }).fetchFn, login, 'key');
    expect(bare.session.apps.products).toBe(false);
    expect(await bare.allProducts()).toEqual([]);
  });

  it('reads every product that can be sold, with its price in cents', async () => {
    const o = fakeOdoo();
    const c = await OdooClient.signIn(o.fetchFn, login, 'key');
    expect(await c.allProducts()).toEqual([
      { id: 1, name: 'Service call', code: 'SVC', cents: 8900 },
      { id: 2, name: 'Torsion spring 25k', code: 'SPR-25', cents: 9250 },
      { id: 3, name: 'Nylon rollers (10)', code: '', cents: 8000 },
    ]);
    expect((await c.products('spring')).map((p) => p.id)).toEqual([2]);
  });

  it('imports the whole price list: linked lines update, new products become spare items, a second import adds nothing', () => {
    expect(priceText(9250)).toBe('92.50');
    expect(priceText(8900)).toBe('89');
    let sheet = linkLine(setLinePrice(DEFAULT_PRICE_SHEET, 'spring.better', '85'), 'spring.better', { id: 2, name: '[SPR-25] Torsion spring 25k' });
    sheet = linkLine(sheet, 'serviceCall', { id: 99, name: 'Old service call' });
    sheet = linkLine(sheet, 'addOn.gone', { id: 3, name: 'Removed add-on' });
    const first = importOdooProducts(sheet, [
      { id: 1, name: 'Service call', code: 'SVC', cents: 8900 },
      { id: 2, name: 'Torsion spring 25k', code: 'SPR-25', cents: 9250 },
      { id: 3, name: 'Nylon rollers (10)', cents: 8000 },
    ]);
    expect(first.changed).toEqual([{ label: 'Better torsion spring', from: '85', to: '92.50' }]);
    expect(first.missing).toEqual(['Service call']);
    expect(first.added).toBe(2);
    expect(first.sheet.spring.better).toBe('92.50');
    expect(first.sheet.odoo['addOn.gone']).toBeUndefined();
    const spare = first.sheet.addOns.filter((a) => isSpareOdooItem(first.sheet, a));
    expect(spare.map((a) => [a.id, a.name, a.price])).toEqual([
      ['odoo1', 'Service call', '89'],
      ['odoo3', 'Nylon rollers (10)', '80'],
    ]);
    expect(first.sheet.odoo['addOn.odoo1']).toEqual({ id: 1, name: '[SVC] Service call' });
    // Saved and read back, the links survive.
    expect(parsePriceSheet(JSON.stringify(first.sheet)).odoo).toEqual(first.sheet.odoo);
    const again = importOdooProducts(first.sheet, [{ id: 3, name: 'Nylon rollers (10)', cents: 8500 }]);
    expect(again.added).toBe(0);
    expect(again.changed).toEqual([{ label: 'Nylon rollers (10)', from: '80', to: '85' }]);
    expect(priceLines(again.sheet).find((l) => l.key === 'addOn.odoo3')?.value).toBe('85');
  });
});

describe('Estimate prices in the price book, with Odoo', () => {
  const settle = async (n = 8) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };
  afterEach(() => jest.restoreAllMocks());

  it('takes Odoo prices on Update from Odoo and links a line to an Odoo product', async () => {
    await AsyncStorage.clear();
    const o = fakeOdoo();
    jest.spyOn(globalThis, 'fetch').mockImplementation(((url: string, init: Parameters<Fetch>[1]) => o.fetchFn(url, init)) as unknown as typeof fetch);
    await renderApp('/team');
    await settle();
    await fireEvent.changeText(screen.getByTestId('team-url'), login.url);
    await fireEvent.changeText(screen.getByTestId('team-db'), login.db);
    await fireEvent.changeText(screen.getByTestId('team-login'), login.login);
    await fireEvent.changeText(screen.getByTestId('team-secret'), 'key');
    await fireEvent.press(screen.getByTestId('team-signin-go'));
    await settle();
    expect(screen.getByTestId('team-apps')).toHaveTextContent(/^Found in your Odoo: Field Service, Sales, Invoicing, Products\./);

    await act(async () => router.push('/price-sheet'));
    await settle();
    // Opening it reads Odoo's prices once; the estimate prices follow the same update.
    await settle();
    expect(screen.getByTestId('price-book-sheet-result')).toHaveTextContent(/added 3 Odoo items/);
    let saved = parsePriceSheet(await AsyncStorage.getItem(PRICE_SHEET_STORAGE_KEY));
    expect(saved.addOns.filter((a) => isSpareOdooItem(saved, a)).map((a) => a.name)).toEqual(['Service call', 'Torsion spring 25k', 'Nylon rollers (10)']);

    // Spare Odoo items stay folded away until one is put on an option.
    expect(screen.queryByTestId('spare-odoo3')).toBeNull();
    await fireEvent.press(screen.getByTestId('odoo-spare-toggle'));
    await fireEvent.press(within(screen.getByTestId('spare-tiers-odoo3')).getByText('Best'));
    await settle(3);
    saved = parsePriceSheet(await AsyncStorage.getItem(PRICE_SHEET_STORAGE_KEY));
    expect(saved.addOns.find((a) => a.id === 'odoo3')?.tiers).toEqual({ good: false, better: false, best: true });
    expect(screen.getByTestId('addon-odoo3')).toBeTruthy();

    // Link the service call to its Odoo product: the price comes straight in.
    await fireEvent.press(screen.getByTestId('odoo-pick-serviceCall'));
    await settle();
    await fireEvent.press(screen.getByTestId('odoo-product-1'));
    await settle();
    saved = parsePriceSheet(await AsyncStorage.getItem(PRICE_SHEET_STORAGE_KEY));
    expect(saved.serviceCall).toBe('89');
    expect(saved.odoo.serviceCall).toEqual({ id: 1, name: '[SVC] Service call' });
  });
});
