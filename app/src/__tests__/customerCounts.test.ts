import { fetchCustomerCounts, parseSavedCounts } from '../lib/odooCustomerCounts';

type Call = { model: string; method: string; args: unknown[] };

function fake(kind: 'oca' | 'task', data: Record<string, unknown>) {
  const calls: Call[] = [];
  const call = async (model: string, method: string, args: unknown[]) => {
    calls.push({ model, method, args });
    const key = `${model}.${method}${JSON.stringify(args[0]).includes('is_closed') ? '.closed' : ''}`;
    if (!(key in data)) throw new Error(`no ${key}`);
    return data[key];
  };
  return { calls, c: { call, session: { kind, closedStage: true, fsm: true, fields: [] } } as unknown as Parameters<typeof fetchCustomerCounts>[0] };
}

describe('customer counts from Odoo', () => {
  it('counts Field Service jobs by the location owner and sales orders, rolled up to the parent contact', async () => {
    const { c } = fake('oca', {
      'fsm.order.search_read': [
        { id: 1, location_id: [10, 'Loc A'] },
        { id: 2, location_id: [10, 'Loc A'] },
        { id: 3, location_id: [11, 'Loc B'] },
        { id: 4, location_id: [12, 'Loc C'] },
      ],
      'fsm.order.search_read.closed': [{ id: 2 }],
      'fsm.location.read': [
        { id: 10, owner_id: [100, 'David'], partner_id: false },
        { id: 11, owner_id: false, partner_id: [101, 'Flash house'] },
        { id: 12, owner_id: [102, 'Other'], partner_id: false },
      ],
      'sale.order.search_read': [{ partner_id: [100, 'David'] }, { partner_id: [100, 'David'] }, { partner_id: [101, 'Flash house'] }],
      'res.partner.read': [
        { id: 100, parent_id: false },
        { id: 101, parent_id: [200, 'Flash Garage Doors LLC'] },
        { id: 102, parent_id: false },
      ],
    });
    const out = await fetchCustomerCounts(c);
    expect(out[100]).toEqual({ jobs: 2, open: 1, quotes: 2 });
    expect(out[101]).toEqual({ jobs: 1, open: 1, quotes: 1 });
    expect(out[200]).toEqual({ jobs: 1, open: 1, quotes: 1 });
    expect(out[102]).toEqual({ jobs: 1, open: 1, quotes: 0 });
  });

  it('adds up what each customer still owes from unpaid invoices, house included', async () => {
    const { c } = fake('oca', {
      'fsm.order.search_read': [],
      'sale.order.search_read': [],
      'account.move.search_read': [{ partner_id: [101, 'Flash house'], amount_residual: 100.5 }, { partner_id: [200, 'Flash Garage Doors LLC'], amount_residual: 49.49 }],
      'res.partner.read': [{ id: 101, parent_id: [200, 'Flash Garage Doors LLC'] }, { id: 200, parent_id: false }],
    });
    const out = await fetchCustomerCounts(c);
    expect(out[200]?.owed).toBe(14999);
    expect(out[101]?.owed).toBe(10050);
  });

  it('keeps going when Sales or the contact read is missing', async () => {
    const { c } = fake('task', { 'project.task.search_read': [{ id: 1, partner_id: [5, 'Pat'] }, { id: 2, partner_id: [5, 'Pat'] }] });
    expect(await fetchCustomerCounts(c)).toEqual({ 5: { jobs: 2, open: 2, quotes: 0 } });
  });

  it('reads back a saved list and ignores junk', () => {
    expect(parseSavedCounts('{"7":{"jobs":3,"open":1,"quotes":2},"8":{"jobs":"x"}}')).toEqual({ 7: { jobs: 3, open: 1, quotes: 2 } });
    expect(parseSavedCounts('nope')).toEqual({});
    expect(parseSavedCounts(null)).toEqual({});
  });
});
