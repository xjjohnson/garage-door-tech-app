import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { EMPTY_INSPECTION, Inspection, parseInspection, repairFromFlag, repairLines } from '../lib/inspection';
import { createJob, JOBS_STORAGE_KEY, parseJobs } from '../lib/jobs';
import { emailInvoice } from '../lib/odooReports';
import { lineValues, orderRef } from '../lib/odooSales';
import { fetchTemplates, parseTemplates, springTemplateQuote, springTemplatesFor, templateQuote, TemplateSets, TEMPLATES_STORAGE_KEY, tierFromName } from '../lib/odooTemplates';
import { DEFAULT_PRICE_SHEET, PRICE_SHEET_STORAGE_KEY, PriceSheet } from '../lib/prices';
import { resetQuoteTemplates } from '../lib/useQuoteTemplates';
import { renderApp } from '../testing/renderApp';

const SHEET: PriceSheet = { ...DEFAULT_PRICE_SHEET, taxPercent: '10' };

const SETS: TemplateSets = {
  opener: {
    type: 'Opener',
    tiers: {
      good: [{ productId: 11, label: 'Chain drive opener', qty: 1, unitCents: 30000, taxable: false }, { productId: 12, label: 'Install labor', qty: 1, unitCents: 15000, taxable: true }],
      best: [{ productId: 13, label: 'Belt drive opener', qty: 1, unitCents: 45000, taxable: false }, { productId: 14, label: 'Remote', qty: 2, unitCents: 3000, taxable: false }],
    },
  },
};

describe('quotation templates', () => {
  it('reads the tier from the template name', () => {
    expect(tierFromName('Opener · Good')).toEqual({ type: 'Opener', tier: 'good' });
    expect(tierFromName('Tune-up - Better')).toEqual({ type: 'Tune-up', tier: 'better' });
    expect(tierFromName('Broken spring: BEST')).toEqual({ type: 'Broken spring', tier: 'best' });
    expect(tierFromName('Off track • Good')).toEqual({ type: 'Off track', tier: 'good' });
    expect(tierFromName('Off track Better')).toEqual({ type: 'Off track', tier: 'better' });
    expect(tierFromName('off track best')).toEqual({ type: 'off track', tier: 'best' });
    expect(tierFromName('Default template')).toBeNull();
    expect(tierFromName('Best')).toBeNull();
  });

  it('fetches templates with their products, prices and taxes', async () => {
    const client = {
      call: jest.fn(async (model: string) => {
        if (model === 'sale.order.template') return [{ id: 1, name: 'Opener · Good' }, { id: 2, name: 'Something else' }];
        if (model === 'sale.order.template.line')
          return [
            { sale_order_template_id: [1, 'Opener · Good'], product_id: [11, 'Opener'], name: 'Chain drive opener\nwith rail', product_uom_qty: 1, display_type: false },
            { sale_order_template_id: [1, 'Opener · Good'], product_id: false, name: 'Section', product_uom_qty: 0, display_type: 'line_section' },
            { sale_order_template_id: [1, 'Opener · Good'], product_id: [12, 'Labor'], name: '', product_uom_qty: 2, display_type: false },
          ];
        if (model === 'product.product') return [{ id: 11, lst_price: 300, taxes_id: [], display_name: 'Opener' }, { id: 12, lst_price: 75, taxes_id: [3], display_name: 'Labor' }];
        throw new Error(model);
      }),
    };
    const sets = await fetchTemplates(client);
    // The template's section heading now comes through, in place (0.5.151).
    const good = [{ productId: 11, label: 'Chain drive opener', qty: 1, unitCents: 30000, taxable: false }, { productId: 0, label: 'Section', qty: 1, unitCents: 0, taxable: false, display: 'section' }, { productId: 12, label: 'Labor', qty: 2, unitCents: 7500, taxable: true }];
    expect(sets).toEqual({
      opener: { type: 'Opener', tiers: { good } },
      'template: opener · good': { type: 'Opener · Good', tiers: { good }, plain: true },
      'template: something else': { type: 'Something else', tiers: { good: [] }, plain: true },
    });
    expect(parseTemplates(JSON.stringify(sets))).toEqual(sets);
    expect(parseTemplates('nope')).toEqual({});
  });

  it('prices good / better / best from them, tax on taxed lines only', () => {
    const q = templateQuote(SETS.opener, SHEET, [{ label: 'Rollers', cents: 4000, taxable: true }]);
    const [good, better, best] = q.options;
    expect(good.available).toBe(true);
    expect(good.subtotal).toBe(30000 + 15000 + 4000);
    expect(good.tax).toBe(1900);
    expect(better.available).toBe(false);
    expect(better.reason).toMatch(/Opener · Better/);
    expect(best.lines.map((l) => l.label)).toEqual(['Belt drive opener', 'Remote × 2', 'Rollers']);
    expect(best.lines[1]).toMatchObject({ cents: 6000, qty: 2, productId: 14 });
  });

  it('prices a spring job from the Springs templates, with the calculator picking the spring', () => {
    const sets: TemplateSets = {
      springs: {
        type: 'Springs',
        tiers: {
          good: [{ productId: 21, label: 'Torsion spring 10k', qty: 1, unitCents: 6000, taxable: true }, { productId: 22, label: 'Spring labor', qty: 1, unitCents: 15000, taxable: false }],
          better: [{ productId: 23, label: 'Torsion spring 25k', qty: 1, unitCents: 9000, taxable: true }, { productId: 22, label: 'Spring labor', qty: 1, unitCents: 15000, taxable: false }, { productId: 24, label: 'Rollers', qty: 1, unitCents: 8000, taxable: true }],
        },
      },
    };
    const set = springTemplatesFor(sets, 'Spring replacement');
    expect(set?.type).toBe('Springs');
    const base = (tier: 'good' | 'better' | 'best') => ({ tier, available: true, springCount: 2, lines: [{ label: `2 springs, .225 ${tier}`, cents: 0, taxable: true }], subtotal: 0, tax: 0, total: 0 });
    const q = springTemplateQuote({ options: [base('good'), base('better'), base('best')] }, set!, SHEET);
    const [good, better, best] = q.options;
    expect(good.lines).toEqual([
      { label: '2 springs, .225 good', cents: 12000, taxable: true, productId: 21, qty: 2 },
      { label: 'Spring labor', cents: 15000, taxable: false, productId: 22 },
    ]);
    expect(good.tax).toBe(1200);
    expect(better.subtotal).toBe(18000 + 15000 + 8000);
    expect(best.available).toBe(false);
    expect(best.reason).toMatch(/Springs · Best/);
    expect(springTemplateQuote({ blocked: 'No spring size yet', options: [] }, set!, SHEET).blocked).toBe('No spring size yet');
  });

  it('sends template lines to Odoo with their own product', () => {
    const v = lineValues([{ label: 'Remote × 2', cents: 6000, taxable: false, productId: 14, qty: 2 }, { label: 'Typed', cents: 100, taxable: false }], {}, () => 99, 'product_uom_qty');
    expect(v).toEqual([
      { product_id: 14, name: 'Remote × 2', product_uom_qty: 2, price_unit: 30 },
      { product_id: 99, name: 'Typed', product_uom_qty: 1, price_unit: 1 },
    ]);
    expect(orderRef('Better', ' 12 Elm St ')).toBe('Better · 12 Elm St');
    expect(orderRef('Good', '')).toBe('Good');
  });
});

