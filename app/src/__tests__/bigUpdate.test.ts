import { addTyped, EMPTY_TICKET, setTerms, syncTicket } from '../lib/ticket';
import { customerTypeOf, DEFAULT_CUSTOMER_TYPES, setCustomerType, typesFor } from '../lib/customerTypes';
import { DEFAULT_FOLLOW_UP, partWarranties, warrantyText } from '../lib/followups';
import { repairFromPart, repairLines } from '../lib/inspection';
import { Invoice, parseInvoices, trackKey } from '../lib/invoices';
import { writeVisit } from '../lib/odooJobs';
import { linkEquipmentToOrder } from '../lib/odooEquipment';
import { orderPartForJob } from '../lib/odooPurchasing';
import { sendInvoice } from '../lib/odooSales';
import { vehicleVals } from '../lib/odooVehicle';
import { blankPlan, parsePlanJson, plansForType } from '../lib/maintenancePlans';
import { groupVariants, searchItems, toItem, variantOf } from '../lib/priceBook';
import { arrivalText, parseSchedule, reminderText, windowLabel } from '../lib/schedule';

type Call = { model: string; method: string; args: unknown[]; kw?: Record<string, unknown> };
const fake = (answer: (c: Call) => unknown, session: Record<string, unknown> = {}) => {
  const calls: Call[] = [];
  const client = {
    session: { kind: 'oca', fields: [], me: 7, url: 'https://odoo.test', ...session },
    call: jest.fn(async (model: string, method: string, args: unknown[], kw?: Record<string, unknown>) => {
      const c = { model, method, args, kw };
      calls.push(c);
      return answer(c);
    }),
  };
  return { client: client as never, calls };
};

describe('product variants', () => {
  it('reads the attribute values out of the variant name', () => {
    expect(variantOf('Roller Long Stem', 'Roller Long Stem (Nylon, 2 in)')).toBe('Nylon, 2 in');
    expect(variantOf('Roller Long Stem', '[R1] Roller Long Stem (Steel)')).toBe('Steel');
    expect(variantOf('Genie Keypad', 'Genie Keypad')).toBe('');
  });
  it('names a variant in full, groups variants, and finds them by their values', () => {
    const a = toItem({ id: 1, name: 'Roller Long Stem', display_name: 'Roller Long Stem (Nylon, 2 in)', lst_price: 5 }, []);
    const b = toItem({ id: 2, name: 'Roller Long Stem', display_name: 'Roller Long Stem (Steel)', lst_price: 6 }, []);
    const c = toItem({ id: 3, name: 'Genie Keypad', display_name: 'Genie Keypad', lst_price: 100 }, []);
    expect(a).toMatchObject({ name: 'Roller Long Stem (Nylon, 2 in)', baseName: 'Roller Long Stem', variant: 'Nylon, 2 in' });
    expect(c.variant).toBeUndefined();
    expect(groupVariants([a, b, c])).toEqual([{ heading: 'Roller Long Stem' }, { item: a }, { item: b }, { item: c }]);
    expect(searchItems([a, b, c], 'roller nylon').map((i) => i.id)).toEqual([1]);
  });
});

describe('repair from a price-book part', () => {
  it('carries the part, tax and quantity onto the quote line', () => {
    const r = repairFromPart({ id: 9, name: 'Roller (Nylon)', cents: 1999, kind: 'material' }, 4, 1, 0, 'rollers');
    expect(r).toMatchObject({ label: 'Roller (Nylon)', price: '19.99', taxable: true, productId: 9, qty: 4, item: 'rollers' });
    expect(repairLines(undefined, [r])).toEqual([{ label: 'Roller (Nylon)', cents: 7996, taxable: true, qty: 4, productId: 9 }]);
    const svc = repairFromPart({ id: 5, name: 'Visit', cents: 8900, kind: 'service' }, 1, 1, 1);
    expect(svc).toMatchObject({ price: '89', taxable: false });
    expect(svc.qty).toBeUndefined();
  });
});

