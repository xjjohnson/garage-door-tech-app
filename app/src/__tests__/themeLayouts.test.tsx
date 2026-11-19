import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Fetch } from '../lib/odoo';
import { SCHEDULE_STORAGE_KEY } from '../lib/schedule';
import type { HomeLayout, RowStyle, SalesLayout } from '../lib/themes';
import { renderApp } from '../testing/renderApp';
import { layouts } from '../theme';

/** Every layout draws the same data in a different arrangement. Screens read the theme's layouts as they render, so each test sets them first. */
const original = { ...layouts };
afterEach(() => {
  Object.assign(layouts, original);
  jest.restoreAllMocks();
});

const settle = async (n = 10) => {
  for (let k = 0; k < n; k++) await act(async () => undefined);
};

describe('Home layouts', () => {
  const appt = (id: string, start: number, name: string) => ({ id, start, minutes: 60, name, address: '1 Elm St', phone: '', what: 'Broken spring', status: 'booked', createdAt: 1, updatedAt: 1 });
  const cases: [HomeLayout, RowStyle][] = [
    ['classic', 'card'],
    ['field', 'edge'],
    ['inbox', 'dense'],
    ['owner', 'edge'],
    ['map', 'edge'],
    ['simple', 'big'],
  ];
  for (const [home, visitRows] of cases) {
    it(`draws Home as ${home} with ${visitRows} rows and still shows the visit`, async () => {
      Object.assign(layouts, { home, visitRows });
      await AsyncStorage.clear();
      await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify([appt('a1', Date.now() + 60_000, 'Pat Lee')]));
      await renderApp();
      expect(await screen.findByTestId('today-next')).toHaveTextContent(/Pat Lee/);
      if (home === 'field') {
        expect(screen.getByTestId('today-next-card')).toHaveTextContent(/NEXT.*Pat Lee/);
        expect(screen.getByTestId('field-go-bar')).toHaveTextContent(/Pat Lee/);
        expect(screen.queryByTestId('today-kpis')).toBeNull();
        await fireEvent.press(screen.getByTestId('today-next-go'));
        expect(router).toBeTruthy();
      }
      if (home === 'owner') expect(screen.getByTestId('today-owner-owed')).toHaveTextContent(/Owed to you/);
      if (home === 'simple') {
        expect(screen.getByTestId('today-new-job')).toBeTruthy();
        expect(screen.queryByTestId('today-kpis')).toBeNull();
      }
      if (home === 'classic') expect(screen.getByTestId('today-kpis')).toBeTruthy();
    });
  }
});

type Row = Record<string, unknown>;

const ORDERS: Row[] = [
  { id: 55, name: 'S00055', partner_id: [7, 'Pat Smith'], date_order: '2026-11-10 15:00:00', amount_total: 465, state: 'draft', client_order_ref: 'Good · 12 Oak St', amount_untaxed: 450, amount_tax: 15, order_line: [1, 2, 3] },
  { id: 54, name: 'S00054', partner_id: [8, 'Lee Park'], date_order: '2026-11-09 15:00:00', amount_total: 199, state: 'sale', client_order_ref: false },
];
const MOVES: Row[] = [
  { id: 3, name: 'INV/2026/00003', partner_id: [7, 'Pat Smith'], invoice_date: '2026-11-01', invoice_date_due: '2026-11-05', amount_total: 398, amount_residual: 398, state: 'posted', payment_state: 'not_paid', move_type: 'out_invoice', ref: 'Invoice 1002', amount_untaxed: 398, amount_tax: 0, invoice_line_ids: [11] },
  { id: 2, name: 'INV/2026/00002', partner_id: [8, 'Lee Park'], invoice_date: '2026-11-02', invoice_date_due: '2026-12-02', amount_total: 150, amount_residual: 0, state: 'posted', payment_state: 'paid', move_type: 'out_invoice', ref: false },
  { id: 1, name: '/', partner_id: [9, 'Kim'], invoice_date: false, invoice_date_due: false, amount_total: 80, amount_residual: 80, state: 'draft', payment_state: 'not_paid', move_type: 'out_invoice', ref: false },
];
const LINES: Record<string, Row[]> = {
  'sale.order.line': [
    { id: 2, name: 'Chain drive opener\nwith rail', product_uom_qty: 1, price_unit: 300, price_subtotal: 300, display_type: false, sequence: 2 },
    { id: 1, name: 'Opener', product_uom_qty: 0, price_unit: 0, price_subtotal: 0, display_type: 'line_section', sequence: 1 },
    { id: 3, name: 'Install labor', product_uom_qty: 2, price_unit: 75, price_subtotal: 150, display_type: false, sequence: 3 },
  ],
  'account.move.line': [{ id: 11, name: '2 springs', quantity: 2, price_unit: 199, price_subtotal: 398, display_type: 'product', sequence: 1 }],
};

