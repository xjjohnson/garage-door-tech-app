import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { CUSTOMERS_STORAGE_KEY, parseCustomers } from '../lib/customers';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { INVOICES_STORAGE_KEY, PAY_LABEL, parseInvoices } from '../lib/invoices';
import { createJob, JOBS_STORAGE_KEY, parseJobs } from '../lib/jobs';
import { Fetch, OdooClient } from '../lib/odoo';
import { InvoiceGone, lineValues, readInvoice, sendInvoice, sendOrder, sendPayments, SERVICE_PRODUCT_CODE, voidInvoice, voidNote } from '../lib/odooSales';
import { DEFAULT_PRICE_SHEET, PRICE_SHEET_STORAGE_KEY, PriceSheet } from '../lib/prices';
import { buildQuote, QuoteLine } from '../lib/quote';
import { renderApp } from '../testing/renderApp';

const MATCH = { mode: 'match' as const, form: { ...DEFAULT_MATCH_FORM, twentyCoil: '4 1/2', length: '24' } };
const SHEET: PriceSheet = {
  ...DEFAULT_PRICE_SHEET,
  serviceCall: '89',
  springLabor: '150',
  spring: { good: '60', better: '85', best: '120' },
  odoo: { serviceCall: { id: 1, name: '[SVC] Service call' }, 'spring.good': { id: 2, name: 'Torsion spring 10k' } },
};

type Call = { model: string; method: string; args: unknown[]; kw: Record<string, unknown> };

/** A pretend Odoo 19 with Sales and Invoicing. */
function fakeOdoo() {
  const calls: Call[] = [];
  const products: { id: number; default_code: string }[] = [];
  const moves: Record<number, { residual: number; total: number; state: string; posted?: string; name?: string; reverses?: number }> = {};
  const fetchFn: Fetch = async (_url, init) => {
    const { params } = JSON.parse(init.body);
    const reply = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result }) });
    const missing = (model: string) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'Odoo Server Error', data: { name: 'builtins.KeyError', message: `Object ${model} doesn't exist` } } }) });
    if (params.service === 'common') return reply(2);
    const [, , , model, method, args, kw] = params.args as [string, number, string, string, string, unknown[], Record<string, unknown>];
    calls.push({ model, method, args, kw: kw ?? {} });
    const key = `${model}.${method}`;
    if (model === 'res.users') return reply([{ id: 2, name: 'Justin', partner_id: [90, 'Justin'] }]);
    if (method === 'fields_get') {
      if (model === 'sale.order') return reply({ name: {}, signature: {}, signed_by: {}, signed_on: {} });
      if (['product.product', 'account.move'].includes(model)) return reply({ name: {}, sale_ok: {}, lst_price: {} });
      if (model === 'res.partner') return reply({ name: {}, customer_rank: {} });
      return missing(model);
    }
    switch (key) {
      case 'res.partner.create':
        return reply(300);
      case 'product.product.search':
        return reply(products.filter((p) => p.default_code === SERVICE_PRODUCT_CODE).map((p) => p.id));
      case 'product.product.create':
        products.push({ id: 50, default_code: (args[0] as { default_code: string }).default_code });
        return reply(50);
      case 'sale.order.create':
        return reply(700);
      case 'sale.order.action_confirm':
      case 'sale.order.write':
        return reply(true);
      case 'sale.order.read':
        return reply([{ id: 700, name: 'S00012' }]);
      case 'sale.order.line.search_read':
        return reply([{ id: 801 }, { id: 802 }, { id: 803 }]);
      case 'account.move.create': {
        const lines = (args[0] as { invoice_line_ids: [number, number, { price_unit: number; quantity: number }][] }).invoice_line_ids;
        const total = Math.round(lines.reduce((n, [, , v]) => n + v.price_unit * v.quantity, 0) * 100);
        moves[900] = { residual: total, total, state: 'not_paid' };
        return reply(900);
      }
      case 'account.move.action_post':
        if ((args[0] as number[])[0] === 901) moves[901] = { ...moves[901], posted: 'posted', name: 'RINV/2026/00001' };
        return reply(true);
      case 'account.move.read': {
        const id = (args[0] as number[])[0] ?? 900;
        const m = moves[id];
        // Odoo's read leaves out an invoice that was deleted.
        if (!m) return reply([]);
        return reply([{ id, name: m.name ?? 'INV/2026/00007', journal_id: [1, 'Customer Invoices'], state: m.posted ?? 'posted', amount_total: m.total / 100, amount_residual: m.residual / 100, payment_state: m.state }]);
      }
      case 'account.move.button_cancel':
        moves[900].posted = 'cancel';
        return reply(true);
      case 'account.move.search_read': {
        const found = Object.entries(moves).filter(([, m]) => m.reverses === 900 && m.posted !== 'cancel');
        return reply(found.map(([id, m]) => ({ id: Number(id), name: m.name, state: m.posted })));
      }
      case 'account.move.reversal.create':
        // Like Odoo 19 over RPC: no journal given, no wizard.
        if (!(args[0] as { journal_id?: number }).journal_id) return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'Odoo Server Error', data: { name: 'odoo.exceptions.ValidationError', message: "Missing required value for the field 'Journal' (journal_id)" } } }) };
        return reply(60);
      case 'account.move.reversal.reverse_moves':
        moves[901] = { residual: moves[900].total, total: moves[900].total, state: 'not_paid', posted: 'draft', name: '/', reverses: 900 };
        return reply(true);
      case 'account.move.line.search':
        return reply([9011]);
      case 'account.move.js_assign_outstanding_line': {
        // The credit note is set against what is still owed; any rest stays open on it.
        const applied = Math.min(moves[900].residual, moves[901].residual);
        moves[900].residual -= applied;
        moves[901].residual -= applied;
        moves[900].state = moves[900].residual === 0 ? 'reversed' : 'partial';
        return reply(true);
      }
      case 'account.journal.search': {
        const d = args[0] as [string, string, unknown][];
        return reply(d[0][2] === 'cash' ? [] : [11]);
      }
      case 'account.payment.register.create':
        return reply(40 + calls.filter((c) => c.method === 'create' && c.model === 'account.payment.register').length);
      case 'account.payment.register.action_create_payments': {
        const wiz = calls.filter((c) => c.model === 'account.payment.register' && c.method === 'create').at(-1)!;
        const amount = Math.round((wiz.args[0] as { amount: number }).amount * 100);
        moves[900].residual -= amount;
        moves[900].state = moves[900].residual <= 0 ? 'paid' : 'partial';
        return reply(true);
      }
    }
    return missing(model);
  };
  return { fetchFn, calls, moves };
}

