import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { EMPTY_INSPECTION, Inspection, parseInspection, repairFromFlag, repairLines } from '../lib/inspection';
import { createJob, JOBS_STORAGE_KEY, parseJobs } from '../lib/jobs';
import { emailCustomer } from '../lib/odooReports';
import { lineValues, orderRef } from '../lib/odooSales';
import { fetchTemplates, parseTemplates, templateQuote, TemplateSets, TEMPLATES_STORAGE_KEY, tierFromName } from '../lib/odooTemplates';
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
    expect(tierFromName('Default template')).toBeNull();
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
    expect(sets).toEqual({
      opener: {
        type: 'Opener',
        tiers: { good: [{ productId: 11, label: 'Chain drive opener', qty: 1, unitCents: 30000, taxable: false }, { productId: 12, label: 'Labor', qty: 2, unitCents: 7500, taxable: true }] },
      },
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
    const insp: Inspection = { ...EMPTY_INSPECTION(1), repairs: [{ ...r, price: '40' }, { id: 'r2', label: 'Seal', price: '30', taxable: true, declined: true }] };
    expect(repairLines(insp).map((l) => l.label)).toEqual(['Rollers: repair']);
    expect(parseInspection(JSON.parse(JSON.stringify(insp)))!.repairs).toEqual(insp.repairs);
  });
});

describe('emailing the invoice from Odoo', () => {
  it('needs an email on the contact', async () => {
    const client = { call: jest.fn(async () => [{ email: false }]) };
    await expect(emailCustomer(client, 'account.move', 5, 7, [], 'Hi')).rejects.toThrow(/no email/);
    expect(client.call).toHaveBeenCalledTimes(1);
  });

  it('attaches each PDF and posts a message to the customer', async () => {
    const calls: unknown[][] = [];
    let n = 100;
    const client = {
      call: jest.fn(async (...a: unknown[]) => {
        calls.push(a);
        if (a[0] === 'res.partner') return [{ email: 'pat@example.com' }];
        if (a[0] === 'ir.attachment') return ++n;
        return true;
      }),
    };
    const to = await emailCustomer(client, 'account.move', 5, 7, [{ name: 'Invoice.pdf', base64: 'A' }, { name: 'Inspection.pdf', base64: 'B' }], '<p>Hi</p>');
    expect(to).toBe('pat@example.com');
    expect(calls.filter((c) => c[0] === 'ir.attachment')).toHaveLength(2);
    expect(calls.at(-1)).toEqual(['account.move', 'message_post', [[5]], { body: '<p>Hi</p>', partner_ids: [7], attachment_ids: [101, 102], message_type: 'comment', subtype_xmlid: 'mail.mt_comment' }]);
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

  it('quotes an opener job from the Odoo templates', async () => {
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([{ ...base, what: 'Opener' }]));
    await renderApp('/quote/j1');
    await settle();
    expect(screen.getByTestId('quote-from-templates')).toHaveTextContent('From your Odoo quotation templates for Opener.');
    expect(screen.queryByTestId('quote-blocked')).toBeNull();
    expect(screen.getByTestId('quote-total-good')).toHaveTextContent('$465');
    expect(screen.getByTestId('quote-better')).toHaveTextContent(/No "Opener · Better" template/);
  });

  it('lets the customer take an inspection add-on off', async () => {
    const insp: Inspection = { ...EMPTY_INSPECTION(1000), repairs: [{ id: 'r1', label: 'New rollers', price: '40', taxable: false, item: 'd:x:rollers' }] };
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([{ ...base, what: 'Opener', inspection: insp }]));
    await renderApp('/quote/j1');
    await settle();
    expect(screen.getByTestId('quote-total-good')).toHaveTextContent('$505');
    await fireEvent.press(screen.getByTestId('quote-addon-r1'));
    expect(screen.getByTestId('quote-addon-r1')).toHaveTextContent(/Customer said no/);
    expect(screen.getByTestId('quote-total-good')).toHaveTextContent('$465');
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].inspection!.repairs[0].declined).toBe(true);
    await fireEvent.press(screen.getByTestId('quote-addon-r1'));
    expect(screen.getByTestId('quote-total-good')).toHaveTextContent('$505');
  });
});

describe('repair-only quote', () => {
  const job = createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Pat Smith', address: '12 Oak St', phone: '', notes: '' }, { title: '' }, 1000, 'j1');

  beforeEach(async () => {
    resetQuoteTemplates();
    await AsyncStorage.clear();
    await AsyncStorage.setItem(PRICE_SHEET_STORAGE_KEY, JSON.stringify({ ...SHEET, serviceCall: '89' }));
  });

  it('quotes the service call and inspection repairs when there are no spring measurements', async () => {
    const insp: Inspection = { ...EMPTY_INSPECTION(1000), repairs: [{ id: 'r1', label: 'Top fixture', price: '60', taxable: false }] };
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([{ ...job, what: 'Tune-up', inspection: insp }]));
    await renderApp('/quote/j1');
    await settle();
    expect(screen.queryByTestId('quote-blocked')).toBeNull();
    expect(screen.getByTestId('quote-no-templates')).toHaveTextContent(/"Tune-up · Good", "Tune-up · Better" and "Tune-up · Best"/);
    expect(screen.getByTestId('quote-good')).toHaveTextContent(/Repairs/);
    expect(screen.getByTestId('quote-total-good')).toHaveTextContent('$149');
    expect(screen.queryByTestId('quote-better')).toBeNull();
    await fireEvent.press(screen.getByTestId('quote-accept-good'));
    expect(screen.getByTestId('quote-accepted-note')).toHaveTextContent(/Customer picked Repairs/);
    expect(screen.getByTestId('quote-make-invoice')).toHaveTextContent('Make invoice for $149');
  });

  it('still says what is missing on a spring job, and can be quoted by hand', async () => {
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([job]));
    await renderApp('/quote/j1');
    await settle();
    expect(screen.getByTestId('quote-blocked')).toHaveTextContent(/Missing.*add a line below/);
    await fireEvent.press(screen.getByTestId('quote-line-add'));
    const [line] = parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].quoteLines!;
    await fireEvent.changeText(screen.getByTestId(`quote-line-name-${line.id}`), 'Cable replacement');
    await settle();
    expect(screen.queryByTestId('quote-blocked')).toBeNull();
    expect(screen.getByTestId('quote-repairs-only')).toBeTruthy();
    expect(screen.getByTestId('quote-total-good')).toHaveTextContent('$89');
  });

  it('never lists spring measurements for an opener with no templates', async () => {
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([{ ...job, what: 'Opener', quoteLines: [{ id: 'q1', label: 'Opener install', price: '150', taxable: false }] }]));
    await renderApp('/quote/j1');
    await settle();
    expect(screen.queryByTestId('quote-blocked')).toBeNull();
    expect(screen.queryByText(/coils|Spring length/)).toBeNull();
    expect(screen.getByTestId('quote-no-templates')).toHaveTextContent(/No Opener templates in Odoo/);
    expect(screen.getByTestId('quote-good')).toHaveTextContent(/Opener install/);
    expect(screen.getByTestId('quote-total-good')).toHaveTextContent('$239');
    await fireEvent.press(screen.getByTestId('quote-line-remove-q1'));
    expect(screen.getByTestId('quote-total-good')).toHaveTextContent('$89');
    expect(parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY))[0].quoteLines).toBeUndefined();
  });
});