/** A pretend Odoo with Sales and Invoicing and no Field Service. */
function fakeOdoo() {
  const calls: { model: string; method: string; args: unknown[]; kw: Row }[] = [];
  const call = async (model: string, method: string, args: unknown[], kw: Row = {}): Promise<unknown> => {
    calls.push({ model, method, args, kw });
    if (method === 'fields_get') {
      if (['product.product', 'sale.order', 'account.move', 'res.partner'].includes(model)) return { name: {} };
      throw new Error(`Object ${model} doesn't exist`);
    }
    if (model === 'res.users') return [{ id: 2, name: 'Justin', partner_id: [90, 'Justin'] }];
    if ((model === 'sale.order' || model === 'account.move') && method === 'search_read') {
      const all = model === 'sale.order' ? ORDERS : MOVES;
      const d = JSON.stringify(args[0]);
      return all.filter((r) => {
        if (d.includes('"payment_state","in",["not_paid","partial"]')) return r.state === 'posted' && r.payment_state === 'not_paid';
        if (d.includes('"payment_state","in",["paid","in_payment"]')) return r.payment_state === 'paid';
        if (d.includes('"state","=","draft"')) return r.state === 'draft';
        const q = d.match(/"name","ilike","([^"]+)"/);
        return !q || String(r.name).toLowerCase().includes(q[1].toLowerCase()) || String((r.partner_id as unknown[])[1]).toLowerCase().includes(q[1].toLowerCase());
      });
    }
    if ((model === 'sale.order' || model === 'account.move') && method === 'read') return (model === 'sale.order' ? ORDERS : MOVES).filter((r) => (args[0] as number[]).includes(r.id as number));
    if (method === 'read' && LINES[model]) return LINES[model].filter((l) => (args[0] as number[]).includes(l.id as number));
    if (model === 'res.partner' && method === 'read') return [{ email: 'pat@example.com' }];
    if (model === 'ir.model.data') return [{ res_id: (JSON.stringify(args[0]).includes('sale') ? 21 : 12) }];
    if (model === 'mail.template') return 77;
    if (model === 'mail.mail') return [];
    return true;
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
  return { fetchFn, calls, client: { call } };
}


describe('Sales layouts', () => {
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

  const cases: SalesLayout[] = ['classic', 'dense', 'grouped', 'table', 'aging', 'chase'];
  for (const sales of cases) {
    it(`lists Odoo's invoices in the ${sales} layout`, async () => {
      Object.assign(layouts, { sales });
      await signIn(fakeOdoo());
      await act(async () => router.navigate('/sales'));
      await settle();
      expect(screen.getByTestId('odoo-row-3')).toHaveTextContent(/00003|Pat Smith/);
      if (sales === 'aging') expect(screen.getByTestId('sales-aging')).toHaveTextContent(/Unpaid by age/);
      if (sales === 'chase') {
        expect(screen.getByTestId('sales-chase')).toHaveTextContent(/To collect.*\$398/);
        // Paid invoices are not on the chase list.
        expect(screen.queryByTestId('odoo-row-2')).toBeNull();
      }
      if (sales === 'grouped') expect(screen.getAllByText(/^Overdue · /).length).toBeGreaterThan(0);
      // Tapping a row still opens the record.
      await fireEvent.press(screen.getByTestId('odoo-row-3'));
      await settle();
      expect(screen.getByTestId('odoo-record')).toBeTruthy();
    });
  }
});

describe('Home on the map (Dispatch and Map)', () => {
  const appt = (id: string, start: number, name: string) => ({ id, start, minutes: 60, name, address: '1 Elm St', phone: '', what: 'Broken spring', status: 'booked', createdAt: 1, updatedAt: 1 });
  it('fills the screen with a stops, drive and unpaid sheet', async () => {
    Object.assign(layouts, { home: 'map', homeStartsOnMap: true, visitRows: 'dense' });
    await AsyncStorage.clear();
    await AsyncStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify([appt('a1', Date.now() + 60_000, 'Pat Lee')]));
    await renderApp();
    expect(await screen.findByTestId('map-sheet')).toBeTruthy();
    expect(screen.getByTestId('map-stat-stops')).toHaveTextContent('1');
    expect(screen.getByTestId('map-stat-unpaid')).toHaveTextContent('0');
    await fireEvent.press(screen.getByTestId('map-sheet-toggle'));
    expect(await screen.findByText(/Pat Lee/)).toBeTruthy();
  });
});