const login = { url: 'x.test', db: 'x', login: 'j' };

describe('quotes and invoices to Odoo (plain logic)', () => {
  it('uses the linked Odoo product per line, or the service product, with quantity and unit price', () => {
    const lines: QuoteLine[] = [
      { label: '2 springs', cents: 12000, taxable: true, key: 'spring.good', qty: 2 },
      { label: 'Spring labor', cents: 15000, taxable: false, key: 'springLabor' },
      { label: 'Free check', cents: 0, taxable: false, key: 'addOn.x' },
    ];
    expect(lineValues(lines, SHEET.odoo, () => 50, 'quantity')).toEqual([
      { product_id: 2, name: '2 springs', quantity: 2, price_unit: 60 },
      { product_id: 50, name: 'Spring labor', quantity: 1, price_unit: 150 },
    ]);
  });

  it('sends a confirmed order, an invoice tied to it, and payments by method', async () => {
    const o = fakeOdoo();
    const c = await OdooClient.signIn(o.fetchFn, login, 'k');
    const option = buildQuote(MATCH, SHEET).options[0];
    const order = await sendOrder(c, 300, option.lines, SHEET.odoo, '12 Oak St');
    expect(order).toEqual({ id: 700, name: 'S00012' });
    const created = o.calls.find((x) => x.model === 'sale.order' && x.method === 'create')!.args[0] as { partner_id: number; order_line: unknown[] };
    expect(created.partner_id).toBe(300);
    expect(created.order_line).toEqual([
      [0, 0, { product_id: 2, name: '2 springs, .225 × 2" × 24"', product_uom_qty: 2, price_unit: 60 }],
      [0, 0, { product_id: 50, name: 'Spring labor', product_uom_qty: 1, price_unit: 150 }],
      [0, 0, { product_id: 1, name: 'Service call', product_uom_qty: 1, price_unit: 89 }],
    ]);
    // The service product was made once, with no taxes.
    expect(o.calls.filter((x) => x.model === 'product.product' && x.method === 'create')).toHaveLength(1);
    expect(o.calls.some((x) => x.model === 'sale.order' && x.method === 'action_confirm')).toBe(true);

    const inv = await sendInvoice(c, 300, option.lines, SHEET.odoo, 'Invoice 1001', order);
    expect(inv).toMatchObject({ id: 900, name: 'INV/2026/00007', total: 35900, residual: 35900, paymentState: 'not_paid' });
    const move = o.calls.find((x) => x.model === 'account.move' && x.method === 'create')!.args[0] as { invoice_origin: string; invoice_line_ids: [number, number, Record<string, unknown>][] };
    expect(move.invoice_origin).toBe('S00012');
    expect(move.invoice_line_ids.map(([, , v]) => v.sale_line_ids)).toEqual([[[6, 0, [801]]], [[6, 0, [802]]], [[6, 0, [803]]]]);

    const sent = await sendPayments(c, 900, [{ id: 'p1', method: 'cash', amount: 10000, at: Date.UTC(2026, 10, 11), reference: '' }, { id: 'p2', method: 'check', amount: 25900, at: Date.UTC(2026, 10, 11), reference: '1042' }], (m) => PAY_LABEL[m]);
    expect(sent).toEqual(['p1', 'p2']);
    const wiz = o.calls.filter((x) => x.model === 'account.payment.register' && x.method === 'create');
    expect(wiz.map((w) => w.args[0])).toEqual([
      { amount: 100, payment_date: '2026-11-11', journal_id: 11, communication: 'Cash' },
      { amount: 259, payment_date: '2026-11-11', journal_id: 11, communication: 'Check 1042' },
    ]);
    expect(wiz[0].kw.context).toEqual({ active_model: 'account.move', active_ids: [900] });
    expect(await readInvoice(c, 900, sent, 5)).toMatchObject({ residual: 0, paymentState: 'paid', sentPayments: ['p1', 'p2'] });
  });
});

