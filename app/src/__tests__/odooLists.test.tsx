import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Linking } from 'react-native';
import { createInvoice, INVOICES_STORAGE_KEY, parseInvoices } from '../lib/invoices';
import { Fetch } from '../lib/odoo';
import { fetchList, fetchRecord, invoiceStatus, LISTS_STORAGE_KEY, odooWebLink, parseSavedLists } from '../lib/odooLists';
import { emailRecord } from '../lib/odooReports';
import { renderApp } from '../testing/renderApp';

const NOW = new Date(2026, 10, 12, 12).getTime();
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

describe('Odoo lists (logic)', () => {
  it('reads quotations newest first, with status and the customer reference', async () => {
    const o = fakeOdoo();
    const rows = await fetchList(o.client, 'quotations', 'all', '', 0, NOW);
    expect(rows.map((r) => [r.name, r.customer, r.status, r.total, r.ref])).toEqual([
      ['S00055', 'Pat Smith', 'Quotation', 46500, 'Good · 12 Oak St'],
      ['S00054', 'Lee Park', 'Sales order', 19900, undefined],
    ]);
    expect(o.calls[0].kw).toMatchObject({ order: 'date_order desc, id desc', limit: 40, offset: 0 });
  });

  it('reads customer invoices with paid, not paid, overdue and draft', async () => {
    const o = fakeOdoo();
    const rows = await fetchList(o.client, 'invoices', 'all', '', 0, NOW);
    expect(rows.map((r) => [r.name, r.status, r.warn, r.residual])).toEqual([
      ['INV/2026/00003', 'Overdue', true, 39800],
      ['INV/2026/00002', 'Paid', false, 0],
      ['Draft #1', 'Draft', false, 8000],
    ]);
    expect(o.calls[0].args[0]).toEqual([['move_type', 'in', ['out_invoice', 'out_refund']]]);
    expect((await fetchList(o.client, 'invoices', 'unpaid', '', 0, NOW)).map((r) => r.id)).toEqual([3]);
    await fetchList(o.client, 'invoices', 'all', 'pat', 0, NOW);
    expect(o.calls.at(-1)!.args[0]).toEqual([['move_type', 'in', ['out_invoice', 'out_refund']], '|', ['name', 'ilike', 'pat'], ['partner_id', 'ilike', 'pat']]);
  });

  it('words payment status', () => {
    expect(invoiceStatus('posted', 'partial', NOW + 1, NOW)).toEqual({ status: 'Partly paid', warn: true });
    expect(invoiceStatus('posted', 'in_payment', NOW, NOW).status).toBe('In payment');
    expect(invoiceStatus('cancel', 'not_paid', 0, NOW).status).toBe('Cancelled');
  });

  it('reads one quotation with its lines in order, sections as headings', async () => {
    const o = fakeOdoo();
    const r = await fetchRecord(o.client, 'sale.order', 55, NOW);
    expect(r.lines).toEqual([
      { label: 'Opener', qty: 0, unit: 0, subtotal: 0, heading: true },
      { label: 'Chain drive opener', qty: 1, unit: 30000, subtotal: 30000 },
      { label: 'Install labor', qty: 2, unit: 7500, subtotal: 15000 },
    ]);
    expect([r.untaxed, r.tax, r.total]).toEqual([45000, 1500, 46500]);
  });

  it('emails a quotation with Odoo’s quotation template and marks it sent', async () => {
    const o = fakeOdoo();
    expect(await emailRecord(o.client, 'sale.order', 55, 7)).toEqual({ to: 'pat@example.com', state: 'sent' });
    expect(o.calls.find((c) => c.method === 'send_mail')).toMatchObject({ model: 'mail.template', args: [[21], 55], kw: { force_send: true } });
    expect(o.calls.some((c) => c.method === 'action_quotation_sent')).toBe(true);
    expect(o.calls.some((c) => c.model === 'sale.order' && c.method === 'write')).toBe(false);
  });

  it('links to the record in Odoo, and reads a saved list back', () => {
    expect(odooWebLink('https://acme.odoo.com/', 'account.move', 3)).toBe('https://acme.odoo.com/web#id=3&model=account.move&view_type=form');
    expect(parseSavedLists(JSON.stringify({ invoices: { rows: [{ id: 3, name: 'X' }], at: 5 }, quotations: { rows: 'no' } }))).toEqual({ invoices: { rows: [{ id: 3, name: 'X' }], at: 5 } });
    expect(parseSavedLists('nope')).toEqual({});
  });
});

