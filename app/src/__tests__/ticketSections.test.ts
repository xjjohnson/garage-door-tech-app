import { sendInvoice } from '../lib/odooSales';
import { withOdoo } from '../lib/invoices';
import { addItem, addText, addTyped, EMPTY_TICKET, setPlan, signedNow, syncTicket, Ticket, TicketPlan, toInvoiceLines } from '../lib/ticket';
import { canMove, groupIntoLaborAndParts, moveLine, moveToSection, orderLines, renameLine, sectionOf, sectionTotals, signKey } from '../lib/ticketSections';

const SPRING = { id: 1, name: 'Spring', code: '', cents: 10000, kind: 'material' as const, category: [], description: '' };
const LABOR = { id: 2, name: 'Labor', code: '', cents: 5000, kind: 'service' as const, category: [], description: '' };
const PLAN: TicketPlan = { id: 7, name: 'Gold', description: '', everyMonths: 12, visitsPerYear: 1, daysAhead: 30, termMonths: 12, renews: false, priceCents: 9900 };

/** Option A: spring + labor. Option B: spring. */
function sectioned(): Ticket {
  let t = addText(EMPTY_TICKET, 'section', 'Option A', 'sA');
  t = addItem(t, SPRING, 'a1', 'sA');
  t = addItem(t, LABOR, 'a2', 'sA');
  t = addText(t, 'section', 'Option B', 'sB');
  t = addItem(t, SPRING, 'b1', 'sB');
  return t;
}
const ids = (t: Ticket) => t.lines.map((l) => l.id);

describe('ordered ticket list', () => {
  it('adds to the end of the named section, or the end of the last one', () => {
    let t = sectioned();
    t = addTyped(t, { name: 'Haul away', unitCents: 2500, kind: 'service' }, 'x', 'sA');
    expect(ids(t)).toEqual(['sA', 'a1', 'a2', 'x', 'sB', 'b1']);
    t = addTyped(t, { name: 'Extra', unitCents: 100, kind: 'service' }, 'y');
    expect(ids(t)).toEqual(['sA', 'a1', 'a2', 'x', 'sB', 'b1', 'y']);
    t = addText(t, 'note', 'Above', 'n', null);
    expect(ids(t)[0]).toBe('n');
  });

  it('merges the same product only inside the same section', () => {
    let t = sectioned();
    t = addItem(t, SPRING, 'a3', 'sA');
    expect(t.lines.find((l) => l.id === 'a1')!.qty).toBe(2);
    expect(t.lines.find((l) => l.id === 'b1')!.qty).toBe(1);
    expect(t.lines.filter((l) => l.productId === 1)).toHaveLength(2);
  });

  it('moves a line up and down, crossing headings', () => {
    let t = sectioned();
    t = moveLine(t, 'a2', -1);
    expect(ids(t)).toEqual(['sA', 'a2', 'a1', 'sB', 'b1']);
    t = moveLine(t, 'a1', 1);
    expect(ids(t)).toEqual(['sA', 'a2', 'sB', 'a1', 'b1']);
    expect(sectionOf(t.lines, 'a1')).toBe('sB');
    expect(canMove(t, 'sA', -1)).toBe(false);
  });

  it('moves a line to another section, or above the first heading', () => {
    let t = moveToSection(sectioned(), 'a1', 'sB');
    expect(ids(t)).toEqual(['sA', 'a2', 'sB', 'b1', 'a1']);
    t = moveToSection(t, 'a2', null);
    expect(ids(t)).toEqual(['a2', 'sA', 'sB', 'b1', 'a1']);
  });

  it('moves a heading with its lines', () => {
    const t = moveLine(sectioned(), 'sB', -1);
    expect(ids(t)).toEqual(['sB', 'b1', 'sA', 'a1', 'a2']);
    expect(ids(moveLine(t, 'sB', 1))).toEqual(['sA', 'a1', 'a2', 'sB', 'b1']);
  });

  it('keeps a deleted heading\'s lines, which fall into the section above', () => {
    const t = { ...sectioned(), lines: sectioned().lines.filter((l) => l.id !== 'sB') };
    expect(sectionOf(t.lines, 'b1')).toBe('sA');
  });

  it('renames a heading, ignoring blank text', () => {
    expect(renameLine(sectioned(), 'sA', ' Good ').lines[0].name).toBe('Good');
    expect(renameLine(sectioned(), 'sA', '  ').lines[0].name).toBe('Option A');
  });

  it('adds up each section', () => {
    const totals = sectionTotals(sectioned().lines);
    expect(totals.get('sA')).toBe(15000);
    expect(totals.get('sB')).toBe(10000);
  });

  it('keeps the plan fee last and out of reach', () => {
    let t = setPlan(sectioned(), PLAN);
    t = addTyped(t, { name: 'Later', unitCents: 100, kind: 'service' }, 'z');
    expect(ids(t).slice(-2)).toEqual(['z', 'plan-fee']);
    expect(canMove(t, 'plan-fee', -1)).toBe(false);
    expect(canMove(t, 'z', 1)).toBe(false);
    expect(moveToSection(t, 'plan-fee', 'sA')).toBe(t);
    const old: Ticket = { lines: [{ id: 'plan-fee', name: 'fee', qty: 1, unitCents: 1, kind: 'service', planFee: true }, { id: 'q', name: 'q', qty: 1, unitCents: 1, kind: 'service' }] };
    expect(orderLines(old.lines).map((l) => l.id)).toEqual(['q', 'plan-fee']);
  });

  it('groups a flat ticket into Labor and Parts, notes staying under their line', () => {
    let t = addItem(addItem(EMPTY_TICKET, SPRING, 'p1'), LABOR, 'l1');
    t = addText(t, 'note', 'about the labor', 'n1');
    t = addItem(t, { ...SPRING, id: 3, name: 'Cable' }, 'p2');
    let n = 0;
    const g = groupIntoLaborAndParts(t, () => `h${++n}`);
    expect(g.lines.map((l) => `${l.id}:${l.name}`)).toEqual(['h1:Labor', 'l1:Labor', 'n1:about the labor', 'h2:Parts', 'p1:Spring', 'p2:Cable']);
    expect(groupIntoLaborAndParts(g, () => 'zz')).toBe(g);
  });
});

