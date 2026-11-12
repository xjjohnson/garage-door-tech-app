import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Fetch } from '../lib/odoo';
import {
  categoryLevel,
  categoryPaths,
  fetchPriceBook,
  parseFavorites,
  parsePriceBook,
  PRICE_BOOK_FAVORITES_KEY,
  PRICE_BOOK_STORAGE_KEY,
  PriceBookItem,
  rankFrequent,
  searchItems,
  techKey,
  toggleFavorite,
} from '../lib/priceBook';
import { renderApp } from '../testing/renderApp';

type Row = Record<string, unknown>;

const PRODUCTS: Row[] = [
  { id: 1, name: 'Genie 2028', lst_price: 450, default_code: false, categ_id: [5, 'All / Openers / Genie Operators'], type: 'consu', description_sale: 'DC motor with soft start', sale_ok: true },
  { id: 2, name: 'Genie 6070H', lst_price: 899, default_code: 'G6070', categ_id: [5, 'All / Openers / Genie Operators'], type: 'consu', description_sale: false, sale_ok: true },
  { id: 3, name: 'Liftmaster 2220L 7ft Chain', lst_price: 350, default_code: false, categ_id: [4, 'All / Openers'], type: 'consu', description_sale: 'Chain drive with camera', sale_ok: true },
  { id: 4, name: '16x7 CHI 2250', lst_price: 1299.99, default_code: false, categ_id: [6, 'All / New Doors'], type: 'consu', description_sale: 'Short raised panel', sale_ok: true },
  { id: 5, name: 'Residential Motor Install', lst_price: 200, default_code: false, categ_id: [7, 'All / Services'], type: 'service', description_sale: false, sale_ok: true },
  { id: 6, name: 'Nylon roller 4" stem', lst_price: 219.99, default_code: 'ROL4', categ_id: [8, 'All / Garage Door Parts'], type: 'consu', description_sale: false, sale_ok: true },
];
const SOLD = [6, 5, 6, 3, 6, 5, 99].map((id, n) => ({ id: n + 1, product_id: [id, 'x'] }));

function fakeOdoo({ sales = true } = {}) {
  const calls: { model: string; method: string; args: unknown[]; kw: Row }[] = [];
  const call = async (model: string, method: string, args: unknown[], kw: Row = {}): Promise<unknown> => {
    calls.push({ model, method, args, kw });
    if (method === 'fields_get') {
      if (model === 'product.product') return { name: {}, lst_price: {}, sale_ok: {}, default_code: {}, categ_id: {}, type: {}, description_sale: {} };
      if (model === 'sale.order' && sales) return { name: {} };
      if (model === 'account.move' || model === 'res.partner') return { name: {} };
      throw new Error(`Object ${model} doesn't exist`);
    }
    if (model === 'res.users') return [{ id: 2, name: 'Justin', partner_id: [90, 'Justin'] }];
    if (model === 'product.product' && method === 'search_read') return PRODUCTS;
    if (model === 'sale.order.line' && method === 'search_read') return SOLD;
    return [];
  };
  const fetchFn: Fetch = async (_url, init) => {
    const { params } = JSON.parse(init.body);
    const reply = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) });
    if (params.service === 'common') return reply(2);
    const [, , , model, method, args, kw] = params.args as [string, number, string, string, string, unknown[], Row];
    try {
      return reply(await call(model, method, args, kw));
    } catch (e) {
      return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'Odoo Server Error', data: { name: 'builtins.KeyError', message: (e as Error).message } } }) };
    }
  };
  return { fetchFn, calls, call };
}

const session = { productFields: ['sale_ok', 'default_code', 'categ_id', 'type', 'description_sale'], apps: { products: true, sales: true } };

describe('Price book (logic)', () => {
  it('drops the category root every product shares', () => {
    expect(categoryPaths(['All / Openers / Genie', 'All / New Doors', ''])).toEqual([['Openers', 'Genie'], ['New Doors'], []]);
    expect(categoryPaths(['All / Saleable / Openers', 'All / Saleable / Gates'])).toEqual([['Openers'], ['Gates']]);
    // A single category is kept, so it still shows.
    expect(categoryPaths(['All / Openers', 'All / Openers'])).toEqual([['Openers'], ['Openers']]);
  });

  it('reads Odoo products into categories, services vs materials, and what sells most', async () => {
    const o = fakeOdoo();
    const book = await fetchPriceBook({ session, call: o.call }, 1000);
    expect(book.fetchedAt).toBe(1000);
    expect(book.items.find((i) => i.id === 1)).toEqual({ id: 1, name: 'Genie 2028', code: '', cents: 45000, kind: 'material', category: ['Openers', 'Genie Operators'], description: 'DC motor with soft start' });
    expect(book.items.find((i) => i.id === 5)!.kind).toBe('service');
    // 6 sold three times, 5 twice, 3 once; 99 isn't in the book.
    expect(book.frequent).toEqual([6, 5, 3]);
    const q = o.calls.find((c) => c.model === 'product.product')!;
    expect(q.args[0]).toEqual([['sale_ok', '=', true]]);
    expect(q.kw.fields).toEqual(['name', 'lst_price', 'default_code', 'categ_id', 'type', 'description_sale']);
  });

  it('still loads when the sales lines can not be read', async () => {
    const o = fakeOdoo();
    const failing = async (model: string, method: string, args: unknown[], kw?: Row) => {
      if (model === 'sale.order.line') throw new Error('Access denied');
      return o.call(model, method, args, kw);
    };
    const book = await fetchPriceBook({ session, call: failing }, 1);
    expect(book.items).toHaveLength(6);
    expect(book.frequent).toEqual([]);
  });

  it('walks the category tree and searches every word', async () => {
    const { items } = await fetchPriceBook({ session, call: fakeOdoo().call }, 1);
    const top = categoryLevel(items, []);
    expect(top.folders.map((f) => f.name)).toEqual(['Garage Door Parts', 'New Doors', 'Openers', 'Services']);
    expect(top.folders.find((f) => f.name === 'Openers')!.count).toBe(3);
    const openers = categoryLevel(items, ['Openers']);
    expect(openers.folders).toEqual([{ name: 'Genie Operators', count: 2 }]);
    expect(openers.items.map((i: PriceBookItem) => i.name)).toEqual(['Liftmaster 2220L 7ft Chain']);
    expect(searchItems(items, 'genie 6070').map((i) => i.id)).toEqual([2]);
    expect(searchItems(items, 'camera').map((i) => i.id)).toEqual([3]);
    expect(searchItems(items, 'rol4').map((i) => i.id)).toEqual([6]);
    expect(searchItems(items, '  ')).toEqual([]);
  });

  it('keeps favorites per tech and survives damaged saves', () => {
    const a = techKey({ url: 'https://x', db: 'd', uid: 2 });
    const b = techKey({ url: 'https://x', db: 'd', uid: 3 });
    let favs = toggleFavorite({}, a, 4);
    favs = toggleFavorite(favs, b, 1);
    favs = toggleFavorite(favs, a, 6);
    expect(favs).toEqual({ [a]: [4, 6], [b]: [1] });
    expect(toggleFavorite(favs, a, 4)[a]).toEqual([6]);
    expect(techKey(null)).toBe('phone');
    expect(parseFavorites('{bad')).toEqual({});
    expect(parsePriceBook('nope').items).toEqual([]);
    expect(rankFrequent([1, 2, 2, 3, 3, 3], 2)).toEqual([3, 2]);
  });
});

