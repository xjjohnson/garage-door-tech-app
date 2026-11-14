import { fireEvent, render, screen } from '@testing-library/react-native';
import { DEFAULT_DISCOUNTS, discountText, parseDiscount, parseDiscounts, parseDollars, parsePct, presetsFor } from '../lib/discounts';
import { DiscountPanel } from '../components/DiscountPanel';
import { EMPTY_BUSINESS, parseBusiness } from '../lib/invoices';
import { lineValues } from '../lib/odooSales';
import { sameBusiness } from '../lib/odooSettings';
import * as settingsSync from '../lib/settingsSync';
import { addItem, currentTotals, EMPTY_TICKET, estimateTotals, linesKey, parseTicket, setDiscount, syncTicket, toQuoteLines } from '../lib/ticket';
import { DiscountsTab } from '../screens/DiscountsTab';

let mockBiz = { ...EMPTY_BUSINESS, name: 'Johnsons' } as typeof EMPTY_BUSINESS;
const mockSetBusiness = jest.fn((fn: (b: typeof mockBiz) => typeof mockBiz) => {
  mockBiz = fn(mockBiz);
});
jest.mock('../lib/useInvoices', () => ({ useInvoices: () => ({ business: mockBiz, setBusiness: mockSetBusiness }) }));

const OPENER = { id: 1, name: 'Opener', code: '', cents: 20000, kind: 'material' as const, category: [], description: '' };
const LABOR = { id: 2, name: 'Labor', code: '', cents: 10000, kind: 'service' as const, category: [], description: '' };
const base = addItem(addItem(EMPTY_TICKET, OPENER, 'a'), LABOR, 'b');

describe('discount values', () => {
  it('reads typed percents and dollars', () => {
    expect(parsePct('10%')).toBe(10);
    expect(parsePct('7.5')).toBe(7.5);
    expect(parsePct('0')).toBeUndefined();
    expect(parsePct('101')).toBeUndefined();
    expect(parsePct('')).toBeUndefined();
    expect(parseDollars('$12.50')).toBe(1250);
    expect(parseDollars('-5')).toBeUndefined();
    expect(parseDollars('abc')).toBeUndefined();
  });

  it('says it plainly', () => {
    expect(discountText({ label: 'Senior', pct: 10 })).toBe('Senior, 10% off');
    expect(discountText({ label: '', cents: 2500 })).toBe('$25 off');
    expect(discountText({ label: '$25 off', cents: 2500 })).toBe('$25 off');
    expect(parseDiscount({ label: 'x', pct: 150 })).toBeUndefined();
    expect(parseDiscounts([{ label: 'A', pct: 5 }, { label: '', pct: 5 }, { label: 'B' }])).toEqual([{ label: 'A', pct: 5 }]);
  });

  it('offers the standard list until the owner saves one (an empty list is a choice)', () => {
    expect(presetsFor(undefined)).toEqual(DEFAULT_DISCOUNTS);
    expect(presetsFor([])).toEqual([]);
    expect(parseBusiness({ discounts: [{ label: 'Vet', pct: 15 }] }).discounts).toEqual([{ label: 'Vet', pct: 15 }]);
    expect(parseBusiness({}).discounts).toBeUndefined();
    expect(sameBusiness({ ...EMPTY_BUSINESS, discounts: [{ label: 'A', pct: 5 }] }, { ...EMPTY_BUSINESS, discounts: [{ label: 'A', pct: 5 }] })).toBe(true);
    expect(sameBusiness({ ...EMPTY_BUSINESS, discounts: [{ label: 'A', pct: 5 }] }, EMPTY_BUSINESS)).toBe(false);
  });
});

