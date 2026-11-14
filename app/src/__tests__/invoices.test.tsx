import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { qrMatrix } from '../components/QrCode';
import { makeBackup, parseBackup } from '../lib/backup';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import {
  balance,
  Business,
  BUSINESS_STORAGE_KEY,
  createInvoice,
  EMPTY_BUSINESS,
  Invoice,
  invoiceStatus,
  invoiceText,
  INVOICES_STORAGE_KEY,
  nextInvoiceNumber,
  parseInvoices,
  payLinks,
} from '../lib/invoices';
import { createJob, JOBS_STORAGE_KEY } from '../lib/jobs';
import { DEFAULT_PRICE_SHEET, PRICE_SHEET_STORAGE_KEY, PriceSheet } from '../lib/prices';
import { buildQuote } from '../lib/quote';
import { renderApp } from '../testing/renderApp';

const MATCH = { mode: 'match' as const, form: { ...DEFAULT_MATCH_FORM, twentyCoil: '4 1/2', length: '24' } };
const SHEET: PriceSheet = { ...DEFAULT_PRICE_SHEET, serviceCall: '89', springLabor: '150', spring: { good: '60', better: '85', best: '120' }, taxPercent: '8.25' };
const BIZ: Business = { name: 'Ace Doors', phone: '555-000-1111', cashtag: '$AceDoors', venmo: '@ace-doors', zelle: 'pay@acedoors.com', reviewUrl: '' };

const job = createJob(MATCH, { customer: 'Pat Smith', address: '12 Oak St', phone: '', notes: '' }, { title: '.225 × 2" × 24"' }, 1000, 'j1');
const good = buildQuote(MATCH, SHEET).options[0];

describe('invoices (plain logic)', () => {
  it('numbers invoices from 1001 up', () => {
    expect(nextInvoiceNumber([])).toBe('1001');
    const a = createInvoice(job, good, [], 5, 'a');
    expect(a.number).toBe('1001');
    expect(createInvoice(job, good, [a, { ...a, number: '1007' }], 6).number).toBe('1008');
  });

  it('copies the picked option and tracks what is paid', () => {
    const inv = createInvoice(job, good, [], 5, 'a');
    // 2 × $60 + $150 + $89, tax on the springs only.
    expect(inv.total).toBe(36890);
    expect(inv.lines.map((l) => l.label)).toEqual(['2 springs, .225 × 2" × 24"', 'Spring labor', 'Service call']);
    expect(invoiceStatus(inv)).toBe('unpaid');
    const part: Invoice = { ...inv, payments: [{ id: 'p', method: 'check', amount: 20000, at: 6, reference: '1042' }] };
    expect(invoiceStatus(part)).toBe('partial');
    expect(balance(part)).toBe(16890);
    expect(invoiceStatus({ ...part, payments: [...part.payments, { id: 'q', method: 'zelle', amount: 16890, at: 7, reference: '' }] })).toBe('paid');
    expect(invoiceStatus({ ...inv, voidedAt: 9 })).toBe('void');
  });

  it('builds Cash App and Venmo links with the amount, and shows Zelle as a handle', () => {
    const links = payLinks(BIZ, 36890, 'Invoice 1001');
    expect(links).toEqual([
      { method: 'cashapp', label: 'Cash App', handle: '$AceDoors', url: 'https://cash.app/$AceDoors/368.90' },
      { method: 'venmo', label: 'Venmo', handle: '@ace-doors', url: 'https://venmo.com/ace-doors?txn=pay&amount=368.90&note=Invoice%201001' },
      { method: 'zelle', label: 'Zelle', handle: 'pay@acedoors.com' },
    ]);
    expect(payLinks(EMPTY_BUSINESS, 100, '')).toEqual([]);
  });

  it('writes invoice text with how to pay', () => {
    const text = invoiceText(createInvoice(job, good, [], new Date(2026, 10, 11).getTime(), 'a'), BIZ);
    expect(text).toMatch(/^Ace Doors: invoice 1001/);
    expect(text).toMatch(/Amount due: \$368\.90/);
    expect(text).toMatch(/Cash App: https:\/\/cash\.app\/\$AceDoors\/368\.90/);
    expect(text).toMatch(/Zelle: pay@acedoors\.com/);
    expect(text).toMatch(/Questions: 555-000-1111/);
  });

  it('reads saved invoices safely', () => {
    expect(parseInvoices('x')).toEqual([]);
    const inv = createInvoice(job, good, [], 5, 'a');
    const raw = JSON.stringify([inv, { id: 'no job' }, { ...inv, id: 'b', payments: [{ method: 'bitcoin', amount: 5 }] }]);
    const out = parseInvoices(raw);
    expect(out.map((i) => i.id)).toEqual(['a', 'b']);
    expect(out[1].payments).toEqual([]);
  });

  it('draws a QR code for a payment link', () => {
    const m = qrMatrix('https://cash.app/$AceDoors/368.90');
    expect(m).not.toBeNull();
    expect(m!.length).toBeGreaterThanOrEqual(21);
    // The three corner finder squares are dark at their corners.
    expect([m![0][0], m![0][m!.length - 1], m![m!.length - 1][0]]).toEqual([true, true, true]);
  });

  it('goes into backups and back', () => {
    const inv = createInvoice(job, good, [], 5, 'a');
    const parsed = parseBackup(makeBackup({ jobs: [job], invoices: [inv], business: BIZ, priceSheet: SHEET }, 10));
    expect(parsed.ok && parsed.backup.invoices).toEqual([inv]);
    expect(parsed.ok && parsed.backup.business).toEqual(BIZ);
  });
});

