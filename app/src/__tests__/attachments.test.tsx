import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { ATTACHMENTS_STORAGE_KEY, mergeSignatures, parseAttachments, photosFor, Signature, signatureFor, signatureSvg, strokePath } from '../lib/attachments';
import { makeBackup, parseBackup } from '../lib/backup';
import { DeviceMedia } from '../lib/deviceMedia';
import { EMPTY_BUSINESS, Invoice, INVOICES_STORAGE_KEY } from '../lib/invoices';
import { JOBS_STORAGE_KEY } from '../lib/jobs';
import { escapeHtml, invoiceHtml, pdfName, qrSvg, quoteHtml } from '../lib/pdf';
import { DEFAULT_PRICE_SHEET } from '../lib/prices';
import { renderApp } from '../testing/renderApp';

const mockMedia: jest.Mocked<DeviceMedia> = {
  takePhoto: jest.fn(async () => 'file:///photos/one.jpg'),
  pickPhotos: jest.fn(async () => ['file:///photos/two.jpg', 'file:///photos/three.jpg']),
  deletePhoto: jest.fn(),
  sharePdf: jest.fn(async (_html: string, _name: string) => undefined),
  sharePhoto: jest.fn(async (_uri: string) => undefined),
};
jest.mock('../lib/deviceMedia', () => ({ deviceMedia: () => mockMedia }));
const fake = mockMedia;

const sig = (extra: Partial<Signature> = {}): Signature => ({ id: 's1', for: 'invoice', refId: 'inv1', name: 'Pat Smith', paths: ['M1 1L20 20'], w: 300, h: 150, at: 5, ...extra });
const invoice = (extra: Partial<Invoice> = {}): Invoice => ({
  id: 'inv1',
  number: '1001',
  jobId: 'j1',
  billTo: 'Pat <Smith>',
  address: '1 Oak St',
  tier: 'better',
  lines: [{ label: 'Torsion spring', cents: 25000, taxable: true }],
  subtotal: 25000,
  tax: 0,
  total: 25000,
  payments: [],
  createdAt: new Date(2026, 10, 11).getTime(),
  updatedAt: 1,
  ...extra,
});