describe('discount on the ticket', () => {
  it('a percent goes on every line as the Odoo line discount', () => {
    const t = setDiscount(base, { label: 'Senior', pct: 10 });
    expect(toQuoteLines(t).every((l) => l.discountPct === 10)).toBe(true);
    const vals = lineValues(toQuoteLines(t), {}, () => 9, 'product_uom_qty');
    expect(vals.map((v) => v.discount)).toEqual([10, 10]);
    expect(vals[0].price_unit).toBe(200);
  });

  it('dollars off is one negative untaxed Discount line', () => {
    const t = setDiscount(base, { label: '$25 off', cents: 2500 });
    const lines = toQuoteLines(t);
    expect(lines).toHaveLength(3);
    expect(lines[2]).toEqual({ label: 'Discount: $25 off', cents: -2500, taxable: false });
    const vals = lineValues(lines, {}, () => 9, 'product_uom_qty');
    expect(vals[2]).toEqual({ product_id: 9, name: 'Discount: $25 off', product_uom_qty: 1, price_unit: -25 });
  });

  it('takes it off again, and changes the stale-totals key', () => {
    const t = setDiscount(base, { label: '', pct: 10 });
    expect(linesKey(t.lines, t.discount)).not.toBe(linesKey(base.lines));
    expect(setDiscount(t, undefined).discount).toBeUndefined();
    expect(toQuoteLines(setDiscount(t, undefined)).some((l) => l.discountPct)).toBe(false);
    const withTotals = { ...t, totals: { untaxed: 1, tax: 0, total: 1, key: linesKey(t.lines, t.discount), at: 1 } };
    expect(currentTotals(withTotals)).toBeDefined();
    expect(currentTotals(setDiscount(withTotals, { label: '', pct: 20 }))).toBeUndefined();
  });

  it("the phone's offline guess: percent lowers taxed parts, dollars leaves tax alone", () => {
    expect(estimateTotals(base, '10')).toEqual({ untaxed: 30000, tax: 2000, total: 32000 });
    expect(estimateTotals(setDiscount(base, { label: '', pct: 10 }), '10')).toEqual({ untaxed: 27000, tax: 1800, total: 28800 });
    expect(estimateTotals(setDiscount(base, { label: '', cents: 2500 }), '10')).toEqual({ untaxed: 27500, tax: 2000, total: 29500 });
  });

  it('survives being saved and read back', () => {
    const t = setDiscount(base, { label: 'Military', pct: 10 });
    expect(parseTicket(JSON.parse(JSON.stringify(t)))?.discount).toEqual({ label: 'Military', pct: 10 });
    expect(parseTicket({ lines: [], discount: { pct: -3 } })?.discount).toBeUndefined();
  });

  it('writes the discount to the quotation in Odoo and keys the totals to it', async () => {
    const calls: { method: string; args: unknown[] }[] = [];
    const client = {
      call: jest.fn(async (model: string, method: string, args: unknown[]) => {
        calls.push({ method, args });
        if (model === 'product.product' && method === 'search') return [9];
        if (model === 'sale.order' && method === 'create') return 70;
        if (model === 'sale.order' && method === 'read') return [{ name: 'S00070', state: 'draft', amount_untaxed: 270, amount_tax: 18, amount_total: 288 }];
        return true;
      }),
    };
    const t = setDiscount(base, { label: 'Senior', pct: 10 });
    const r = await syncTicket(client as never, 5, t, '', 1);
    const lines = (calls.find((c) => c.method === 'create')!.args[0] as { order_line: [number, number, Record<string, unknown>][] }).order_line;
    expect(lines.map((l) => l[2].discount)).toEqual([10, 10]);
    expect(r.totals.key).toBe(linesKey(t.lines, t.discount));
    expect(currentTotals({ ...t, totals: r.totals })).toBeDefined();

    calls.length = 0;
    await syncTicket(client as never, 5, setDiscount(base, { label: '$25 off', cents: 2500 }), '', 2);
    const dollars = (calls.find((c) => c.method === 'create')!.args[0] as { order_line: [number, number, Record<string, unknown>][] }).order_line;
    expect(dollars[2][2]).toEqual({ product_id: 9, name: 'Discount: $25 off', product_uom_qty: 1, price_unit: -25 });
  });
});

describe('discount screens', () => {
  it('the ticket panel picks a preset, takes a custom one, and removes it', async () => {
    const onChange = jest.fn();
    const { rerender } = await render(<DiscountPanel presets={DEFAULT_DISCOUNTS} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('ticket-discount-open'));
    await fireEvent.press(screen.getByTestId('ticket-discount-preset-0'));
    expect(onChange).toHaveBeenLastCalledWith({ label: 'Senior', pct: 10 });
    await rerender(<DiscountPanel presets={DEFAULT_DISCOUNTS} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('ticket-discount-open'));
    expect(screen.getByTestId('ticket-discount-apply').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('ticket-discount-kind-cents'));
    await fireEvent.changeText(screen.getByTestId('ticket-discount-custom'), '40');
    await fireEvent.press(screen.getByTestId('ticket-discount-apply'));
    expect(onChange).toHaveBeenLastCalledWith({ label: '', cents: 4000 });
    await rerender(<DiscountPanel discount={{ label: 'Senior', pct: 10 }} presets={DEFAULT_DISCOUNTS} onChange={onChange} />);
    expect(screen.getByTestId('ticket-discount-current').props.children).toBe('Senior, 10% off');
    await fireEvent.press(screen.getByTestId('ticket-discount-remove'));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('Management > Discounts edits the list and saves it with the business details', async () => {
    mockBiz = { ...EMPTY_BUSINESS, name: 'Johnsons' };
    const queue = jest.spyOn(settingsSync, 'queueBusiness').mockImplementation(() => undefined);
    await render(<DiscountsTab canEdit />);
    expect(screen.getByTestId('manage-discount-label-0').props.value).toBe('Senior');
    expect(screen.getByTestId('manage-discount-amount-2').props.value).toBe('25');
    await fireEvent.press(screen.getByTestId('manage-discount-remove-1'));
    await fireEvent.press(screen.getByTestId('manage-discount-add'));
    await fireEvent.changeText(screen.getByTestId('manage-discount-label-2'), 'Vet');
    await fireEvent.changeText(screen.getByTestId('manage-discount-amount-2'), '15');
    await fireEvent.press(screen.getByTestId('manage-discounts-save'));
    expect(queue).toHaveBeenCalledWith(expect.objectContaining({ discounts: [{ label: 'Senior', pct: 10 }, { label: '$25 off', cents: 2500 }, { label: 'Vet', pct: 15 }] }));
  });

  it('leaves out a discount with no name or a bad amount, and locks the list for others', async () => {
    mockBiz = { ...EMPTY_BUSINESS, discounts: [{ label: 'Senior', pct: 10 }] };
    const queue = jest.spyOn(settingsSync, 'queueBusiness').mockImplementation(() => undefined);
    const { rerender } = await render(<DiscountsTab canEdit />);
    await fireEvent.press(screen.getByTestId('manage-discount-add'));
    await fireEvent.changeText(screen.getByTestId('manage-discount-amount-1'), '150');
    expect(screen.getByTestId('manage-discounts-bad')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('manage-discounts-save'));
    expect(queue).toHaveBeenLastCalledWith(expect.objectContaining({ discounts: [{ label: 'Senior', pct: 10 }] }));
    await rerender(<DiscountsTab canEdit={false} />);
    expect(screen.queryByTestId('manage-discounts-save')).toBeNull();
  });
});