describe('Odoo lists on Sales', () => {
  const settle = async (n = 10) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };
  afterEach(() => jest.restoreAllMocks());

  async function signIn(o: ReturnType<typeof fakeOdoo>, seed?: () => Promise<void>) {
    await AsyncStorage.clear();
    await seed?.();
    jest.spyOn(globalThis, 'fetch').mockImplementation(((url: string, init: Parameters<Fetch>[1]) => o.fetchFn(url, init)) as unknown as typeof fetch);
    await renderApp('/team');
    await settle();
    await fireEvent.changeText(screen.getByTestId('team-url'), 'acme.odoo.com');
    await fireEvent.changeText(screen.getByTestId('team-login'), 'j@x.test');
    await fireEvent.changeText(screen.getByTestId('team-secret'), 'k');
    await fireEvent.press(screen.getByTestId('team-signin-go'));
    await settle();
  }

  it('lists Odoo invoices, filters them, and opens one to email or open in Odoo', async () => {
    const o = fakeOdoo();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await signIn(o);
    await act(async () => router.navigate('/sales'));
    await settle();
    expect(screen.getByTestId('sales-odoo-quotations')).toBeTruthy();
    // Sales shows Odoo's invoices themselves, not the phone's.
    expect(screen.queryByTestId('sales-odoo-invoices')).toBeNull();
    expect(screen.getByTestId('odoo-row-3')).toHaveTextContent(/INV\/2026\/00003.*\$398.*Pat Smith.*Overdue/);
    expect(screen.getByTestId('odoo-row-2')).toHaveTextContent(/Paid/);
    // Saved for when there's no signal.
    expect(parseSavedLists(await AsyncStorage.getItem(LISTS_STORAGE_KEY)).invoices?.rows).toHaveLength(3);

    await fireEvent.press(within(screen.getByTestId('odoo-list-filter')).getByText('Not paid'));
    await settle();
    expect(screen.queryByTestId('odoo-row-2')).toBeNull();

    await fireEvent.press(screen.getByTestId('odoo-row-3'));
    await settle();
    expect(screen.getByTestId('odoo-record')).toHaveTextContent(/2 springs × 2/);
    expect(screen.getByTestId('odoo-record-owed')).toHaveTextContent('$398');
    await fireEvent.press(screen.getByTestId('odoo-record-email'));
    await settle();
    expect(screen.getByTestId('odoo-record-email-confirm')).toHaveTextContent(/Email pat@example.com Odoo's invoice INV\/2026\/00003/);
    await fireEvent.press(screen.getByTestId('odoo-record-email-send'));
    await settle();
    expect(screen.getByTestId('odoo-record-emailed')).toHaveTextContent('Odoo sent the email to pat@example.com.');
    expect(o.calls.find((c) => c.method === 'send_mail')).toMatchObject({ args: [[12], 3] });
    await fireEvent.press(screen.getByTestId('odoo-record-open'));
    expect(open).toHaveBeenCalledWith('https://acme.odoo.com/web#id=3&model=account.move&view_type=form');
  });

  it("mirrors Odoo on the phone's own invoices, and lists the ones not in Odoo yet", async () => {
    const o = fakeOdoo();
    const job = { id: 'j1', customer: 'Pat Smith', address: '12 Oak St' };
    const option = { tier: 'good' as const, available: true, springCount: 2, lines: [{ label: 'Springs', cents: 30000, taxable: true }], subtotal: 30000, tax: 2475, total: 32475 };
    const inOdoo = { ...createInvoice(job, option, [], 1000, 'i-odoo'), odoo: { id: 3, name: 'INV/2026/00003', total: 32475, residual: 32475, paymentState: 'not_paid', sentPayments: [], checkedAt: 0 } };
    const phoneOnly = createInvoice({ ...job, id: 'j2', customer: 'Lee Park' }, option, [inOdoo], 2000, 'i-phone');
    await signIn(o, () => AsyncStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify([inOdoo, phoneOnly])));
    await settle(20);

    // Read back from Odoo in the background: Odoo's lines and totals now.
    const [mirrored] = parseInvoices(await AsyncStorage.getItem(INVOICES_STORAGE_KEY)).filter((i) => i.id === 'i-odoo');
    expect(mirrored).toMatchObject({ subtotal: 39800, tax: 0, total: 39800, lines: [{ label: '2 springs', cents: 39800, qty: 2 }] });
    expect(o.calls.some((c) => c.model === 'account.move' && c.method === 'create')).toBe(false);

    await act(async () => router.navigate('/sales'));
    await settle();
    expect(screen.getByTestId('invoices-waiting')).toHaveTextContent(/1 invoice made on this phone isn't in Odoo yet/);
    expect(screen.getByTestId('invoice-i-phone')).toHaveTextContent(/1002 · Lee Park/);
    expect(screen.queryByTestId('invoice-i-odoo')).toBeNull();
    // The phone has this one: open it there, with its payments and signature.
    await fireEvent.press(screen.getByTestId('odoo-row-3'));
    await settle();
    expect(screen.getByTestId('invoice-page')).toHaveTextContent(/Invoice INV\/2026\/00003/);
    expect(screen.getByTestId('invoice-page')).toHaveTextContent(/2 springs/);
  });
});