describe('signature after moves', () => {
  it('does not change when lines move, but does when something is added, repriced or reworded', () => {
    const t = sectioned();
    const key = signKey(t);
    expect(signKey(moveLine(t, 'a2', -1))).toBe(key);
    expect(signKey(moveToSection(t, 'a1', 'sB'))).toBe(key);
    expect(signKey(moveLine(t, 'sB', -1))).toBe(key);
    expect(signKey(addItem(t, LABOR, 'q', 'sB'))).not.toBe(key);
    expect(signKey({ ...t, lines: t.lines.map((l) => (l.id === 'a1' ? { ...l, unitCents: 1 } : l)) })).not.toBe(key);
    expect(signKey(renameLine(t, 'sA', 'Other'))).not.toBe(key);
  });

  it('still honours a signature made before the order-free key', () => {
    const t = sectioned();
    const legacy = t.lines.map((l) => (l.kind === 'section' ? `${l.kind}:${l.name}` : `${l.productId ?? ''}:${l.name}:${l.qty}:${l.unitCents}`)).join('|');
    expect(signedNow({ ...t, signed: { id: 's', by: 'M', at: 1, key: legacy } })).toBeDefined();
    expect(signedNow({ ...t, signed: { id: 's', by: 'M', at: 1, key: signKey(moveLine(t, 'a2', -1)) } })).toBeDefined();
    expect(signedNow({ ...t, signed: { id: 's', by: 'M', at: 1, key: 'old' } })).toBeUndefined();
  });
});