async function settle() {
  for (let i = 0; i < 5; i++) await act(async () => undefined);
}

async function keypad(keys: string[]) {
  const pad = screen.getByTestId('keypad');
  await fireEvent.press(within(pad).getByTestId('key-clear'));
  for (const k of keys) await fireEvent.press(within(pad).getByTestId(`key-${k}`));
  await fireEvent.press(within(pad).getByTestId('keypad-done'));
}

describe('invoices in the app', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(PRICE_SHEET_STORAGE_KEY, JSON.stringify(SHEET));
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([{ ...job, accepted: { tier: 'good', total: good.total, at: 2000 } }]));
  });

  it('makes an invoice from the picked option and records payments until paid', async () => {
    await AsyncStorage.setItem(BUSINESS_STORAGE_KEY, JSON.stringify(BIZ));
    const app = await renderApp('/quote/j1');
    await settle();
    await fireEvent.press(screen.getByTestId('quote-make-invoice'));
    expect(app.getPathname()).toMatch(/^\/invoice\//);
    expect(screen.getByTestId('invoice-status')).toHaveTextContent('UNPAID');
    expect(screen.getByTestId('invoice-due')).toHaveTextContent('$368.90');

    // Cash App shows first; Venmo is a tap away; Zelle is shown as where to send.
    expect(screen.getByTestId('qr-cashapp')).toBeTruthy();
    await fireEvent.press(within(screen.getByTestId('invoice-qr-pick')).getByText('Venmo'));
    expect(screen.getByTestId('qr-venmo')).toBeTruthy();
    expect(screen.getByTestId('pay-zelle')).toHaveTextContent('Zelle: send to pay@acedoors.com');

    // $200 by check #1042.
    await fireEvent.press(within(screen.getByTestId('payment-method')).getByText('Check'));
    await fireEvent.press(screen.getByTestId('payment-amount'));
    await keypad(['2', '0', '0']);
    await fireEvent.changeText(screen.getByTestId('payment-reference'), '1042');
    await fireEvent.press(screen.getByTestId('payment-record'));
    expect(screen.getByTestId('invoice-status')).toHaveTextContent('PART PAID');
    expect(screen.getByTestId('invoice-due')).toHaveTextContent('$168.90');

    // The rest by Zelle; the amount defaults to what's still owed.
    await fireEvent.press(within(screen.getByTestId('payment-method')).getByText('Zelle'));
    await fireEvent.press(screen.getByTestId('payment-record'));
    expect(screen.getByTestId('invoice-status')).toHaveTextContent('PAID');
    expect(screen.queryByTestId('invoice-qr')).toBeNull();

    const [saved] = parseInvoices(await AsyncStorage.getItem(INVOICES_STORAGE_KEY));
    expect(saved.payments.map((p) => [p.method, p.amount, p.reference])).toEqual([
      ['check', 20000, '1042'],
      ['zelle', 16890, ''],
    ]);
  });

  it('asks for payment handles when there are none, and the quote then opens the invoice', async () => {
    const app = await renderApp('/quote/j1');
    await settle();
    await fireEvent.press(screen.getByTestId('quote-make-invoice'));
    expect(screen.getByTestId('invoice-no-handles')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('invoice-set-business'));
    expect(app.getPathname()).toBe('/business');
    await fireEvent.changeText(screen.getByTestId('business-cashtag'), '$AceDoors');
    expect(screen.getByTestId('business-qr-cashapp')).toBeTruthy();
    await settle();
    expect(JSON.parse((await AsyncStorage.getItem(BUSINESS_STORAGE_KEY))!).cashtag).toBe('$AceDoors');
  });

  it('lists what is owed and shows it on the job', async () => {
    await renderApp('/quote/j1');
    await settle();
    await fireEvent.press(screen.getByTestId('quote-make-invoice'));
    await fireEvent.press(screen.getByTestId('invoice-page-close'));
    expect(screen.getByTestId('quote-open-invoice')).toHaveTextContent('Open invoice 1001');
    await fireEvent.press(screen.getByTestId('quote-sheet-close'));
    await fireEvent.press(screen.getByTestId('open-invoices'));
    expect(screen.getByTestId('invoices-owed')).toHaveTextContent('Owed to you: $368.90 on 1 invoice');
  });

  it('voids on a second tap', async () => {
    await renderApp('/quote/j1');
    await settle();
    await fireEvent.press(screen.getByTestId('quote-make-invoice'));
    await fireEvent.press(screen.getByTestId('invoice-void'));
    expect(screen.getByTestId('invoice-status')).toHaveTextContent('UNPAID');
    await fireEvent.press(screen.getByTestId('invoice-void'));
    expect(screen.getByTestId('invoice-status')).toHaveTextContent('VOID');
  });
});