describe('terms and conditions', () => {
  const answer = (c: Call) => {
    if (c.model === 'product.product' && c.method === 'search') return [9];
    if (c.model === 'res.users' && c.method === 'read') return [{ company_id: [1, 'Ace'] }];
    if (c.model === 'res.company' && c.method === 'read') return [{ terms_type: 'plain', invoice_terms: 'Net 30' }];
    if (c.model === 'sale.order' && c.method === 'create') return 70;
    if (c.model === 'sale.order' && c.method === 'read') return [{ name: 'S00070', note: '<p>Net 30</p>', amount_untaxed: 10, amount_tax: 0, amount_total: 10 }];
    return true;
  };
  const ticket = addTyped(EMPTY_TICKET, { name: 'Part', unitCents: 1000, kind: 'material' }, 'a');

  it('makes a quotation with an empty terms area unless the switch is on', async () => {
    const off = fake(answer);
    await syncTicket(off.client, 5, ticket, '', 1);
    expect(off.calls.find((c) => c.method === 'create' && c.model === 'sale.order')!.args[0]).toMatchObject({ note: false });
    const on = fake(answer);
    await syncTicket(on.client, 5, setTerms(ticket, true), '', 1);
    expect(on.calls.find((c) => c.method === 'create' && c.model === 'sale.order')!.args[0]).toMatchObject({ note: expect.stringContaining('Net 30') });
  });

  it('only touches the note of an existing quotation once the switch has been used', async () => {
    const plain = fake((c) => (c.model === 'sale.order' && c.method === 'read' ? [{ name: 'S1', state: 'draft', amount_untaxed: 10, amount_tax: 0, amount_total: 10 }] : answer(c)));
    await syncTicket(plain.client, 5, { ...ticket, order: { id: 70, name: 'S1' } }, '', 1);
    expect(plain.calls.find((c) => c.method === 'write' && c.model === 'sale.order')!.args[1]).not.toHaveProperty('note');
    const used = fake((c) => (c.model === 'sale.order' && c.method === 'read' ? [{ name: 'S1', state: 'draft', amount_untaxed: 10, amount_tax: 0, amount_total: 10 }] : answer(c)));
    await syncTicket(used.client, 5, { ...setTerms(ticket, false), order: { id: 70, name: 'S1' } }, '', 1);
    expect(used.calls.find((c) => c.method === 'write' && c.model === 'sale.order')!.args[1]).toMatchObject({ note: false });
  });

  it('gives the invoice the terms its quotation has, else an empty narration', async () => {
    const line = [{ label: 'Part', cents: 1000, taxable: true }];
    const withTerms = fake((c) => (c.model === 'sale.order' && c.method === 'read' ? [{ note: '<p>Net 30</p>' }] : c.method === 'create' ? 3 : c.method === 'search_read' ? [] : [{}]));
    await sendInvoice(withTerms.client, 5, line, {}, '', { id: 70, name: 'S00070' }).catch(() => undefined);
    expect(withTerms.calls.find((c) => c.model === 'account.move' && c.method === 'create')!.args[0]).toMatchObject({ narration: '<p>Net 30</p>' });
    const clean = fake((c) => (c.model === 'sale.order' && c.method === 'read' ? [{ note: false }] : c.method === 'create' ? 3 : c.method === 'search_read' ? [] : [{}]));
    await sendInvoice(clean.client, 5, line, {}, '', { id: 70, name: 'S00070' }).catch(() => undefined);
    expect(clean.calls.find((c) => c.model === 'account.move' && c.method === 'create')!.args[0]).toMatchObject({ narration: false });
  });
});

