import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { CUSTOMERS_STORAGE_KEY, parseCustomers } from '../lib/customers';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { createInvoice, INVOICES_STORAGE_KEY, PAY_LABEL, parseInvoices } from '../lib/invoices';
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
        return reply([{ id, name: m.name ?? 'INV/2026/00007', journal_id: [1, 'Customer Invoices'], payment_ids: [5], state: m.posted ?? 'posted', amount_total: m.total / 100, amount_residual: m.residual / 100, payment_state: m.state }]);
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
        // The wizard pays the move it was opened on: the invoice, or a credit note (refund).
        const target = (wiz.kw.context as { active_ids: number[] }).active_ids[0]!;
        moves[target].residual -= amount;
        moves[target].state = moves[target].residual <= 0 ? 'paid' : 'partial';
        return reply(true);
      }
      case 'account.payment.read':
        // The invoice's payments: $50 in by Check (journal 12), the latest on Jul 3.
        return reply([{ id: 5, journal_id: [12, 'Bank'], payment_method_line_id: [31, 'Manual Payment'], date: '2026-11-12' }]);
      case 'account.payment.method.line.read':
        return reply([{ id: 31, payment_method_id: [1, 'Manual'] }]);
      case 'account.payment.method.line.search':
        return reply([44]);
    }
    return missing(model);
  };
  return { fetchFn, calls, moves };
}

const login = { url: 'x.test', db: 'x', login: 'j' };

describe('quote and invoice screens with Odoo', () => {
  const settle = async (n = 10) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };
  afterEach(() => jest.restoreAllMocks());

  it('sends the invoice to Odoo once, voids it with a credit note', async () => {
    const job = createJob(MATCH, { customer: 'Pat Smith', address: '12 Oak St', phone: '555-123-4567', notes: '' }, { title: '.225 × 2" × 24"' }, 1000, 'j1');
    const good = buildQuote(MATCH, SHEET).options[0];
    await AsyncStorage.clear();
    await AsyncStorage.setItem(PRICE_SHEET_STORAGE_KEY, JSON.stringify(SHEET));
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([{ ...job, customerId: 'c1', odooOrder: { id: 700, name: 'S00012' }, accepted: { tier: 'good', total: good.total, at: 2000 } }]));
    await AsyncStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify([createInvoice({ ...job, customerId: 'c1' }, good, [], 3000, 'i1')]));
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
    expect(parseInvoices(await AsyncStorage.getItem(INVOICES_STORAGE_KEY))).toHaveLength(1);
    await act(async () => router.push('/invoice/i1'));
    await settle();
    await fireEvent.press(screen.getByTestId('invoice-odoo-send', { includeHiddenElements: true }));
    await settle();
    expect(screen.getByTestId('invoice-odoo-state')).toHaveTextContent(/In Odoo as INV\/2026\/\d+: Not paid/);
    const saved = parseInvoices(await AsyncStorage.getItem(INVOICES_STORAGE_KEY))[0];
    expect(saved.odoo).toMatchObject({ id: expect.any(Number) });
    // Sent once only: a second tap syncs instead of making another invoice.
    await fireEvent.press(await screen.findByTestId('invoice-odoo-send'));
    await settle();
    expect(o.calls.filter((x) => x.model === 'account.move' && x.method === 'create')).toHaveLength(1);

    // Voided on the phone: Odoo gets a credit note, and the invoice can't be restored after that.
    await fireEvent.press(screen.getByTestId('invoice-void', { includeHiddenElements: true }));
    expect(screen.getByTestId('invoice-void', { includeHiddenElements: true })).toHaveTextContent('Tap again to void here and in Odoo');
    await fireEvent.press(screen.getByTestId('invoice-void', { includeHiddenElements: true }));
    await settle();
    expect(screen.getByTestId('invoice-odoo-send', { includeHiddenElements: true })).toHaveTextContent('Void it in Odoo now');
    await fireEvent.press(screen.getByTestId('invoice-odoo-send', { includeHiddenElements: true }));
    await settle();
    expect(screen.getByTestId('invoice-odoo-void')).toHaveTextContent('Voided: credit note RINV/2026/00001 reverses it in Odoo.');
    expect(parseInvoices(await AsyncStorage.getItem(INVOICES_STORAGE_KEY))[0].odoo?.voided).toBe('RINV/2026/00001');
    expect(screen.queryByTestId('invoice-unvoid')).toBeNull();
    expect(screen.queryByTestId('invoice-odoo-send')).toBeNull();
  });
});
