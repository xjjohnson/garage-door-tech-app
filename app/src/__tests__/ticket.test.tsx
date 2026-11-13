import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { CUSTOMERS_STORAGE_KEY } from '../lib/customers';
import { INVOICES_STORAGE_KEY, parseInvoices } from '../lib/invoices';
import { createJob, JOBS_STORAGE_KEY, parseJobs } from '../lib/jobs';
import { jobSteps } from '../lib/jobSteps';
import { Fetch } from '../lib/odoo';
import { PRICE_BOOK_STORAGE_KEY, PriceBookItem } from '../lib/priceBook';
import { DEFAULT_PRICE_SHEET, PRICE_SHEET_STORAGE_KEY } from '../lib/prices';
import { QuoteOption } from '../lib/quote';
import {
  addItem,
  addOption,
  addTyped,
  confirmTicket,
  currentTotals,
  EMPTY_TICKET,
  estimateTotals,
  linesKey,
  parseTicket,
  setPrice,
  setQty,
  subtotal,
  syncTicket,
  Ticket,
  ticketOption,
  ticketParts,
  ticketRef,
  toQuoteLines,
} from '../lib/ticket';
import { DeviceMedia } from '../lib/deviceMedia';
import { parseStock, STOCK_STORAGE_KEY } from '../lib/stock';
import { renderApp } from '../testing/renderApp';

const mockMedia: jest.Mocked<DeviceMedia> = {
  takePhoto: jest.fn(async () => null),
  pickPhotos: jest.fn(async () => []),
  deletePhoto: jest.fn(),
  sharePdf: jest.fn(async (_html: string, _name: string) => undefined),
  sharePhoto: jest.fn(async (_uri: string) => undefined),
  pdfBase64: jest.fn(async (_html: string) => 'JVBERi0='),
};
jest.mock('../lib/deviceMedia', () => ({ deviceMedia: () => mockMedia }));

type Row = Record<string, unknown>;

const OPENER: PriceBookItem = { id: 1, name: 'Chamberlain belt drive', code: '', cents: 22900, kind: 'material', category: ['Openers'], description: '' };
const INSTALL: PriceBookItem = { id: 2, name: 'Residential Motor Install', code: '', cents: 20000, kind: 'service', category: ['Services'], description: '' };