describe('Price book screen', () => {
  const settle = async (n = 10) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };
  afterEach(() => jest.restoreAllMocks());

  async function signIn(o: ReturnType<typeof fakeOdoo>) {
    await AsyncStorage.clear();
    jest.spyOn(globalThis, 'fetch').mockImplementation(((url: string, init: Parameters<Fetch>[1]) => o.fetchFn(url, init)) as unknown as typeof fetch);
    await renderApp('/team');
    await settle();
    await fireEvent.changeText(screen.getByTestId('team-url'), 'acme.odoo.com');
    await fireEvent.changeText(screen.getByTestId('team-login'), 'j@x.test');
    await fireEvent.changeText(screen.getByTestId('team-secret'), 'k');
    await fireEvent.press(screen.getByTestId('team-signin-go'));
    await settle();
  }

  it('opens from Sales, loads from Odoo, browses categories, searches and stars favorites', async () => {
    const o = fakeOdoo();
    await signIn(o);
    await act(async () => router.navigate('/sales'));
    await settle();
    await fireEvent.press(screen.getByTestId('sales-price-book'));
    await settle();

    // Categories and Frequently used at the top.
    expect(screen.getByTestId('price-book-cat-Openers')).toHaveTextContent(/Openers.*3 items/);
    expect(screen.getByTestId('price-book-item-6')).toHaveTextContent(/Nylon roller.*\$219\.99/);
    // Saved for when there's no signal.
    expect(parsePriceBook(await AsyncStorage.getItem(PRICE_BOOK_STORAGE_KEY)).items).toHaveLength(6);

    await fireEvent.press(screen.getByTestId('price-book-cat-Openers'));
    await settle();
    expect(screen.getByTestId('price-book-item-3')).toHaveTextContent(/Liftmaster.*\$350/);
    await fireEvent.press(screen.getByTestId('price-book-cat-Genie Operators'));
    await settle();
    expect(screen.getByTestId('price-book-item-1')).toHaveTextContent(/Genie 2028.*Material.*DC motor.*\$450/);
    await fireEvent.press(screen.getByTestId('price-book-star-1'));
    await settle();
    await fireEvent.press(screen.getByTestId('price-book-up'));
    await settle();
    await fireEvent.press(screen.getByTestId('price-book-up'));
    await settle();
    expect(screen.getByTestId('price-book-cat-New Doors')).toBeTruthy();

    await fireEvent.press(within(screen.getByTestId('price-book-tabs')).getByText('Favorites (1)'));
    await settle();
    expect(screen.getByTestId('price-book-item-1')).toBeTruthy();
    expect(screen.queryByTestId('price-book-item-6')).toBeNull();
    const favs = parseFavorites(await AsyncStorage.getItem(PRICE_BOOK_FAVORITES_KEY));
    expect(Object.values(favs)).toEqual([[1]]);

    await fireEvent.changeText(screen.getByTestId('price-book-search'), 'chi 2250');
    await settle();
    expect(screen.getByTestId('price-book-item-4')).toHaveTextContent(/\$1,299\.99/);
    expect(screen.queryByTestId('price-book-item-1')).toBeNull();
  });

  it('shows the saved copy with no Odoo sign-in', async () => {
    await AsyncStorage.clear();
    const { items } = await fetchPriceBook({ session, call: fakeOdoo().call }, new Date(2026, 10, 10, 9).getTime());
    await AsyncStorage.setItem(PRICE_BOOK_STORAGE_KEY, JSON.stringify({ items, frequent: [], fetchedAt: new Date(2026, 10, 10, 9).getTime() }));
    await renderApp('/price-book');
    await settle();
    expect(screen.getByTestId('price-book-cat-Openers')).toBeTruthy();
    expect(screen.getByTestId('price-book-updated')).toHaveTextContent(/Updated Nov 10/);
    expect(screen.queryByTestId('price-book-refresh')).toBeNull();
  });
});