describe('voiding an invoice in Odoo', () => {
  it('reverses a posted invoice with a credit note set against it, and cancels a draft', async () => {
    const o = fakeOdoo();
    const c = await OdooClient.signIn(o.fetchFn, login, 'k');
    o.moves[900] = { residual: 35900, total: 35900, state: 'not_paid' };
    expect(await voidInvoice(c, 900, 'Voided in the app')).toEqual({ voided: 'RINV/2026/00001', refund: 0 });
    const wiz = o.calls.find((x) => x.model === 'account.move.reversal' && x.method === 'create')!;
    expect(wiz.args[0]).toMatchObject({ move_ids: [[6, 0, [900]]], reason: 'Voided in the app', journal_id: 1 });
    expect(o.calls.find((x) => x.method === 'js_assign_outstanding_line')?.args).toEqual([[900], 9011]);
    expect(o.moves[900].state).toBe('reversed');
    // Asked again: the credit note is already there, so no second one.
    expect(await voidInvoice(c, 900, 'Voided in the app')).toEqual({ voided: 'RINV/2026/00001', refund: 0 });
    expect(o.calls.filter((x) => x.model === 'account.move.reversal' && x.method === 'create')).toHaveLength(1);

    // Part paid ($50 of $99.99): the credit note clears the $49.99 owed, and the $50 paid is owed back.
    const p = fakeOdoo();
    const c3 = await OdooClient.signIn(p.fetchFn, login, 'k');
    p.moves[900] = { residual: 4999, total: 9999, state: 'partial' };
    expect(await voidInvoice(c3, 900, 'Voided in the app')).toEqual({ voided: 'RINV/2026/00001', refund: 5000 });
    expect(p.moves[900].residual).toBe(0);
    expect(p.moves[901].residual).toBe(5000);
    // Fully paid: nothing to clear, the whole payment is owed back.
    const f = fakeOdoo();
    const c4 = await OdooClient.signIn(f.fetchFn, login, 'k');
    f.moves[900] = { residual: 0, total: 9999, state: 'paid' };
    expect(await voidInvoice(c4, 900, 'Voided in the app')).toEqual({ voided: 'RINV/2026/00001', refund: 9999 });

    const d = fakeOdoo();
    const c2 = await OdooClient.signIn(d.fetchFn, login, 'k');
    d.moves[900] = { residual: 100, total: 100, state: 'not_paid', posted: 'draft' };
    expect(await voidInvoice(c2, 900, 'x')).toEqual({ voided: 'cancelled', refund: 0 });
    expect(d.calls.some((x) => x.method === 'button_cancel')).toBe(true);
    expect(d.calls.some((x) => x.model === 'account.move.reversal')).toBe(false);
  });
});