describe('quotation layout', () => {
  const run = async (t: Ticket, auto?: { plan?: string; payments?: string }) => {
    const calls: { method: string; args: unknown[] }[] = [];
    const client = {
      call: jest.fn(async (model: string, method: string, args: unknown[]) => {
        calls.push({ method, args });
        if (model === 'product.product' && method === 'search') return [9];
        if (model === 'sale.order' && method === 'create') return 71;
        if (model === 'sale.order' && method === 'read') return [{ name: 'S00071', state: 'draft', amount_untaxed: 100, amount_tax: 0, amount_total: 100 }];
        return true;
      }),
    };
    await syncTicket(client as never, 5, t, '', 1, undefined, auto);
    return (calls.find((c) => c.method === 'create')!.args[0] as { order_line: [number, number, Record<string, unknown>][] }).order_line.map((l) => l[2]);
  };
  const label = (l: Record<string, unknown>) => `${l.display_type ?? 'line'}:${l.name}`;

  it('writes the lines in ticket order, with automatic headings for the plan and the payments', async () => {
    const t: Ticket = { ...setPlan(sectioned(), PLAN), deposits: [{ id: 'd', method: 'cash', amount: 5000, at: 0, reference: '' }] };
    const out = (await run(t)).map(label);
    expect(out.slice(0, 5)).toEqual(['line_section:Option A', 'line:Spring', 'line:Labor', 'line_section:Option B', 'line:Spring']);
    expect(out[5]).toBe('line_section:Maintenance plan');
    expect(out[6]).toMatch(/^line:Gold plan/);
    expect(out[7]).toBe('line_section:Payments and plan');
    expect(out[8]).toMatch(/^line_note:Maintenance plan: Gold/);
    expect(out[9]).toMatch(/^line_note:Deposit received/);
  });

  it('uses the wording set in Management', async () => {
    const t: Ticket = { ...setPlan(sectioned(), PLAN), deposits: [{ id: 'd', method: 'cash', amount: 5000, at: 0, reference: '' }] };
    const out = (await run(t, { plan: 'Club membership', payments: '  Money  ' })).map(label);
    expect(out).toContain('line_section:Club membership');
    expect(out).toContain('line_section:Money');
  });

  it('adds no automatic headings to a ticket without sections', async () => {
    const t: Ticket = { ...setPlan(addItem(EMPTY_TICKET, SPRING, 'a1'), PLAN), deposits: [{ id: 'd', method: 'cash', amount: 5000, at: 0, reference: '' }] };
    expect((await run(t)).filter((l) => l.display_type === 'line_section')).toHaveLength(0);
  });
});

describe('sections on the invoice', () => {
  it('builds the invoice lines in estimate order, with headings and notes, and the plan heading', () => {
    let t = setPlan(addText(sectioned(), 'note', 'Both come with a lifetime handle', 'n1', 'sA'), PLAN);
    t = { ...t, deposits: [{ id: 'd', method: 'cash', amount: 5000, at: 0, reference: '' }] };
    const out = toInvoiceLines(t, { plan: 'Club' });
    expect(out.map((l) => `${l.display ?? 'line'}:${l.label}`)).toEqual([
      'section:Option A', 'line:Spring', 'line:Labor', 'note:Both come with a lifetime handle', 'section:Option B', 'line:Spring', 'section:Club', 'line:Gold plan (1 year)',
    ]);
  });

  it('leaves a flat ticket as it was', () => {
    const t = addItem(EMPTY_TICKET, SPRING, 'a');
    expect(toInvoiceLines(t).map((l) => l.display)).toEqual([undefined]);
  });

  it('writes headings to the Odoo invoice and ties only the priced lines to the order', async () => {
    const calls: { model: string; method: string; args: unknown[] }[] = [];
    const client = {
      call: jest.fn(async (model: string, method: string, args: unknown[]) => {
        calls.push({ model, method, args });
        if (model === 'sale.order.line') return [{ id: 801 }, { id: 802 }, { id: 803 }];
        if (model === 'account.move' && method === 'create') return 900;
        if (model === 'account.move' && method === 'read') return [{ name: 'INV/1', amount_total: 1, amount_residual: 1, payment_state: 'not_paid', invoice_line_ids: [1, 2, 3] }];
        if (model === 'account.move.line') return [
          { id: 1, name: 'Option A', display_type: 'line_section', sequence: 1 },
          { id: 2, name: 'Spring', quantity: 1, price_subtotal: 100, display_type: 'product', sequence: 2 },
          { id: 3, name: 'Both are new', display_type: 'line_note', sequence: 3 },
        ];
        return true;
      }),
    };
    const lines = toInvoiceLines(sectioned());
    const state = await sendInvoice(client as never, 5, lines, {}, '', { id: 71, name: 'S71' });
    const move = (calls.find((c) => c.model === 'account.move' && c.method === 'create')!.args[0] as { invoice_line_ids: [number, number, Record<string, unknown>][] }).invoice_line_ids.map((l) => l[2]);
    expect(move.map((v) => v.display_type ?? 'line')).toEqual(['line_section', 'line', 'line', 'line_section', 'line']);
    expect(move.filter((v) => v.sale_line_ids).map((v) => v.sale_line_ids)).toEqual([[[6, 0, [801]]], [[6, 0, [802]]], [[6, 0, [803]]]]);
    expect(state.lines!.map((l) => l.display ?? 'line')).toEqual(['section', 'line', 'note']);
    const inv = withOdoo({ lines: [], subtotal: 0, tax: 0, total: 0 } as never, state);
    expect(inv.lines.map((l) => l.display ?? 'line')).toEqual(['section', 'line', 'note']);
  });
});