describe('review requests', () => {
  it('cleans up the review link and writes the ask', () => {
    const { reviewLink, reviewRequestText } = require('../lib/invoices') as typeof import('../lib/invoices');
    expect(reviewLink({ reviewUrl: 'g.page/r/abc/review' })).toBe('https://g.page/r/abc/review');
    expect(reviewLink({ reviewUrl: 'not a link' })).toBe('');
    expect(reviewRequestText({ billTo: 'Pat Smith' }, { ...BIZ, reviewUrl: 'https://g.page/r/abc' })).toBe(
      "Hi Pat, thanks for choosing Ace Doors! If you're happy with the work on your garage door, a quick review helps a lot: https://g.page/r/abc",
    );
  });

  it('offers to ask for a review once an invoice is paid', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(BUSINESS_STORAGE_KEY, JSON.stringify({ ...BIZ, reviewUrl: 'g.page/r/abc' }));
    const i = createInvoice({ ...job, customerId: 'c1' }, good, [], 5, 'i1');
    await AsyncStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify([{ ...i, payments: [{ id: 'p', method: 'cash', amount: i.total, at: 6, reference: '' }] }]));
    await AsyncStorage.setItem('customers/v1', JSON.stringify([{ id: 'c1', name: 'Pat Smith', phone: '555-123-4567', email: '', address: '', notes: '', createdAt: 1, updatedAt: 1 }]));
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([{ ...job, customerId: 'c1' }]));
    const { Linking } = require('react-native');
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderApp('/invoice/i1');
    await settle();
    await fireEvent.press(screen.getByTestId('invoice-review'));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^sms:5551234567\?body=Hi%20Pat.*https%3A%2F%2Fg\.page%2Fr%2Fabc$/));
    open.mockRestore();
  });

  it("picks a job's warranty (parts and/or labor) and shows uses a day, and keeps them", async () => {
    await AsyncStorage.clear();
    const i = createInvoice({ ...job, customerId: 'c1' }, good, [], Date.now(), 'i1');
    await AsyncStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify([i]));
    await renderApp('/invoice/i1');
    await settle();
    await fireEvent.press(within(screen.getByTestId('coverage-labor')).getByText('None'));
    await fireEvent.press(within(screen.getByTestId('coverage-parts')).getByText('3 yr'));
    expect(screen.getByTestId('coverage-uses')).toHaveTextContent('4a day');
    expect(screen.getByTestId('invoice-warranty')).toHaveTextContent(/springs until/);
    expect(screen.getByTestId('invoice-warranty')).not.toHaveTextContent(/labor until/);
    await settle();
    const saved = parseInvoices(await AsyncStorage.getItem(INVOICES_STORAGE_KEY))[0];
    expect(saved.warranty).toEqual({ partsMonths: 36, laborMonths: 0 });
    expect(saved.cyclesPerDay).toBeUndefined();
  });
});