describe('what a voided invoice says', () => {
  it('names the refund owed for a paid or part-paid invoice, and nothing for an unpaid one', () => {
    expect(voidNote({ name: 'INV/1', voided: 'RINV/1' })).toBe('Voided: credit note RINV/1 reverses it in Odoo.');
    expect(voidNote({ name: 'INV/1', voided: 'RINV/1', refund: 5000 })).toBe('Voided: credit note RINV/1 reverses it in Odoo. The customer had paid $50, so refund them $50 from that credit note in Odoo.');
    expect(voidNote({ name: 'INV/1', voided: 'cancelled' })).toBe('Voided: INV/1 is cancelled in Odoo.');
    expect(voidNote({ name: 'INV/1' })).toMatch(/once the phone has signal/);
  });
});

describe('an invoice deleted in Odoo', () => {
  const settle = async (n = 10) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };
  afterEach(() => jest.restoreAllMocks());

  it('is told apart when read or voided', async () => {
    const o = fakeOdoo();
    const c = await OdooClient.signIn(o.fetchFn, login, 'k');
    await expect(readInvoice(c, 123, [])).rejects.toBeInstanceOf(InvoiceGone);
    await expect(voidInvoice(c, 123, 'x')).rejects.toBeInstanceOf(InvoiceGone);
  });

  it('is voided on the phone once, and never read or sent again', async () => {
    const base = { jobId: 'j1', billTo: 'Pat', address: '', tier: 'good', lines: [], subtotal: 100, tax: 0, total: 100, payments: [], createdAt: 1, updatedAt: 1 };
    const state = { id: 321, name: 'INV/2026/00009', total: 100, residual: 100, paymentState: 'not_paid', sentPayments: [], checkedAt: 1 };
    await AsyncStorage.clear();
    await AsyncStorage.setItem(
      INVOICES_STORAGE_KEY,
      JSON.stringify([
        { ...base, id: 'i1', number: '1001', odoo: state },
        { ...base, id: 'i2', number: '1002', voidedAt: 5, autoSend: true, odoo: { ...state, id: 322, name: 'INV/2026/00010' } },
      ]),
    );
    const o = fakeOdoo();
    jest.spyOn(globalThis, 'fetch').mockImplementation(((url: string, init: Parameters<Fetch>[1]) => o.fetchFn(url, init)) as unknown as typeof fetch);
    await renderApp('/team');
    await settle();
    await fireEvent.changeText(screen.getByTestId('team-url'), login.url);
    await fireEvent.changeText(screen.getByTestId('team-db'), login.db);
    await fireEvent.changeText(screen.getByTestId('team-login'), login.login);
    await fireEvent.changeText(screen.getByTestId('team-secret'), 'k');
    await fireEvent.press(screen.getByTestId('team-signin-go'));
    await settle(30);
    const saved = parseInvoices(await AsyncStorage.getItem(INVOICES_STORAGE_KEY));
    // The one read in the background and the one whose void was waiting both end up voided and deleted.
    expect(saved.map((i) => [i.id, !!i.voidedAt, i.odoo?.voided])).toEqual([
      ['i1', true, 'deleted'],
      ['i2', true, 'deleted'],
    ]);
    const reads = o.calls.filter((x) => x.model === 'account.move' && x.method === 'read').length;
    // Later passes (every few minutes) leave them alone.
    await act(async () => {
      jest.advanceTimersByTime(25 * 60_000);
    });
    await settle(30);
    expect(o.calls.filter((x) => x.model === 'account.move' && x.method === 'read')).toHaveLength(reads);
  });
});

