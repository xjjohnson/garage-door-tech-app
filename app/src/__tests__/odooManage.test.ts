import { archiveTech, listTechs, saveTech, saveTruck, truckSource, archivePart, listParts, loadQuoteTemplate, saveJobType, savePart, saveQuoteTemplate } from '../lib/odooManage';

type Call = [string, string, unknown[], Record<string, unknown>?];
function fake(answers: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const client = {
    calls,
    session: { kind: 'oca', fields: [] },
    call: async (model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) => {
      calls.push([model, method, args, kwargs]);
      const hit = answers[`${model}.${method}`];
      if (typeof hit === 'function') return (hit as (a: unknown[]) => unknown)(args);
      if (hit !== undefined) return hit;
      if (method === 'fields_get') return { name: {}, instructions: {}, duration: {}, type_id: {}, active: {}, default_code: {}, list_price: {}, type: {}, sale_ok: {}, lst_price: {} };
      return method === 'create' ? 55 : true;
    },
  };
  return client as never as Parameters<typeof saveJobType>[0] & { calls: Call[] };
}

describe('management editing saves straight to Odoo', () => {
  it('creates and updates a job type with its Odoo job type', async () => {
    const c = fake();
    expect(await saveJobType(c, { name: ' Opener ', instructions: 'Check the safety eyes', minutes: 90, typeId: 4 })).toBe(55);
    expect(c.calls.find((x) => x[1] === 'create')![2][0]).toEqual({ name: 'Opener', instructions: 'Check the safety eyes', duration: 1.5, type_id: 4 });
    const c2 = fake();
    await saveJobType(c2, { id: 9, name: 'Opener', instructions: '', minutes: 0 });
    expect(c2.calls.at(-1)).toEqual(['fsm.template', 'write', [[9], { name: 'Opener', instructions: '', duration: 0, type_id: false }], undefined]);
    await expect(saveJobType(c, { name: '  ', instructions: '', minutes: 0 })).rejects.toThrow('name');
  });

  it('skips fields this Odoo does not have', async () => {
    const c = fake({ 'fsm.template.fields_get': { name: {} } });
    await saveJobType(c, { name: 'Gate', instructions: 'x', minutes: 30, typeId: 2 });
    expect(c.calls.find((x) => x[1] === 'create')![2][0]).toEqual({ name: 'Gate' });
  });

  it('saves a quote template: deletes taken-off lines, updates kept ones, adds new ones', async () => {
    const c = fake({
      'sale.order.template.read': [{ name: 'Opener · Good' }],
      'sale.order.template.line.search_read': [
        { id: 1, product_id: [10, 'Opener'], name: 'Opener', product_uom_qty: 1 },
        { id: 2, product_id: [11, 'Labor'], name: 'Labor', product_uom_qty: 2 },
        { id: 3, display_type: 'line_section', name: 'Section' },
      ],
    });
    const before = await loadQuoteTemplate(c, 5);
    expect(before.lines.map((l) => l.id)).toEqual([1, 2]);
    await saveQuoteTemplate(c, { id: 5, name: 'Opener · Good', lines: [{ id: 1, productId: 10, name: 'LiftMaster opener', qty: 1 }, { productId: 12, name: '', qty: 3 }] });
    const write = c.calls.find((x) => x[0] === 'sale.order.template' && x[1] === 'write')!;
    expect(write[2]).toEqual([[5], { name: 'Opener · Good', sale_order_template_line_ids: [[2, 2, false], [1, 1, { product_id: 10, name: 'LiftMaster opener', product_uom_qty: 1 }], [0, 0, { product_id: 12, product_uom_qty: 3 }]] }]);
    await expect(saveQuoteTemplate(c, { name: 'x', lines: [{ productId: 0, name: '', qty: 1 }] })).rejects.toThrow('product');
  });

  it('reads parts with their prices in cents', async () => {
    const c = fake({ 'product.product.search_read': [{ id: 3, name: 'Torsion spring', lst_price: 45.5, default_code: 'TS-1', type: 'consu' }] });
    expect(await listParts(c, 'spring')).toEqual([{ id: 3, name: 'Torsion spring', code: 'TS-1', cents: 4550, service: false }]);
  });

  it('writes a part price on its template, and archives there too', async () => {
    const c = fake({ 'product.product.read': [{ product_tmpl_id: [70, 'Torsion spring'] }] });
    await savePart(c, { id: 3, name: 'Torsion spring', code: 'TS-1', cents: 5000, service: false });
    expect(c.calls.at(-1)).toEqual(['product.template', 'write', [[70], { name: 'Torsion spring', default_code: 'TS-1', list_price: 50 }], undefined]);
    await archivePart(c, 3);
    expect(c.calls.at(-1)?.slice(0, 3)).toEqual(['product.template', 'write', [[70], { active: false }]]);
    await expect(savePart(c, { name: 'x', code: '', cents: -1, service: false })).rejects.toThrow('price');
  });

  it('makes a new part as goods or a service', async () => {
    const c = fake({ 'product.product.search_read': [{ id: 88 }] });
    expect(await savePart(c, { name: 'Roller', code: '', cents: 1200, service: true })).toBe(88);
    expect(c.calls.find((x) => x[1] === 'create')![2][0]).toMatchObject({ name: 'Roller', list_price: 12, type: 'service', sale_ok: true, default_code: false });
  });
});

describe('techs and trucks save straight to Odoo', () => {
  it('lists, saves and archives techs, keeping only fields this Odoo has', async () => {
    const c = fake({ 'fsm.person.fields_get': { name: {}, phone: {}, active: {} }, 'fsm.person.search_read': [{ id: 3, name: 'Sam', phone: '555' }] });
    expect(await listTechs(c)).toEqual([{ id: 3, name: 'Sam', phone: '555', email: '' }]);
    await saveTech(c, { name: ' Sam ', phone: '555', email: 'a@b.c' });
    expect(c.calls.find((x) => x[0] === 'fsm.person' && x[1] === 'create')![2][0]).toEqual({ name: 'Sam', phone: '555' });
    await saveTech(c, { id: 3, name: 'Sam', phone: '', email: '' });
    expect(c.calls.at(-1)![2]).toEqual([[3], { name: 'Sam', phone: false }]);
    await archiveTech(c, 3);
    expect(c.calls.at(-1)).toEqual(['fsm.person', 'write', [[3], { active: false }], undefined]);
    await expect(saveTech(c, { name: ' ', phone: '', email: '' })).rejects.toThrow('name');
  });

  it('saves a truck as a Field Service vehicle, or as an Inventory location without them', async () => {
    const v = fake({ 'fsm.vehicle.fields_get': { name: {}, person_id: {}, inventory_location_id: {} } });
    expect(await truckSource(v)).toBe('vehicle');
    await saveTruck(v, 'vehicle', { name: 'Truck - Sam', personId: 3, locationId: 8 });
    expect(v.calls.find((x) => x[0] === 'fsm.vehicle' && x[1] === 'create')![2][0]).toEqual({ name: 'Truck - Sam', person_id: 3, inventory_location_id: 8 });
    const l = fake({ 'fsm.vehicle.fields_get': {}, 'stock.location.fields_get': { name: {} } });
    expect(await truckSource(l)).toBe('location');
    await saveTruck(l, 'location', { id: 8, name: 'Truck - Sam' });
    expect(l.calls.at(-1)).toEqual(['stock.location', 'write', [[8], { name: 'Truck - Sam' }], undefined]);
    await expect(saveTruck(l, 'none', { name: 'x' })).rejects.toThrow('nowhere');
  });
});
