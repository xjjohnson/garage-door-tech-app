import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
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
  toQuoteLines,
} from '../lib/ticket';
import { renderApp } from '../testing/renderApp';

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

  it('reads saved tickets and ignores damaged lines', () => {
    expect(parseTicket({ lines: [{ id: 'a', name: 'X', qty: 0, unitCents: -5, kind: 'odd' }, { name: 'no id' }], order: { id: 3, name: 'S3' }, totals: { key: 'k', untaxed: 1, tax: 0, total: 1, at: 2 } })).toEqual({
      lines: [{ id: 'a', name: 'X', qty: 1, unitCents: 0, kind: 'material' }],
      order: { id: 3, name: 'S3' },
      totals: { key: 'k', untaxed: 1, tax: 0, total: 1, at: 2 },
    });
    expect(parseTicket(null)).toBeUndefined();
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

    await fireEvent.press(screen.getByTestId('ticket-make-invoice'));
    await settle();
    const [inv] = parseInvoices(await AsyncStorage.getItem(INVOICES_STORAGE_KEY));
    expect(inv).toMatchObject({ jobId: 'j1', source: 'ticket', subtotal: 62500, tax: 3300, total: 65800 });
    expect(inv!.lines).toHaveLength(3);
    expect(screen.getByText(/Job ticket/)).toBeTruthy();

    await act(async () => router.back());
    await settle();
    expect(screen.getByTestId('ticket-invoice')).toHaveTextContent(/Invoice .* made/);
    expect(screen.queryByTestId('ticket-make-invoice')).toBeNull();
  });

  async function signedIn(fail: { write?: boolean } = {}) {
    await seed();
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
    const job = await saved();
    expect(job.ticket?.order).toEqual({ id: 70, name: 'S00070' });

    await fireEvent.press(screen.getByTestId('ticket-make-invoice'));
    await settle(20);
    expect(calls.find((c) => c.method === 'action_confirm')?.args).toEqual([[70]]);
    expect((await saved()).odooOrder).toEqual({ id: 70, name: 'S00070' });
    const [inv] = parseInvoices(await AsyncStorage.getItem(INVOICES_STORAGE_KEY));
    expect(inv).toMatchObject({ source: 'ticket', tax: 1889, total: 44789 });
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
});