describe('warranty per part', () => {
  const DAY = 86_400_000;
  const created = new Date(2026, 10, 17, 12).getTime();
  const base = {
    id: 'i1', number: '26-11-03', jobId: 'j', customerId: 'c', billTo: 'Pat', address: '1 Oak', tier: 'good', subtotal: 0, tax: 0, total: 0, payments: [], createdAt: created, updatedAt: created, source: 'ticket',
    lines: [
      { label: '3rd Party Op Install', cents: 30000, taxable: false },
      { label: 'Genie Keypad', cents: 10999, taxable: true },
      { label: 'Roller Long Stem (Nylon)', cents: 2000, taxable: true },
    ],
  } as unknown as Invoice;
  const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);

  it('lists every part sold, each following the job unless it has its own length', () => {
    const inv = { ...base, warranty: { partsMonths: 24, laborDays: 30, partMonths: { [trackKey(base.lines[1]!)]: 12 } } } as Invoice;
    const w = partWarranties(inv, DEFAULT_FOLLOW_UP, trackKey);
    expect(w.map((l) => [l.label, l.months, l.part])).toEqual([['3rd Party Op Install', 0, false], ['Genie Keypad', 12, true], ['Roller Long Stem (Nylon)', 24, true]]);
  });

  it('says parts (not springs) when there are no springs, names parts that differ, and counts 30 days to Dec 17', () => {
    const same = { ...base, warranty: { partsMonths: 24, laborDays: 30 } } as Invoice;
    expect(warrantyText(same, DEFAULT_FOLLOW_UP, trackKey, fmt)).toBe(`Warranty: parts until ${fmt(new Date(2028, 10, 17, 12).getTime())}, labor until 2026-12-17.`);
    const mixed = { ...same, warranty: { ...same.warranty, partMonths: { [trackKey(base.lines[1]!)]: 12, [trackKey(base.lines[2]!)]: 0 } } } as Invoice;
    expect(warrantyText(mixed, DEFAULT_FOLLOW_UP, trackKey, fmt)).toBe('Warranty: Genie Keypad until 2027-11-17, labor until 2026-12-17.');
    const springs = { ...same, lines: [{ label: 'Torsion spring pair', cents: 20000, taxable: true }] } as Invoice;
    expect(warrantyText(springs, DEFAULT_FOLLOW_UP, trackKey, fmt)).toContain('springs until');
    expect(created + 30 * DAY).toBe(new Date(2026, 11, 17, 12).getTime());
  });

  it('keeps per-part lengths when invoices are saved and read back', () => {
    const inv = { ...base, warranty: { partsMonths: 24, partMonths: { k: 12, gone: 0 } } } as Invoice;
    expect(parseInvoices(JSON.stringify([inv]))[0]!.warranty).toEqual({ partsMonths: 24, partMonths: { k: 12, gone: 0 } });
  });
});

describe('arrival window', () => {
  const start = new Date(2026, 10, 18, 14).getTime();
  it('shows and texts the window, or the exact time with none', () => {
    expect(windowLabel({ start, windowMinutes: 180 })).toBe('2:00 to 5:00 pm');
    expect(windowLabel({ start })).toBe('2:00 pm');
    expect(arrivalText({ start, windowMinutes: 180 })).toBe('between 2:00 pm and 5:00 pm');
    expect(reminderText({ name: 'Pat Smith', start, windowMinutes: 180 }, 'Ace', start - 3600_000)).toContain('between 2:00 pm and 5:00 pm');
    expect(reminderText({ name: 'Pat Smith', start }, 'Ace', start - 3600_000)).toContain('at 2:00 pm');
  });
  it('is kept when the schedule is saved and read back', () => {
    const a = { id: 'a', start, minutes: 60, name: 'P', address: '', phone: '', what: '', status: 'booked', createdAt: 1, updatedAt: 1, windowMinutes: 180 };
    expect(parseSchedule(JSON.stringify([a]))[0]!.windowMinutes).toBe(180);
  });
  it('goes to Odoo as the earliest and latest request date', async () => {
    const { client, calls } = fake(() => true, { fields: ['scheduled_date_start', 'scheduled_duration', 'request_early', 'request_late'] });
    await writeVisit(client, { model: 'fsm.order', id: 4, name: 'FO4' }, { start, minutes: 90, windowMinutes: 180 });
    const vals = calls[0]!.args[1] as Record<string, string>;
    expect(vals.request_early).toBe(vals.scheduled_date_start);
    expect(Date.parse(`${vals.request_late.replace(' ', 'T')}Z`) - Date.parse(`${vals.request_early.replace(' ', 'T')}Z`)).toBe(180 * 60_000);
    const none = fake(() => true, { fields: ['scheduled_date_start'] });
    await writeVisit(none.client, { model: 'fsm.order', id: 4, name: 'FO4' }, { start, minutes: 90, windowMinutes: 180 });
    expect(none.calls[0]!.args[1]).not.toHaveProperty('request_early');
  });
});

describe('vehicle on the order', () => {
  it("is the tech's own truck, only when there is exactly one", async () => {
    const f = ['vehicle_id'];
    expect(await vehicleVals(fake(() => [12], { fields: f }).client, 7)).toEqual({ vehicle_id: 12 });
    expect(await vehicleVals(fake(() => [12, 13], { fields: f }).client, 7)).toEqual({});
    expect(await vehicleVals(fake(() => [], { fields: f }).client, 7)).toEqual({});
    expect(await vehicleVals(fake(() => [12], { fields: [] }).client, 7)).toEqual({});
    expect(await vehicleVals(fake(() => [12], { fields: f }).client, undefined)).toEqual({});
  });
});