describe('inspection add-ons', () => {
  it('leaves declined add-ons off the quote and keeps the item they came from', () => {
    const r = repairFromFlag({ key: 'd:x:rollers', label: 'Rollers', action: '' }, 1, 0);
    expect(r.item).toBe('d:x:rollers');
    const insp: Inspection = { ...EMPTY_INSPECTION(1), holdRepairs: undefined, repairs: [{ ...r, price: '40' }, { id: 'r2', label: 'Seal', price: '30', taxable: true, declined: true }] };
    expect(repairLines(insp).map((l) => l.label)).toEqual(['Rollers: repair']);
    expect(parseInspection(JSON.parse(JSON.stringify(insp)))!.repairs).toEqual(insp.repairs);
  });
});

describe('emailing the invoice from Odoo', () => {
  /** A pretend Odoo; `mail` is what mail.mail holds for the sent email. */
  /** `pdf`: the invoice's PDF id in Odoo now (false: none yet); `wizard`: which Send wizard this Odoo has. */
  function fake(mail: unknown[] = [], { pdf = [500, 'INV_2026_00003.pdf'] as unknown, wizard = 'account.move.send.wizard' as string | null } = {}) {
    const calls: unknown[][] = [];
    let n = 100;
    let made = pdf;
    const client = {
      call: jest.fn(async (...a: unknown[]) => {
        calls.push(a);
        const [model, method] = a as [string, string];
        if (model === 'res.partner') return [{ email: 'pat@example.com' }];
        if (model === 'account.move' && method === 'fields_get') return { name: {}, invoice_pdf_report_id: {} };
        if (model === 'account.move' && method === 'read') return [{ id: 5, invoice_pdf_report_id: made }];
        if (model.startsWith('account.move.send')) {
          if (model !== wizard) throw new Error(`Object ${model} doesn't exist.`);
          if (method === 'action_send_and_print') made = [501, 'INV.pdf'];
          return 9;
        }
        if (model === 'ir.attachment') return ++n;
        if (model === 'ir.model.data') return [{ res_id: 12 }];
        if (model === 'mail.template' && method === 'send_mail') return 77;
        if (model === 'mail.mail') return mail;
        return true;
      }),
    };
    return { client, calls };
  }

  it('needs an email on the contact', async () => {
    const { client } = fake();
    client.call.mockImplementationOnce(async () => [{ email: false }]);
    await expect(emailInvoice(client, 5, 7, [])).rejects.toThrow(/no email/);
    expect(client.call).toHaveBeenCalledTimes(1);
  });

  it('sends Odoo’s own invoice email with the inspection report added, and says Odoo sent it', async () => {
    const { client, calls } = fake();
    const r = await emailInvoice(client, 5, 7, [{ name: 'Inspection.pdf', base64: 'B' }]);
    expect(r).toEqual({ to: 'pat@example.com', state: 'sent' });
    expect(calls.filter((c) => c[0] === 'ir.attachment')).toHaveLength(1);
    // Odoo's own invoice PDF first, then the inspection report.
    expect(calls.find((c) => c[1] === 'send_mail')).toEqual(['mail.template', 'send_mail', [[12], 5], { force_send: true, email_values: { attachment_ids: [500, 101] } }]);
    expect(calls.some((c) => String(c[0]).startsWith('account.move.send'))).toBe(false);
    expect(calls.find((c) => c[0] === 'mail.mail')).toEqual(['mail.mail', 'search_read', [[['id', '=', 77]]], { fields: ['state', 'failure_reason'] }]);
    expect(calls.find((c) => c[1] === 'message_post')![3]).toMatchObject({ body: 'Invoice emailed to pat@example.com from the app, with Inspection.pdf.', subtype_xmlid: 'mail.mt_note' });
    // No phone-made invoice PDF, and no HTML body for Odoo to escape.
    expect(calls.some((c) => c[1] === 'message_post' && (c[3] as { partner_ids?: unknown }).partner_ids)).toBe(false);
  });

  it('has Odoo make its invoice PDF first when there is none yet (Odoo 18/19, then 17)', async () => {
    const a = fake([], { pdf: false });
    await emailInvoice(a.client, 5, 7, []);
    expect(a.calls.find((c) => c[0] === 'account.move.send.wizard' && c[1] === 'create')).toEqual(['account.move.send.wizard', 'create', [{ move_id: 5, sending_methods: [] }], { context: { active_model: 'account.move', active_ids: [5], active_id: 5 } }]);
    expect(a.calls.find((c) => c[1] === 'send_mail')![3]).toEqual({ force_send: true, email_values: { attachment_ids: [501] } });

    const b = fake([], { pdf: false, wizard: 'account.move.send' });
    await emailInvoice(b.client, 5, 7, []);
    expect(b.calls.find((c) => c[0] === 'account.move.send' && c[1] === 'create')![2]).toEqual([{ checkbox_send_mail: false, checkbox_download: true }]);
    expect(b.calls.find((c) => c[1] === 'send_mail')![3]).toEqual({ force_send: true, email_values: { attachment_ids: [501] } });
  });

  it('sends nothing when Odoo can’t make the invoice PDF', async () => {
    const c = fake([], { pdf: false, wizard: null });
    await expect(emailInvoice(c.client, 5, 7, [{ name: 'Inspection.pdf', base64: 'B' }])).rejects.toThrow(/didn't make the invoice PDF, so nothing was emailed/);
    expect(c.calls.some((x) => x[1] === 'send_mail')).toBe(false);
  });

  it('reports mail still queued, or why Odoo couldn’t send it', async () => {
    expect((await emailInvoice(fake([{ state: 'outgoing', failure_reason: false }]).client, 5, 7, [])).state).toBe('queued');
    expect(await emailInvoice(fake([{ state: 'exception', failure_reason: 'No outgoing mail server' }]).client, 5, 7, [])).toEqual({ to: 'pat@example.com', state: 'failed', reason: 'No outgoing mail server' });
  });
});

async function settle() {
  for (let i = 0; i < 5; i++) await act(async () => undefined);
}

describe('quote screen', () => {
  const base = createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Pat Smith', address: '12 Oak St', phone: '', notes: '' }, { title: '' }, 1000, 'j1');

  beforeEach(async () => {
    resetQuoteTemplates();
    await AsyncStorage.clear();
    await AsyncStorage.setItem(PRICE_SHEET_STORAGE_KEY, JSON.stringify(SHEET));
    await AsyncStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(SETS));
  });

  it('lists every Odoo template with no Good, Better or Best slots', async () => {
    await AsyncStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify({ ...SETS, 'template: opener · good': { type: 'Opener · Good', tiers: { good: SETS.opener.tiers.good }, plain: true } }));
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([{ ...base, what: 'Opener' }]));
    await renderApp('/quote/j1');
    await settle();
    expect(screen.getByTestId('quote-template-template: opener · good')).toHaveTextContent(/Opener · Good.*\$465/);
    expect(screen.queryByText(/No ".*" template in Odoo/)).toBeNull();
    expect(screen.queryByTestId('quote-better')).toBeNull();
    expect(screen.queryByTestId('quote-inspection')).toBeNull();
  });

  it('shows the lines of a picked template and puts several on one estimate', async () => {
    await AsyncStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify({ ...SETS, 'template: opener · good': { type: 'Opener · Good', tiers: { good: SETS.opener.tiers.good }, plain: true }, 'template: opener · best': { type: 'Opener · Best', tiers: { good: SETS.opener.tiers.best }, plain: true } }));
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([{ ...base, what: 'Opener' }]));
    await renderApp('/quote/j1');
    await settle();
    await fireEvent.press(screen.getByTestId('quote-template-template: opener · good'));
    await fireEvent.press(screen.getByTestId('quote-template-template: opener · best'));
    expect(screen.getByTestId('quote-template-mode')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('quote-template-add'));
    await settle();
    const t = JSON.parse((await AsyncStorage.getItem(JOBS_STORAGE_KEY))!)[0].ticket;
    expect(t.lines.filter((l: { kind: string }) => l.kind === 'section').map((l: { name: string }) => l.name)).toEqual(['Opener · Good', 'Opener · Best']);
  });

  it('can add several templates as separate estimates', async () => {
    await AsyncStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify({ ...SETS, 'template: opener · good': { type: 'Opener · Good', tiers: { good: SETS.opener.tiers.good }, plain: true }, 'template: opener · best': { type: 'Opener · Best', tiers: { good: SETS.opener.tiers.best }, plain: true } }));
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([{ ...base, what: 'Opener' }]));
    await renderApp('/quote/j1');
    await settle();
    await fireEvent.press(screen.getByTestId('quote-template-template: opener · good'));
    await fireEvent.press(screen.getByTestId('quote-template-template: opener · best'));
    await fireEvent.press(within(screen.getByTestId('quote-template-mode')).getByText('Separate estimates'));
    await fireEvent.press(screen.getByTestId('quote-template-add'));
    await settle();
    const j = JSON.parse((await AsyncStorage.getItem(JOBS_STORAGE_KEY))!)[0];
    expect(JSON.stringify(j.estimates)).toContain('Opener · Good');
    expect(j.ticket.title).toBe('Opener · Best');
  });
});