describe('photos and signatures (plain logic)', () => {
  it('turns strokes into short SVG paths and an SVG', () => {
    expect(strokePath([])).toBe('');
    expect(strokePath([{ x: 1.234, y: 2 }])).toBe('M1.2 2L1.7 2.5');
    expect(strokePath([{ x: 0, y: 0 }, { x: 10.06, y: 5 }])).toBe('M0 0L10.1 5');
    const svg = signatureSvg({ paths: ['M0 0L10 10', '<script>'], w: 300, h: 150 }, 200);
    expect(svg).toContain('width="200" height="100"');
    expect(svg).toContain('<path d="M0 0L10 10"/>');
    expect(svg).not.toContain('script');
  });

  it('finds photos and the latest signature, and reads saved data safely', () => {
    const a = parseAttachments({
      photos: [{ id: 'p2', jobId: 'j1', uri: 'b', kind: 'after', at: 2 }, { id: 'p1', jobId: 'j1', uri: 'a', kind: 'weird', at: 1 }, { id: 'x', jobId: 'j2' }],
      signatures: [sig(), sig({ id: 's2', at: 9, name: 'Later' }), { id: 'bad', for: 'other', refId: 'x', paths: ['M0 0'] }, sig({ id: 'empty', paths: [] })],
    });
    expect(photosFor(a, 'j1').map((p) => [p.id, p.kind])).toEqual([
      ['p1', 'other'],
      ['p2', 'after'],
    ]);
    expect(signatureFor(a, 'invoice', 'inv1')?.name).toBe('Later');
    expect(signatureFor(a, 'quote', 'inv1')).toBeUndefined();
    expect(a.signatures).toHaveLength(2);
    expect(parseAttachments('junk')).toEqual({ photos: [], signatures: [] });
    expect(mergeSignatures(a, [sig(), sig({ id: 's3' })]).signatures.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('puts signatures in backups', () => {
    const parsed = parseBackup(makeBackup({ jobs: [], signatures: [sig()], priceSheet: DEFAULT_PRICE_SHEET }, 1));
    expect(parsed.ok && parsed.backup.signatures.map((s) => s.id)).toEqual(['s1']);
    const old = parseBackup(JSON.stringify({ format: 'garage-door-tech-backup', version: 1, jobs: [] }));
    expect(old.ok && old.backup.signatures).toEqual([]);
  });

  it('makes an invoice page with QR codes to pay and the signature', () => {
    const biz = { ...EMPTY_BUSINESS, name: 'Ace & Sons', phone: '555-0100', cashtag: 'acedoors', zelle: 'pay@ace.test' };
    const html = invoiceHtml(invoice(), biz, sig(), { warranty: 'Warranty: springs until Nov 11, 2029.' });
    expect(html).toContain('<h1>Ace &amp; Sons</h1>');
    expect(html).toContain('Pat &lt;Smith&gt;');
    expect(html).toContain('Invoice 1001');
    expect(html).toContain('UNPAID');
    expect(html).toContain('$250');
    expect(html).toContain('Pay $250');
    expect(html).toMatch(/<svg[^>]*>.*<\/svg><div><b>Cash App<\/b> \$acedoors/);
    expect(html).toContain('<b>Zelle</b> pay@ace.test');
    expect(html).toContain('Warranty: springs until');
    expect(html).toContain('<path d="M1 1L20 20"/>');
    // Paid in full: no pay section, and no signature still leaves a line to sign.
    const paidHtml = invoiceHtml(invoice({ payments: [{ id: 'p', method: 'check', amount: 25000, at: 1, reference: '123' }] }), biz);
    expect(paidHtml).not.toContain('Pay $');
    expect(paidHtml).toContain('Check #123');
    expect(paidHtml).toContain('Signature: ____');
    expect(qrSvg('https://cash.app/$x/1.00')).toMatch(/^<svg/);
    expect(escapeHtml(`<a href="x">'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&lt;/a&gt;');
    expect(pdfName('Invoice 1001', 'Pat O\'Brien / Garage')).toBe('Invoice 1001 Pat OBrien Garage.pdf');
  });

  it('makes a quote page marking the chosen option', () => {
    const quote = {
      options: [
        { tier: 'good' as const, available: true, springCount: 1, lines: [{ label: 'Spring', cents: 20000, taxable: true }], subtotal: 20000, tax: 0, total: 20000 },
        { tier: 'best' as const, available: true, springCount: 1, lines: [{ label: 'Spring', cents: 30000, taxable: true }], subtotal: 30000, tax: 0, total: 30000 },
        { tier: 'better' as const, available: false, springCount: 0, lines: [], subtotal: 0, tax: 0, total: 0 },
      ],
    };
    const html = quoteHtml({ customer: 'Pat', address: '', savedAt: 1, accepted: { tier: 'best' } }, quote, EMPTY_BUSINESS, undefined, 1);
    expect(html).toContain('Best (chosen)');
    expect(html).toContain('Good</b>');
    expect(html).not.toContain('Better');
    expect(html).toContain('I approve the Best option above.');
  });
});

describe('photos, signing and PDFs on screen', () => {
  const settle = async (n = 5) => {
    for (let k = 0; k < n; k++) await act(async () => undefined);
  };
  beforeEach(async () => {
    for (const f of Object.values(mockMedia)) f.mockClear();
    await AsyncStorage.clear();
  });

  it('takes and picks photos for a job and deletes one', async () => {
    const job = { id: 'j1', savedAt: 1, updatedAt: 1, status: 'open', customer: 'Pat', address: '1 Oak', phone: '', notes: '', summaryTitle: 'Spring', summaryDetail: '', mode: 'match', form: {} };
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([job]));
    await renderApp('/quote/j1');
    await settle();
    expect(screen.getByTestId('quote-photos')).toHaveTextContent('Take photos');
    await fireEvent.press(screen.getByTestId('quote-photos'));
    await settle();
    await fireEvent.press(screen.getByTestId('photos-take'));
    await settle();
    await fireEvent.press(within(screen.getByTestId('photos-kind')).getByText('After'));
    await fireEvent.press(screen.getByTestId('photos-pick'));
    await settle();
    const saved = parseAttachments(await AsyncStorage.getItem(ATTACHMENTS_STORAGE_KEY));
    expect(saved.photos.map((p) => [p.uri, p.kind])).toEqual([
      ['file:///photos/one.jpg', 'before'],
      ['file:///photos/two.jpg', 'after'],
      ['file:///photos/three.jpg', 'after'],
    ]);
    const first = saved.photos[0];
    await fireEvent.press(screen.getByTestId(`photo-delete-${first.id}`));
    await fireEvent.press(screen.getByTestId(`photo-delete-yes-${first.id}`));
    await settle(3);
    expect(fake.deletePhoto).toHaveBeenCalledWith('file:///photos/one.jpg');
    expect(parseAttachments(await AsyncStorage.getItem(ATTACHMENTS_STORAGE_KEY)).photos).toHaveLength(2);
  });

  it('has the customer sign an invoice and sends it as a PDF', async () => {
    await AsyncStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify([invoice({ billTo: 'Pat Smith' })]));
    await renderApp('/invoice/inv1');
    await settle();
    await fireEvent.press(screen.getByTestId('invoice-sign'));
    expect(screen.getByTestId('signature-save')).toBeDisabled();
    const pad = screen.getByTestId('signature-pad');
    await fireEvent(pad, 'layout', { nativeEvent: { layout: { width: 300, height: 200 } } });
    let tick = 0;
    const touch = (x: number, y: number) => ({ nativeEvent: { locationX: x, locationY: y, pageX: x, pageY: y, touches: [], changedTouches: [], identifier: 1, timestamp: Date.now() }, touchHistory: { touchBank: [{ touchActive: true, startPageX: x, startPageY: y, startTimeStamp: 0, currentPageX: x, currentPageY: y, currentTimeStamp: ++tick, previousPageX: x, previousPageY: y, previousTimeStamp: tick - 1 }], numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: tick } });
    await fireEvent(pad, 'responderGrant', touch(10, 10));
    await fireEvent(pad, 'responderMove', touch(50, 40));
    await fireEvent(pad, 'responderRelease', touch(50, 40));
    await fireEvent.press(screen.getByTestId('signature-save'));
    await settle(3);
    expect(screen.getByTestId('invoice-signed')).toHaveTextContent(/^Signed by Pat Smith on /);
    const saved = parseAttachments(await AsyncStorage.getItem(ATTACHMENTS_STORAGE_KEY)).signatures[0];
    expect(saved).toMatchObject({ for: 'invoice', refId: 'inv1', name: 'Pat Smith', paths: ['M10 10L50 40'], w: 300, h: 200 });

    await fireEvent.press(screen.getByTestId('invoice-pdf'));
    expect(fake.sharePdf).toHaveBeenCalledWith(expect.stringContaining('<path d="M10 10L50 40"/>'), 'Invoice 1001 Pat Smith.pdf');
  });
});
