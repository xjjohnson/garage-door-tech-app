import { addItem, addText, addTyped, EMPTY_TICKET, setPlan, signedNow, syncTicket, Ticket, TicketLine, TicketPlan } from '../lib/ticket';
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
