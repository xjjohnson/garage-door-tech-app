import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { makeBackup, parseBackup } from '../lib/backup';
import { BUSINESS_STORAGE_KEY } from '../lib/invoices';
import { DEFAULT_PRICE_SHEET } from '../lib/prices';
import { isLow, mergeStock, orderLinks, orderQty, orders, orderText, parseStock, receive, STARTER_ITEMS, STOCK_STORAGE_KEY, StockItem, supplierNames } from '../lib/stock';
import { renderApp } from '../testing/renderApp';

const item = (id: string, extra: Partial<StockItem> = {}): StockItem => ({ id, name: id, sku: '', category: 'parts', onHand: 0, min: 1, par: 3, supplier: '', costCents: 0, updatedAt: 1, ...extra });

describe('truck stock (plain logic)', () => {
  it('orders back up to the fill-to count when at or under reorder', () => {
    expect(isLow(item('a', { onHand: 1 }))).toBe(true);
    expect(isLow(item('a', { onHand: 2 }))).toBe(false);
    expect(isLow(item('a', { onHand: 0, par: 0 }))).toBe(false);
    expect(orderQty(item('a', { onHand: 1 }))).toBe(2);
    expect(orderQty(item('a', { onHand: 0, min: 2, par: 2 }))).toBe(2);
  });

  it('groups low items by supplier, with no supplier last', () => {
    const list = [item('Rollers', { supplier: 'DDM', costCents: 2500 }), item('Cables', { supplier: 'DDM', costCents: 1000 }), item('Hinges'), item('Remote', { supplier: 'ABC' }), item('Full', { supplier: 'ABC', onHand: 5 })];
    const o = orders(list);
    expect(o.map((x) => [x.supplier, x.lines.map((l) => `${l.qty} ${l.item.name}`)])).toEqual([
      ['ABC', ['3 Remote']],
      ['DDM', ['3 Cables', '3 Rollers']],
      ['', ['3 Hinges']],
    ]);
    expect(o[1].costCents).toBe(10500);
    expect(orderText(o[1], 'Ace Doors')).toBe("Hi, I'd like to order for Ace Doors:\n3 x Cables\n3 x Rollers\nThanks!");
    const after = receive(list, o[1], 9);
    expect(after.find((i) => i.id === 'Rollers')).toMatchObject({ onHand: 3, updatedAt: 9 });
    expect(orders(after).map((x) => x.supplier)).toEqual(['ABC', '']);
  });

  it('makes text and email links for a supplier with contact details', () => {
    const o = orders([item('Rollers', { supplier: 'DDM', sku: 'R-10' })])[0];
    const links = orderLinks(o, [{ name: 'ddm', phone: '555-222-3333', email: 'orders@ddm.test' }], 'Ace');
    expect(links.sms).toMatch(/^sms:5552223333\?body=Hi%2C%20I'd%20like%20to%20order%20for%20Ace%3A%0A3%20x%20Rollers%20\(R-10\)/);
    expect(links.email).toMatch(/^mailto:orders@ddm\.test\?subject=Order%20for%20Ace&body=/);
    expect(orderLinks(o, [], 'Ace')).toEqual({ sms: undefined, email: undefined });
    expect(supplierNames({ items: [item('a', { supplier: 'DDM ' }), item('b', { supplier: 'ddm' })], suppliers: [{ name: 'ABC', phone: '', email: '' }] })).toEqual(['ABC', 'DDM']);
  });

  it('reads saved stock safely, merges, and goes into backups', () => {
    expect(parseStock('junk')).toEqual({ items: [], suppliers: [] });
    expect(parseStock({ items: [{ id: 'x' }, { id: 'a', name: 'A', onHand: -2, category: 'weird' }], suppliers: [{ name: '' }, { name: 'DDM', phone: 5 }] })).toEqual({
      items: [{ id: 'a', name: 'A', sku: '', category: 'other', onHand: 0, min: 0, par: 0, supplier: '', costCents: 0, updatedAt: 0 }],
      suppliers: [{ name: 'DDM', phone: '', email: '' }],
    });
    const merged = mergeStock({ items: [item('a', { onHand: 5, updatedAt: 10 })], suppliers: [{ name: 'DDM', phone: '', email: 'me@x.test' }] }, { items: [item('a', { onHand: 1, updatedAt: 5 }), item('b')], suppliers: [{ name: 'ddm', phone: '555', email: 'old@x.test' }] });
    expect(merged.items.map((i) => [i.id, i.onHand])).toEqual([
      ['a', 5],
      ['b', 0],
    ]);
    expect(merged.suppliers).toEqual([{ name: 'DDM', phone: '555', email: 'me@x.test' }]);
    const parsed = parseBackup(makeBackup({ jobs: [], stock: { items: [item('a')], suppliers: [] }, priceSheet: DEFAULT_PRICE_SHEET }, 1));
    expect(parsed.ok && parsed.backup.stock?.items.map((i) => i.id)).toEqual(['a']);
  });
});

describe('truck stock screen', () => {
  afterEach(() => jest.restoreAllMocks());
  const settle = async (n = 5) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };

  it('starts from common items, counts down, and texts the order', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(BUSINESS_STORAGE_KEY, JSON.stringify({ name: 'Ace Doors' }));
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const app = await renderApp('/jobs');
    await settle();
    await fireEvent.press(screen.getByTestId('open-stock'));
    expect(app.getPathname()).toBe('/stock');
    await fireEvent.press(screen.getByTestId('stock-starter'));
    await settle(3);
    const saved = parseStock(await AsyncStorage.getItem(STOCK_STORAGE_KEY));
    expect(saved.items).toHaveLength(STARTER_ITEMS.length);

    // Everything starts at 0, so all of it is due; set rollers to the fill-to count.
    const rollers = saved.items.find((i) => i.name.startsWith('Nylon rollers'))!;
    for (let k = 0; k < 4; k++) await fireEvent.press(screen.getByTestId(`stock-plus-${rollers.id}`));
    expect(screen.getByTestId(`stock-count-${rollers.id}`)).toHaveTextContent('4');
    await fireEvent.press(screen.getByTestId(`stock-minus-${rollers.id}`));
    await fireEvent.press(screen.getByTestId(`stock-minus-${rollers.id}`));
    // 2 left is the reorder point: back on the order, for 2.
    expect(screen.getByTestId('order-none')).toHaveTextContent(/2 x Nylon rollers/);

    // Give it a supplier with a phone.
    await fireEvent.press(screen.getByTestId(`stock-edit-${rollers.id}`));
    await fireEvent.changeText(screen.getByTestId('stock-field-supplier'), 'DDM');
    await fireEvent.press(screen.getByTestId('stock-sheet-save'));
    await fireEvent.press(screen.getByTestId('order-supplier-DDM'));
    await fireEvent.changeText(screen.getByTestId('supplier-phone'), '555-222-3333');
    await fireEvent.press(screen.getByTestId('supplier-save'));
    await fireEvent.press(screen.getByTestId('order-text-DDM'));
    expect(open).toHaveBeenLastCalledWith(expect.stringMatching(/^sms:5552223333\?body=.*Ace%20Doors.*2%20x%20Nylon%20rollers/));

    await fireEvent.press(screen.getByTestId('order-received-DDM'));
    expect(screen.getByTestId(`stock-count-${rollers.id}`)).toHaveTextContent('4');
    expect(screen.queryByTestId('order-DDM')).toBeNull();
  });
});