describe('Ticket (logic)', () => {
  it('adds items, counts repeats, changes prices and takes lines off at zero', () => {
    let t = addItem(EMPTY_TICKET, OPENER, 'a');
    t = addItem(t, INSTALL, 'b');
    t = addItem(t, OPENER, 'c');
    expect(t.lines.map((l) => [l.id, l.qty])).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
    expect(subtotal(t)).toBe(2 * 22900 + 20000);
    t = setPrice(t, 'b', 18000);
    t = setQty(t, 'a', 0);
    expect(t.lines).toEqual([{ id: 'b', name: 'Residential Motor Install', qty: 1, unitCents: 18000, kind: 'service', productId: 2 }]);
    t = addTyped(t, { name: '  ', unitCents: 1500, kind: 'material' }, 'd');
    expect(t.lines[1]).toEqual({ id: 'd', name: 'Material', qty: 1, unitCents: 1500, kind: 'material' });
  });

  it('estimates tax on materials only, and trusts Odoo only for the lines it priced', () => {
    let t: Ticket = addItem(addItem(EMPTY_TICKET, OPENER, 'a'), INSTALL, 'b');
    expect(estimateTotals(t, '8.25')).toEqual({ untaxed: 42900, tax: 1889, total: 44789 });
    t = { ...t, totals: { untaxed: 42900, tax: 1890, total: 44790, key: linesKey(t.lines), at: 1 } };
    expect(currentTotals(t)?.total).toBe(44790);
    expect(ticketOption(t, '8.25')).toMatchObject({ title: 'Job ticket', subtotal: 42900, tax: 1890, total: 44790 });
    t = setQty(t, 'a', 2);
    expect(currentTotals(t)).toBeUndefined();
    expect(toQuoteLines(t)).toEqual([
      { label: 'Chamberlain belt drive', cents: 45800, taxable: true, qty: 2, productId: 1 },
      { label: 'Residential Motor Install', cents: 20000, taxable: false, productId: 2 },
    ]);
  });

  it('puts an estimate option on the ticket, keeping linked Odoo products', () => {
    const option: QuoteOption = {
      tier: 'better',
      available: true,
      springCount: 2,
      lines: [
        { label: 'Torsion spring', cents: 18500, taxable: true, key: 'spring.better', qty: 2 },
        { label: 'Spring labor', cents: 15000, taxable: false, key: 'springLabor' },
        { label: 'Free', cents: 0, taxable: false },
      ],
      subtotal: 33500,
      tax: 0,
      total: 33500,
    };
    let n = 0;
    const t = addOption(EMPTY_TICKET, option, { 'spring.better': { id: 40, name: 'Spring 25k' } }, () => `x${n++}`);
    expect(t.lines).toEqual([
      { id: 'x0', name: 'Torsion spring', qty: 2, unitCents: 9250, kind: 'material', productId: 40 },
      { id: 'x1', name: 'Spring labor', qty: 1, unitCents: 15000, kind: 'service' },
    ]);
  });

  it('keeps the ticket as a draft quotation in Odoo and reads back its totals', async () => {
    const calls: { model: string; method: string; args: unknown[] }[] = [];
    let state = 'draft';
    const client = {
      call: jest.fn(async (model: string, method: string, args: unknown[]) => {
        calls.push({ model, method, args });
        if (model === 'product.product' && method === 'search') return [9];
        if (model === 'sale.order' && method === 'create') return 70;
        if (model === 'sale.order' && method === 'read') return [{ name: 'S00070', state, amount_untaxed: 444, amount_tax: 18.89, amount_total: 462.89 }];
        return true;
      }),
    };
    let t = addTyped(addItem(EMPTY_TICKET, OPENER, 'a'), { name: 'Haul away', unitCents: 5000, kind: 'service' }, 'b');
    const first = await syncTicket(client as never, 5, t, 'Job ticket · 12 Oak St', 100);
    expect(first.order).toEqual({ id: 70, name: 'S00070' });
    expect(first.totals).toEqual({ untaxed: 44400, tax: 1889, total: 46289, key: linesKey(t.lines), at: 100 });
    const made = calls.find((c) => c.method === 'create')!;
    expect(made.args[0]).toEqual({
      partner_id: 5,
      client_order_ref: 'Job ticket · 12 Oak St',
      partner_shipping_id: 5,
      order_line: [
        [0, 0, { product_id: 1, name: 'Chamberlain belt drive', product_uom_qty: 1, price_unit: 229 }],
        [0, 0, { product_id: 9, name: 'Haul away', product_uom_qty: 1, price_unit: 50 }],
      ],
    });

    // A change replaces the lines on the same quotation.
    t = { ...setQty(t, 'a', 2), order: first.order };
    calls.length = 0;
    await syncTicket(client as never, 5, t, '', 200);
    const write = calls.find((c) => c.method === 'write')!;
    expect(write.args[0]).toEqual([70]);
    expect((write.args[1] as Row).order_line).toEqual([
      [5, 0, 0],
      [0, 0, { product_id: 1, name: 'Chamberlain belt drive', product_uom_qty: 2, price_unit: 229 }],
      [0, 0, { product_id: 9, name: 'Haul away', product_uom_qty: 1, price_unit: 50 }],
    ]);

    // Nothing picked: a delivery address set in Odoo by hand is left alone.
    expect((write.args[1] as Row).partner_shipping_id).toBeUndefined();

    // A house picked on the ticket is the delivery address on the quotation.
    calls.length = 0;
    await syncTicket(client as never, 5, { ...t, shipTo: { id: 12, address: '9 Elm St' } }, '', 250);
    expect((calls.find((c) => c.method === 'write')!.args[1] as Row).partner_shipping_id).toBe(12);
    expect(parseTicket({ ...t, shipTo: { id: 12, address: '9 Elm St' } })?.shipTo).toEqual({ id: 12, address: '9 Elm St' });
    expect(parseTicket({ ...t, shipTo: { id: 'x' } })?.shipTo).toBeUndefined();

    // Confirmed in Odoo already: leave it and make a new quotation.
    state = 'sale';
    calls.length = 0;
    await syncTicket(client as never, 5, t, '', 300);
    expect(calls.some((c) => c.method === 'write')).toBe(false);
    expect(calls.some((c) => c.method === 'create' && c.model === 'sale.order')).toBe(true);

    calls.length = 0;
    await confirmTicket(client as never, { id: 70, name: 'S00070' });
    expect(calls.some((c) => c.method === 'action_confirm')).toBe(false);
    state = 'draft';
    await confirmTicket(client as never, { id: 70, name: 'S00070' });
    expect(calls.find((c) => c.method === 'action_confirm')?.args).toEqual([[70]]);
  });

  it('filters parts used down from the ticket: truck items not taken off yet', () => {
    let t = addItem(addItem(addItem(EMPTY_TICKET, OPENER, 'a'), OPENER, 'b'), INSTALL, 'c');
    t = addTyped(t, { name: 'Bolt', unitCents: 100, kind: 'material' }, 'd');
    const items = [{ id: 's1', name: 'Belt drive opener', odooId: 1 }, { id: 's2', name: 'Rollers', odooId: 9 }];
    expect(ticketParts(t, items, [], 'j1')).toEqual([{ itemId: 's1', name: 'Belt drive opener', qty: 2 }]);
    // One already taken off by hand for this job; another job's doesn't count.
    expect(ticketParts(t, items, [{ itemId: 's1', qty: 1, jobId: 'j1' }, { itemId: 's1', qty: 5, jobId: 'j2' }], 'j1')).toEqual([{ itemId: 's1', name: 'Belt drive opener', qty: 1 }]);
    expect(ticketParts(t, items, [{ itemId: 's1', qty: 2, jobId: 'j1' }], 'j1')).toEqual([]);
    expect(ticketParts(undefined, items, [], 'j1')).toEqual([]);
    expect(parseTicket({ lines: [], estimateAt: 5 })?.estimateAt).toBe(5);
  });

  it('reads saved tickets and ignores damaged lines', () => {
    expect(parseTicket({ lines: [{ id: 'a', name: 'X', qty: 0, unitCents: -5, kind: 'odd' }, { name: 'no id' }], order: { id: 3, name: 'S3' }, totals: { key: 'k', untaxed: 1, tax: 0, total: 1, at: 2 } })).toEqual({
      lines: [{ id: 'a', name: 'X', qty: 1, unitCents: 0, kind: 'material' }],
      order: { id: 3, name: 'S3' },
      totals: { key: 'k', untaxed: 1, tax: 0, total: 1, at: 2 },
    });
    expect(parseTicket(null)).toBeUndefined();
    expect(parseTicket({ lines: [], ref: 'PO 9' })?.ref).toBe('PO 9');
    expect(ticketRef({ lines: [], ref: '  ' })).toBe('');
    expect(ticketRef({ lines: [], ref: ' PO 9 ' })).toBe('PO 9');
  });

  it('counts the Ticket step done once it has a line', () => {
    const job = createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Pat', address: '', phone: '', notes: '' }, { title: '' }, 1, 'j');
    expect(jobSteps(job, []).find((s) => s.id === 'quote')).toMatchObject({ label: 'Ticket', done: false });
    expect(jobSteps({ ...job, ticket: addItem(EMPTY_TICKET, OPENER, 'a') }, []).find((s) => s.id === 'quote')!.done).toBe(true);
  });
});