describe('quote and invoice screens with Odoo', () => {
  const settle = async (n = 10) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };
  afterEach(() => jest.restoreAllMocks());

  it('sends the picked option as a sales order and the invoice with its payment', async () => {
    const job = createJob(MATCH, { customer: 'Pat Smith', address: '12 Oak St', phone: '555-123-4567', notes: '' }, { title: '.225 × 2" × 24"' }, 1000, 'j1');
    const good = buildQuote(MATCH, SHEET).options[0];
    await AsyncStorage.clear();
    await AsyncStorage.setItem(PRICE_SHEET_STORAGE_KEY, JSON.stringify(SHEET));
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([{ ...job, customerId: 'c1', accepted: { tier: 'good', total: good.total, at: 2000 } }]));
    await AsyncStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify([{ id: 'c1', name: 'Pat Smith', phone: '555-123-4567', email: '', address: '12 Oak St', notes: '', createdAt: 1, updatedAt: 1 }]));
    const o = fakeOdoo();
    jest.spyOn(globalThis, 'fetch').mockImplementation(((url: string, init: Parameters<Fetch>[1]) => o.fetchFn(url, init)) as unknown as typeof fetch);
    await renderApp('/team');
    await settle();
    await fireEvent.changeText(screen.getByTestId('team-url'), login.url);
    await fireEvent.changeText(screen.getByTestId('team-db'), login.db);
    await fireEvent.changeText(screen.getByTestId('team-login'), login.login);
    await fireEvent.changeText(screen.getByTestId('team-secret'), 'k');
    await fireEvent.press(screen.getByTestId('team-signin-go'));
    await settle();

    await act(async () => router.push('/quote/j1'));
    await settle();
    await fireEvent.press(screen.getByTestId('quote-odoo-send'));
    await settle();
    expect(screen.getByTestId('quote-odoo-order')).toHaveTextContent('In Odoo as sales order S00012.');
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].odooOrder).toEqual({ id: 700, name: 'S00012' });
    // The customer is now an Odoo contact too.
    expect(parseCustomers(await AsyncStorage.getItem(CUSTOMERS_STORAGE_KEY))[0].odooId).toBe(300);

    // The customer signs the quote: the signature goes on the sales order's own fields in Odoo.
    await fireEvent.press(screen.getByTestId('quote-sign'));
    const pad = screen.getByTestId('signature-pad');
    await fireEvent(pad, 'layout', { nativeEvent: { layout: { width: 300, height: 200 } } });
    let tick = 0;
    const touch = (x: number, y: number) => ({ nativeEvent: { locationX: x, locationY: y, pageX: x, pageY: y, touches: [], changedTouches: [], identifier: 1, timestamp: Date.now() }, touchHistory: { touchBank: [{ touchActive: true, startPageX: x, startPageY: y, startTimeStamp: 0, currentPageX: x, currentPageY: y, currentTimeStamp: ++tick, previousPageX: x, previousPageY: y, previousTimeStamp: tick - 1 }], numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: tick } });
    await fireEvent(pad, 'responderGrant', touch(10, 10));
    await fireEvent(pad, 'responderMove', touch(50, 40));
    await fireEvent(pad, 'responderRelease', touch(50, 40));
    await fireEvent.press(screen.getByTestId('signature-save'));
    await settle();
    const signed = o.calls.find((x) => x.model === 'sale.order' && x.method === 'write')!;
    expect(signed.args[0]).toEqual([700]);
    expect(signed.args[1]).toMatchObject({ signed_by: 'Pat Smith', signed_on: expect.stringMatching(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/), signature: expect.stringMatching(/^iVBORw0KGgo/) });
    expect(screen.getByTestId('quote-odoo-order')).toHaveTextContent('In Odoo as sales order S00012. Signature saved on it.');
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].quoteSignatureSent).toBeTruthy();
    expect(o.calls.filter((x) => x.model === 'sale.order' && x.method === 'write')).toHaveLength(1);

    await fireEvent.press(screen.getByTestId('quote-make-invoice'));
    await settle();
    await fireEvent.press(screen.getByTestId('invoice-odoo-send'));
    await settle();
    expect(screen.getByTestId('invoice-odoo-state')).toHaveTextContent('In Odoo as INV/2026/00007: Not paid, $359 owed. Odoo total $359.');
    const saved = parseInvoices(await AsyncStorage.getItem(INVOICES_STORAGE_KEY))[0];
    expect(saved.odoo).toMatchObject({ id: 900, residual: 35900 });
    // Sent once only: a second tap syncs instead of making another invoice.
    await fireEvent.press(screen.getByTestId('invoice-odoo-send'));
    await settle();
    expect(o.calls.filter((x) => x.model === 'account.move' && x.method === 'create')).toHaveLength(1);

    // Voided on the phone: Odoo gets a credit note, and the invoice can't be restored after that.
    await fireEvent.press(screen.getByTestId('invoice-void'));
    expect(screen.getByTestId('invoice-void')).toHaveTextContent('Tap again to void here and in Odoo');
    await fireEvent.press(screen.getByTestId('invoice-void'));
    await settle();
    expect(screen.getByTestId('invoice-odoo-send')).toHaveTextContent('Void it in Odoo now');
    await fireEvent.press(screen.getByTestId('invoice-odoo-send'));
    await settle();
    expect(screen.getByTestId('invoice-odoo-void')).toHaveTextContent('Voided: credit note RINV/2026/00001 reverses it in Odoo.');
    expect(parseInvoices(await AsyncStorage.getItem(INVOICES_STORAGE_KEY))[0].odoo?.voided).toBe('RINV/2026/00001');
    expect(screen.queryByTestId('invoice-unvoid')).toBeNull();
    expect(screen.queryByTestId('invoice-odoo-send')).toBeNull();
  });
});