describe('customer types', () => {
  it('start as Homeowner and Commercial unless the owner set their own', () => {
    expect(typesFor({})).toEqual(DEFAULT_CUSTOMER_TYPES);
    expect(typesFor({ customerTypes: ['Property manager', 'Homeowner'] })).toEqual(['Property manager', 'Homeowner']);
  });
  it('puts the type tag on the contact and takes the other types off, leaving other tags alone', async () => {
    const { client, calls } = fake((c) => {
      if (c.model === 'res.partner.category' && c.method === 'search_read') return [{ id: 1, name: 'Homeowner' }, { id: 2, name: 'Commercial' }];
      return true;
    });
    await setCustomerType(client, 50, 'Commercial', DEFAULT_CUSTOMER_TYPES);
    const w = calls.find((c) => c.model === 'res.partner' && c.method === 'write')!;
    expect(w.args).toEqual([[50], { category_id: [[3, 1], [4, 2]] }]);
  });
  it('reads the type back from the contact', async () => {
    const { client } = fake((c) => (c.model === 'res.partner' ? [{ category_id: [2, 9] }] : [{ id: 1, name: 'Homeowner' }, { id: 2, name: 'Commercial' }]));
    expect(await customerTypeOf(client, 50, DEFAULT_CUSTOMER_TYPES)).toBe('Commercial');
  });
  it('limits maintenance plans to their types; older plans map onto the two standard types', () => {
    const everyone = { ...blankPlan(), name: 'A', types: [] as string[] };
    const homes = { ...blankPlan(), name: 'B', types: ['Homeowner'] };
    const old = { ...blankPlan(), ...parsePlanJson(JSON.stringify({ audience: 'commercial' })), name: 'C' };
    expect(old.types).toEqual(['Commercial']);
    expect(plansForType([everyone, homes, old], 'Homeowner').map((p) => p.name)).toEqual(['A', 'B']);
    expect(plansForType([everyone, homes, old], 'Commercial').map((p) => p.name)).toEqual(['A', 'C']);
    expect(plansForType([everyone, homes, old], undefined)).toHaveLength(3);
  });
});

describe('links on the Field Service order', () => {
  it('links equipment to the order only when the order has that field', async () => {
    const yes = fake((c) => (c.method === 'fields_get' ? { equipment_ids: { type: 'many2many' } } : true));
    await linkEquipmentToOrder(yes.client, 4, [8, 9]);
    expect(yes.calls.find((c) => c.method === 'write')!.args).toEqual([[4], { equipment_ids: [[4, 8], [4, 9]] }]);
    const no = fake((c) => (c.method === 'fields_get' ? {} : true));
    await linkEquipmentToOrder(no.client, 4, [8]);
    expect(no.calls.some((c) => c.method === 'write')).toBe(false);
  });
  it('orders a part for the job as a draft purchase order linked to it, or says the part has no vendor', async () => {
    const withVendor = fake((c) => {
      if (c.model === 'product.product') return [{ product_tmpl_id: [3, 'Keypad'] }];
      if (c.model === 'product.supplierinfo') return [{ id: 1, product_tmpl_id: [3, 'Keypad'], partner_id: [40, 'Acme'], price: 55, min_qty: 1, product_code: '', delay: 2 }];
      if (c.model === 'purchase.order' && c.method === 'fields_get') return { fsm_order_id: { type: 'many2one' } };
      if (c.model === 'purchase.order' && c.method === 'search') return [];
      if (c.model === 'purchase.order' && c.method === 'create') return 90;
      if (c.model === 'purchase.order' && c.method === 'read') return [{ name: 'P00090' }];
      return true;
    });
    const po = await orderPartForJob(withVendor.client, { productId: 1, name: 'Genie Keypad', qty: 2 }, { id: 4, name: 'FO4' });
    expect(po).toEqual({ id: 90, name: 'P00090', reused: false });
    expect(withVendor.calls.find((c) => c.model === 'purchase.order' && c.method === 'create')!.args[0]).toMatchObject({ partner_id: 40, origin: 'Job FO4', fsm_order_id: 4 });
    const none = fake((c) => (c.model === 'product.product' ? [{ product_tmpl_id: [3, 'Keypad'] }] : []));
    await expect(orderPartForJob(none.client, { productId: 1, name: 'Genie Keypad', qty: 1 }, { id: 4, name: 'FO4' })).rejects.toThrow(/no vendor/);
  });
});