describe('Ticket screen', () => {
  const settle = async (n = 10) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };
  afterEach(() => jest.restoreAllMocks());

  async function seed() {
    await AsyncStorage.clear();
    const job = createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Josh', address: '12 Oak St', phone: '', notes: '' }, { title: '' }, 1000, 'j1');
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([job]));
    await AsyncStorage.setItem(PRICE_SHEET_STORAGE_KEY, JSON.stringify({ ...DEFAULT_PRICE_SHEET, taxPercent: '8.25' }));
    await AsyncStorage.setItem(PRICE_BOOK_STORAGE_KEY, JSON.stringify({ items: [OPENER, INSTALL], frequent: [], fetchedAt: 1 }));
  }
  const saved = async () => parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0]!;

  it('builds the ticket from the price book and by hand, then makes the invoice', async () => {
    await seed();
    await AsyncStorage.setItem(STOCK_STORAGE_KEY, JSON.stringify({ items: [{ id: 's1', name: 'Belt drive opener', odooId: 1, onHand: 5, min: 1, par: 5, category: 'openers', sku: '', supplier: '', costCents: 0, updatedAt: 1 }], suppliers: [] }));
    await renderApp('/job/j1');
    await settle();
    expect(screen.getByTestId('job-step-quote')).toHaveTextContent('Ticket');
    expect(screen.getByTestId('job-open-ticket')).toHaveTextContent(/Services and materials/);
    await fireEvent.press(screen.getByTestId('job-open-ticket'));
    await settle();

    await fireEvent.press(screen.getByTestId('ticket-add-material'));
    await settle();
    await fireEvent.press(screen.getByTestId('price-book-cat-Openers'));
    await settle();
    await fireEvent.press(screen.getByTestId('price-book-pick-1'));
    await settle();
    await fireEvent.press(screen.getByTestId('ticket-add-service'));
    await settle();
    await fireEvent.changeText(screen.getByTestId('price-book-search'), 'motor');
    await settle();
    await fireEvent.press(screen.getByTestId('price-book-pick-2'));
    await settle();

    let t = (await saved()).ticket!;
    expect(t.lines.map((l) => [l.name, l.kind, l.qty])).toEqual([
      ['Chamberlain belt drive', 'material', 1],
      ['Residential Motor Install', 'service', 1],
    ]);
    // $200 labor + $229 opener; tax 8.25% on the opener only.
    expect(screen.getByTestId('ticket-total')).toHaveTextContent('$447.89');
    expect(screen.getByTestId('ticket-totals-source')).toHaveTextContent(/Estimate on the phone/);

    const opener = t.lines[0]!.id;
    await fireEvent.press(screen.getByTestId(`ticket-more-${opener}`));
    await fireEvent.changeText(screen.getByTestId(`ticket-price-${opener}`), '200');
    await fireEvent(screen.getByTestId(`ticket-price-${opener}`), 'endEditing');
    await settle();
    await fireEvent.press(screen.getByTestId('ticket-typed-open'));
    await fireEvent.changeText(screen.getByTestId('ticket-typed-name'), 'Haul away old opener');
    await fireEvent.changeText(screen.getByTestId('ticket-typed-price'), '25');
    await fireEvent.press(screen.getByTestId('ticket-typed-add'));
    await settle();
    t = (await saved()).ticket!;
    expect(t.lines.map((l) => [l.name, l.qty, l.unitCents])).toEqual([
      ['Chamberlain belt drive', 2, 20000],
      ['Residential Motor Install', 1, 20000],
      ['Haul away old opener', 1, 2500],
    ]);
    // 400 + 200 + 25 = 625, tax 8.25% of 400 = 33.
    expect(screen.getByTestId('ticket-total')).toHaveTextContent('$658');

    // Saved as an estimate (no Odoo here: on the phone).
    await fireEvent.press(screen.getByTestId('ticket-save-estimate'));
    await settle();
    expect(screen.getByTestId('ticket-estimate-note')).toHaveTextContent(/Estimate saved on the phone/);
    expect((await saved()).ticket?.estimateAt).toBeGreaterThan(0);

    // A $200 deposit by check, typed on the ticket.
    await fireEvent.press(screen.getByTestId('ticket-deposit'));
    await fireEvent.press(within(screen.getByTestId('ticket-deposit-method')).getByText('Check'));
    await fireEvent.press(screen.getByTestId('ticket-deposit-amount'));
    const pad = screen.getByTestId('keypad');
    for (const k of ['2', '0', '0']) await fireEvent.press(within(pad).getByTestId(`key-${k}`));
    await fireEvent.press(within(pad).getByTestId('keypad-done'));
    await fireEvent.changeText(screen.getByTestId('ticket-deposit-reference'), '1123');
    await fireEvent.press(screen.getByTestId('ticket-deposit-save'));
    await settle();
    expect(screen.getByTestId('ticket-deposit-due')).toHaveTextContent(/^\$200 taken as a deposit. \$458 due when the work is done\./);
    expect((await saved()).ticket?.deposits).toEqual([expect.objectContaining({ method: 'check', amount: 20000, reference: '1123' })]);

    await fireEvent.press(screen.getByTestId('ticket-make-invoice'));
    await settle();
    const [inv] = parseInvoices(await AsyncStorage.getItem(INVOICES_STORAGE_KEY));
    expect(inv).toMatchObject({ jobId: 'j1', source: 'ticket', subtotal: 62500, tax: 3300, total: 65800 });
    // The deposit is the invoice's first payment.
    expect(inv!.payments).toEqual([expect.objectContaining({ method: 'check', amount: 20000, reference: '1123' })]);
    // The two openers on the ticket came off the truck.
    const stock = parseStock(await AsyncStorage.getItem(STOCK_STORAGE_KEY));
    expect(stock.items[0]!.onHand).toBe(3);
    expect(stock.used).toEqual([expect.objectContaining({ itemId: 's1', qty: 2, jobId: 'j1' })]);
    expect(inv!.lines).toHaveLength(3);
    expect(screen.getByText(/Job ticket/)).toBeTruthy();

    await act(async () => router.back());
    await settle();
    expect(screen.getByTestId('ticket-invoice')).toHaveTextContent(/Invoice .* made/);
    expect(screen.queryByTestId('ticket-make-invoice')).toBeNull();
  });

  async function signedIn(fail: { write?: boolean } = {}, net = { down: false }, odooInvoice: Row = { amount_total: 447.89, amount_residual: 447.89 }, before?: () => Promise<void>, houses: Row[] = []) {
    await seed();
    await before?.();
    const calls: { model: string; method: string; args: unknown[] }[] = [];
    let state = 'draft';
    const call = async (model: string, method: string, args: unknown[]): Promise<unknown> => {
      calls.push({ model, method, args });
      if (method === 'fields_get') {
        if (['product.product', 'sale.order', 'account.move', 'res.partner'].includes(model)) return { name: {} };
        throw new Error(`Object ${model} doesn't exist`);
      }
      if (model === 'res.users') return [{ id: 2, name: 'Justin', partner_id: [90, 'Justin'] }];
      if (model === 'res.partner' && method === 'create') return 55;
      if (model === 'sale.order' && method === 'create') return 70;
      if (model === 'sale.order' && method === 'write' && fail.write) throw new Error('Wrong value for product_id');
      if (model === 'sale.order' && method === 'action_confirm') {
        state = 'sale';
        return true;
      }
      if (model === 'sale.order' && method === 'read') return [{ name: 'S00070', state, amount_untaxed: 429, amount_tax: 18.89, amount_total: 447.89 }];
      if (model === 'account.move' && method === 'create') return 80;
      if (model === 'account.move' && method === 'read') return [{ name: 'INV/2026/00080', payment_state: 'not_paid', ...odooInvoice }];
      if (model === 'ir.attachment' && method === 'create') return 90;
      // Caliber is in Odoo twice: 69 with nothing, 70 with the houses.
      if (model === 'res.partner' && method === 'search_read' && JSON.stringify(args).includes('["parent_id","=",false]'))
        return [
          { id: 69, name: 'Caliber Collision', type: 'contact', street: false, city: false, zip: false, child_ids: [] },
          { id: 70, name: 'Caliber Collision', type: 'contact', street: false, city: false, zip: false, child_ids: [71] },
        ];
      if (model === 'res.partner' && method === 'search_read' && JSON.stringify(args).includes('["parent_id","in",[70,69]]')) return [{ id: 71, name: '1901 S Bell Blvd', type: 'delivery', street: '1901 S Bell Blvd', city: 'Cedar Park', zip: '78613' }];
      if (model === 'res.partner' && method === 'read') return (args[0] as number[]).map((id) => (id === 33 ? { id, name: 'Josh', type: 'contact', street: '12 Oak St', city: 'Austin', zip: '78701' } : { id, name: 'Caliber Collision', type: 'contact', street: false }));
      if (model === 'res.partner' && method === 'search_read' && JSON.stringify(args).includes('parent_id')) return houses;
      if (model === 'product.product' && method === 'search_read')
        return [
          { id: 1, name: OPENER.name, lst_price: 229, categ_id: [4, 'All / Openers'], type: 'consu' },
          { id: 2, name: INSTALL.name, lst_price: 200, categ_id: [5, 'All / Services'], type: 'service' },
        ];
      if (method === 'search_read' || method === 'search') return [];
      return true;
    };
    const fetchFn: Fetch = async (_url, init) => {
      const { params } = JSON.parse(init.body);
      const reply = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) });
      if (params.service === 'common') return reply(2);
      if (net.down) throw new TypeError('Network request failed');
      const [, , , model, method, args] = params.args as [string, number, string, string, string, unknown[]];
      try {
        return reply(await call(model, method, args));
      } catch (e) {
        return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'Odoo Server Error', data: { name: 'builtins.KeyError', message: (e as Error).message } } }) };
      }
    };
    jest.spyOn(globalThis, 'fetch').mockImplementation(((url: string, init: Parameters<Fetch>[1]) => fetchFn(url, init)) as unknown as typeof fetch);
    await renderApp('/team');
    await settle();
    await fireEvent.changeText(screen.getByTestId('team-url'), 'acme.odoo.com');
    await fireEvent.changeText(screen.getByTestId('team-login'), 'j@x.test');
    await fireEvent.changeText(screen.getByTestId('team-secret'), 'k');
    await fireEvent.press(screen.getByTestId('team-signin-go'));
    await settle();

    return { calls, setState: (v: string) => (state = v) };
  }

  it('sends the house picked on the job as the delivery address on the quotation and the invoice', async () => {
    const { calls } = await signedIn(
      {},
      { down: false },
      undefined,
      async () => {
        await AsyncStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify([{ id: 'c1', name: 'Josh', phone: '', email: '', address: '12 Oak St', notes: '', createdAt: 1, updatedAt: 1, odooId: 33, syncedAt: 1 }]));
        const [job] = parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY));
        await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([{ ...job, customerId: 'c1' }]));
      },
      [{ id: 12, name: 'Rental', type: 'delivery', street: '9 Elm St', city: 'Austin', zip: '78701' }],
    );
    await act(async () => router.navigate('/job/j1'));
    await settle();
    await fireEvent.press(await screen.findByTestId('job-open-address'));
    await settle();
    expect(screen.getByTestId('job-address-12')).toHaveTextContent(/Rental · 9 Elm St/);
    await fireEvent.press(screen.getByTestId('job-address-12'));
    await settle();
    expect((await saved()).ticket?.shipTo).toMatchObject({ id: 12 });
    expect(screen.getByTestId('job-open-address')).toHaveTextContent(/9 Elm St/);
    await act(async () => router.navigate('/ticket/j1'));
    await settle();
    expect(screen.queryByTestId('ticket-address')).toBeNull();
    expect(screen.getByTestId('ticket')).toHaveTextContent(/9 Elm St/);
    await fireEvent.press(screen.getByTestId('ticket-add-material'));
    await settle();
    await fireEvent.press(screen.getByTestId('price-book-cat-Openers'));
    await settle();
    await fireEvent.press(screen.getByTestId('price-book-pick-1'));
    await settle();
    await act(async () => jest.advanceTimersByTime(1600));
    await settle(20);
    const made = calls.find((c) => c.model === 'sale.order' && c.method === 'create')!;
    expect((made.args[0] as Row).partner_shipping_id).toBe(12);
    await fireEvent.press(screen.getByTestId('ticket-make-invoice'));
    await settle(20);
    const [inv] = parseInvoices(await AsyncStorage.getItem(INVOICES_STORAGE_KEY));
    expect(inv!.shipTo).toMatchObject({ id: 12 });
    expect(inv!.address).toMatch(/9 Elm St/);
    expect((calls.find((c) => c.model === 'account.move' && c.method === 'create')!.args[0] as Row).partner_shipping_id).toBe(12);
  });

  it('starts on the job customer\'s main address and can change to another customer\'s house', async () => {
    const { calls } = await signedIn({}, { down: false }, undefined, async () => {
      await AsyncStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify([{ id: 'c1', name: 'Josh', phone: '', email: '', address: '', notes: '', createdAt: 1, updatedAt: 1, odooId: 33, syncedAt: 1 }]));
      const [job] = parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY));
      await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([{ ...job, customerId: 'c1', address: '' }]));
    });
    await act(async () => router.navigate('/job-address/j1'));
    await settle();
    // No houses under Josh: his main address from Odoo still shows, picked.
    expect(screen.getByTestId('job-address-33')).toHaveTextContent(/Main address.*12 Oak St/);
    expect(screen.getByTestId('job-address-33')).toHaveProp('accessibilityState', { checked: true });
    await fireEvent.press(screen.getByTestId('job-address-change'));
    await fireEvent.changeText(screen.getByTestId('job-address-search'), 'Ca');
    await act(async () => jest.advanceTimersByTime(500));
    await settle();
    expect(screen.queryByTestId('job-address-found-69')).toBeNull();
    expect(screen.getByTestId('job-address-found-70')).toHaveTextContent(/1 under them/);
    await fireEvent.press(screen.getByTestId('job-address-found-70'));
    await settle();
    expect(screen.getByTestId('job-address-customer-name')).toHaveTextContent('Caliber Collision');
    expect(screen.getByTestId('job-address-71')).toHaveTextContent(/1901 S Bell Blvd, Cedar Park 78613/);
    await fireEvent.press(screen.getByTestId('job-address-71'));
    await settle();
    expect((await saved()).ticket?.shipTo).toMatchObject({ id: 71, address: '1901 S Bell Blvd, Cedar Park 78613' });
    expect(calls.some((c) => c.model === 'res.partner' && c.method === 'search_read' && JSON.stringify(c.args).includes('["parent_id","=",false]'))).toBe(true);
  });

  it('asks Odoo for the tax and total, and confirms the quotation with the invoice', async () => {
    const { calls } = await signedIn();
    await act(async () => router.navigate('/ticket/j1'));
    await settle();
    await fireEvent.press(screen.getByTestId('ticket-add-material'));
    await settle();
    await fireEvent.press(screen.getByTestId('price-book-cat-Openers'));
    await settle();
    await fireEvent.press(screen.getByTestId('price-book-pick-1'));
    await settle();
    await fireEvent.press(screen.getByTestId('ticket-add-service'));
    await settle();
    await fireEvent.press(screen.getByTestId('price-book-cat-Services'));
    await settle();
    await fireEvent.press(screen.getByTestId('price-book-pick-2'));
    await settle();
    expect(calls.some((c) => c.model === 'sale.order' && c.method === 'create')).toBe(false);

    await act(async () => jest.advanceTimersByTime(1600));
    await settle(20);
    expect(screen.getByTestId('ticket-totals-source')).toHaveTextContent(/Odoo's numbers, from quotation S00070/);
    expect(screen.getByTestId('ticket-total')).toHaveTextContent('$447.89');
    await fireEvent.press(screen.getByTestId('ticket-save-estimate'));
    await settle();
    expect(screen.getByTestId('ticket-estimate-note')).toHaveTextContent(/Estimate saved in Odoo as quotation S00070, \$447\.89/);
    expect(screen.getByTestId('ticket-estimate-email')).toBeTruthy();
    const job = await saved();
    expect(job.ticket?.order).toEqual({ id: 70, name: 'S00070' });

    await fireEvent.press(screen.getByTestId('ticket-make-invoice'));
    await settle(20);
    expect(calls.find((c) => c.method === 'action_confirm')?.args).toEqual([[70]]);
    expect((await saved()).odooOrder).toEqual({ id: 70, name: 'S00070' });
    const [inv] = parseInvoices(await AsyncStorage.getItem(INVOICES_STORAGE_KEY));
    expect(inv).toMatchObject({ source: 'ticket', tax: 1889, total: 44789 });
    // Create invoice: work done and the invoice posted in Odoo; the signature opens from its button.
    expect((await saved()).steps?.workDoneAt).toBeGreaterThan(0);
    expect(calls.find((c) => c.model === 'account.move' && c.method === 'action_post')?.args).toEqual([[80]]);
    // No customer reference typed: none on the order, the invoice keeps "Invoice 1001".
    expect((calls.find((c) => c.model === 'sale.order' && c.method === 'create')!.args[0] as Row).client_order_ref).toBe(false);
    expect((calls.find((c) => c.model === 'account.move' && c.method === 'create')!.args[0] as Row).ref).toBe(`Invoice ${inv!.number}`);
    expect(inv!.odoo).toMatchObject({ id: 80, name: 'INV/2026/00080' });
    expect(screen.queryByTestId('signature-sheet')).toBeNull();
    await fireEvent.press(screen.getByTestId('invoice-sign'));
    expect(screen.getByTestId('signature-sheet')).toBeTruthy();
    const pad = screen.getByTestId('signature-pad');
    await fireEvent(pad, 'layout', { nativeEvent: { layout: { width: 300, height: 200 } } });
    let tick = 0;
    const touch = (x: number, y: number) => ({ nativeEvent: { locationX: x, locationY: y, pageX: x, pageY: y, touches: [], changedTouches: [], identifier: 1, timestamp: Date.now() }, touchHistory: { touchBank: [{ touchActive: true, startPageX: x, startPageY: y, startTimeStamp: 0, currentPageX: x, currentPageY: y, currentTimeStamp: ++tick, previousPageX: x, previousPageY: y, previousTimeStamp: tick - 1 }], numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: tick } });
    await fireEvent(pad, 'responderGrant', touch(10, 10));
    await fireEvent(pad, 'responderMove', touch(50, 40));
    await fireEvent(pad, 'responderRelease', touch(50, 40));
    await fireEvent.press(screen.getByTestId('signature-save'));
    await settle(20);
    const att = calls.find((c) => c.model === 'ir.attachment' && c.method === 'create')!;
    expect(att.args[0]).toMatchObject({ res_model: 'account.move', res_id: 80, mimetype: 'application/pdf', datas: 'JVBERi0=' });
    expect(calls.find((c) => c.model === 'account.move' && c.method === 'message_post')?.args).toEqual([[80]]);
    expect((mockMedia.pdfBase64 as jest.Mock).mock.calls.at(-1)![0]).toMatch(/Customer signature.*Josh.*Work completed/s);
    expect(screen.getByTestId('invoice-sign-odoo')).toHaveTextContent(/Signature added to INV\/2026\/00080 in Odoo/);
    expect(parseInvoices(await AsyncStorage.getItem(INVOICES_STORAGE_KEY))[0]!.odoo?.signatureSent).toBeTruthy();
  });

  it("doesn't confirm the old quotation when Odoo can't take the changed lines", async () => {
    const o = await signedIn({ write: true });
    await act(async () => router.navigate('/ticket/j1'));
    await settle();
    await fireEvent.press(screen.getByTestId('ticket-add-material'));
    await settle();
    await fireEvent.press(screen.getByTestId('price-book-cat-Openers'));
    await settle();
    await fireEvent.press(screen.getByTestId('price-book-pick-1'));
    await settle();
    await act(async () => jest.advanceTimersByTime(1600));
    await settle(20);
    expect((await saved()).ticket?.order).toEqual({ id: 70, name: 'S00070' });

    // Change a line and finish before the totals come back; Odoo refuses the new lines.
    const line = (await saved()).ticket!.lines[0]!;
    await fireEvent.press(screen.getByTestId(`ticket-more-${line.id}`));
    await settle();
    await fireEvent.press(screen.getByTestId('ticket-make-invoice'));
    await settle(20);
    expect(o.calls.some((c) => c.method === 'action_confirm')).toBe(false);
    expect((await saved()).odooOrder).toBeUndefined();
    const [inv] = parseInvoices(await AsyncStorage.getItem(INVOICES_STORAGE_KEY));
    // Two openers at $229, tax 8.25% estimated on the phone.
    expect(inv).toMatchObject({ source: 'ticket', subtotal: 45800, tax: 3779, total: 49579 });
    await act(async () => router.back());
    await settle();
    expect(screen.getByTestId('ticket-error')).toHaveTextContent(/phone's lines and estimate.*S00070.*left as it is/);
  });

  it('sends a ticket finished offline once there is signal: order confirmed and linked, Odoo totals, typed reference', async () => {
    const net = { down: false };
    // Odoo charges no tax on these lines.
    const o = await signedIn({}, net, { amount_untaxed: 429, amount_tax: 0, amount_total: 429, amount_residual: 429 });
    await act(async () => router.navigate('/ticket/j1'));
    await settle();
    net.down = true;
    await fireEvent.press(screen.getByTestId('ticket-add-material'));
    await settle();
    await fireEvent.press(screen.getByTestId('price-book-cat-Openers'));
    await settle();
    await fireEvent.press(screen.getByTestId('price-book-pick-1'));
    await settle();
    await fireEvent.press(screen.getByTestId('ticket-add-service'));
    await settle();
    await fireEvent.press(screen.getByTestId('price-book-cat-Services'));
    await settle();
    await fireEvent.press(screen.getByTestId('price-book-pick-2'));
    await settle();
    await fireEvent.changeText(screen.getByTestId('ticket-ref'), 'PO 4471');
    await settle();
    expect((await saved()).ticket?.ref).toBe('PO 4471');

    await fireEvent.press(screen.getByTestId('ticket-make-invoice'));
    await settle(20);
    let [inv] = parseInvoices(await AsyncStorage.getItem(INVOICES_STORAGE_KEY));
    // The phone's estimate while offline.
    expect(inv).toMatchObject({ source: 'ticket', ref: 'PO 4471', autoSend: true, tax: 1889, total: 44789 });
    expect(inv!.odoo).toBeUndefined();
    expect(o.calls.some((c) => c.model === 'account.move' && c.method === 'create')).toBe(false);
    // No signing sheet pops up; it opens from its button.
    expect(screen.queryByTestId('signature-sheet')).toBeNull();
    await settle();
    expect(screen.getByTestId('invoice-odoo-waiting')).toHaveTextContent(/goes to Odoo on its own/);

    // Signal again: it goes on its own.
    net.down = false;
    await act(async () => jest.advanceTimersByTime(5000));
    await settle(30);
    const order = o.calls.find((c) => c.model === 'sale.order' && c.method === 'create')!;
    expect(order.args[0]).toMatchObject({ partner_id: 55, client_order_ref: 'PO 4471' });
    expect(o.calls.find((c) => c.method === 'action_confirm')?.args).toEqual([[70]]);
    expect((await saved()).odooOrder).toEqual({ id: 70, name: 'S00070' });
    const move = o.calls.find((c) => c.model === 'account.move' && c.method === 'create')!;
    expect(move.args[0]).toMatchObject({ ref: 'PO 4471', invoice_origin: 'S00070' });
    expect(o.calls.filter((c) => c.model === 'account.move' && c.method === 'create')).toHaveLength(1);
    [inv] = parseInvoices(await AsyncStorage.getItem(INVOICES_STORAGE_KEY));
    // Odoo's numbers replace the estimate.
    expect(inv).toMatchObject({ subtotal: 42900, tax: 0, total: 42900, odoo: { id: 80, name: 'INV/2026/00080', untaxed: 42900, tax: 0, total: 42900 } });
    expect(screen.getByTestId('invoice-odoo-state')).toHaveTextContent(/INV\/2026\/00080/);
  });
});