describe('Templates screen without the old quote area', () => {
  const job = createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Pat Smith', address: '12 Oak St', phone: '', notes: '' }, { title: '' }, 1000, 'j1');

  beforeEach(async () => {
    resetQuoteTemplates();
    await AsyncStorage.clear();
    await AsyncStorage.setItem(PRICE_SHEET_STORAGE_KEY, JSON.stringify(SHEET));
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([{ ...job, what: 'Opener' }]));
  });

  it('has no price book lines, picked-option card or send buttons, and never lists spring measurements', async () => {
    await AsyncStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify({ 'template: opener · good': { type: 'Opener · Good', tiers: { good: SETS.opener.tiers.good }, plain: true } }));
    await renderApp('/quote/j1');
    await settle();
    for (const id of ['quote-blocked', 'quote-line-add', 'quote-line-custom', 'quote-good', 'quote-pdf', 'quote-share', 'quote-accept-good']) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.queryByText(/coils|Spring length|Customer picked/)).toBeNull();
    expect(screen.getByTestId('quote-template-template: opener · good')).toBeTruthy();
  });

  it('shows each picked template as its own card, with the total only when they go on one estimate', async () => {
    await AsyncStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify({ 'template: opener · good': { type: 'Opener · Good', tiers: { good: SETS.opener.tiers.good }, plain: true }, 'template: opener · best': { type: 'Opener · Best', tiers: { good: SETS.opener.tiers.best }, plain: true } }));
    await renderApp('/quote/j1');
    await settle();
    await fireEvent.press(screen.getByTestId('quote-template-template: opener · good'));
    expect(screen.queryByTestId('quote-selected-total')).toBeNull();
    await fireEvent.press(screen.getByTestId('quote-template-template: opener · best'));
    expect(screen.getByTestId('quote-selected-template: opener · good')).toBeTruthy();
    expect(screen.getByTestId('quote-selected-template: opener · best')).toBeTruthy();
    expect(screen.getByTestId('quote-selected-total')).toBeTruthy();
    await fireEvent.press(within(screen.getByTestId('quote-template-mode')).getByText('Separate estimates'));
    expect(screen.queryByTestId('quote-selected-total')).toBeNull();
    expect(screen.getByTestId('quote-template-add')).toHaveTextContent('Add 2 separate estimates');
    await fireEvent.press(screen.getByTestId('quote-selected-remove-template: opener · best'));
    expect(screen.queryByTestId('quote-selected-template: opener · best')).toBeNull();
  });
});
