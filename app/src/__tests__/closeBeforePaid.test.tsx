import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from '@testing-library/react-native';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { createJob, JOBS_STORAGE_KEY, parseJobs } from '../lib/jobs';
import { fetchOpenOrders, ticketFromOrder } from '../lib/odooOpenOrders';
import { currentTotals, parseTicket, syncTicket } from '../lib/ticket';
import { renderApp } from '../testing/renderApp';

type Call = { model: string; method: string; args: unknown[] };

function fakeOdoo(state = 'sale') {
  const calls: Call[] = [];
  const client = {
    call: async (model: string, method: string, args: unknown[] = []) => {
      calls.push({ model, method, args });
      if (model === 'sale.order' && method === 'search_read') return [{ id: 7, name: 'S00007', date_order: '2026-11-10 12:00:00', amount_total: 1143.24, state, client_order_ref: 'Springs · 912 Rockmoor' }];
      if (model === 'sale.order' && method === 'read') return [{ id: 7, name: 'S00007', state, client_order_ref: 'Springs · 912 Rockmoor', amount_untaxed: 1000, amount_tax: 143.24, amount_total: 1143.24 }];
      if (model === 'sale.order.line') return [
        { id: 1, name: '[RLS] Roller Long Stem\nsteel', product_id: [11, 'Roller'], product_uom_qty: 12, price_unit: 10, discount: 10 },
        { id: 2, name: 'Labor', product_id: [12, 'Labor'], product_uom_qty: 1, price_unit: 100, discount: 0 },
      ];
      if (model === 'product.product') return [{ id: 11, type: 'consu' }, { id: 12, type: 'service' }];
      return [];
    },
  };
  return { client, calls };
}

describe('linking an open sales order', () => {
  it('lists a customer\'s unfinished orders', async () => {
    const { client, calls } = fakeOdoo('draft');
    const rows = await fetchOpenOrders(client as never, 5);
    expect(rows).toEqual([expect.objectContaining({ id: 7, name: 'S00007', status: 'Waiting for approval', total: 114324, ref: 'Springs · 912 Rockmoor' })]);
    expect(JSON.stringify(calls[0].args)).toContain('invoiced');
  });

  it('turns the order into a ticket tied to it, with Odoo\'s totals', async () => {
    const { client } = fakeOdoo();
    let n = 0;
    const t = await ticketFromOrder(client as never, { id: 7, name: 'S00007' }, 100, () => `l${++n}`);
    expect(t.order).toEqual({ id: 7, name: 'S00007' });
    expect(t.linked).toBe(true);
    expect(t.ref).toBe('Springs · 912 Rockmoor');
    expect(t.lines).toEqual([
      { id: 'l1', name: 'Roller Long Stem', qty: 12, unitCents: 900, kind: 'material', productId: 11 },
      { id: 'l2', name: 'Labor', qty: 1, unitCents: 10000, kind: 'service', productId: 12 },
    ]);
    expect(currentTotals(t)?.total).toBe(114324);
    expect(parseTicket(JSON.parse(JSON.stringify(t)))?.linked).toBe(true);
  });

  it('leaves an approved linked order alone when syncing, instead of making a second quotation', async () => {
    const { client, calls } = fakeOdoo('sale');
    const t = await ticketFromOrder(client as never, { id: 7, name: 'S00007' }, 100);
    calls.length = 0;
    const r = await syncTicket(client as never, 5, t, t.ref ?? '', 200);
    expect(r.order.id).toBe(7);
    expect(calls.some((c) => c.method === 'create' || c.method === 'write')).toBe(false);
  });
});

describe('Work done without payment', () => {
  it('closes the job and takes it off Home even with a ticket and no invoice', async () => {
    const j = createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Flash Garage Doors', address: '912 Rockmoor', phone: '', notes: '' }, { title: '' }, 1000, 'j1');
    const saved = { ...j, steps: { onMyWayAt: 1, arrivedAt: 2 }, ticket: { lines: [{ id: 'a', name: 'Roller', qty: 1, unitCents: 1000, kind: 'material' }] } };
    await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify([saved]));
    await renderApp('/job/j1');
    await fireEvent.press(await screen.findByTestId('job-step-work'));
    const [after] = parseJobs(await AsyncStorage.getItem(JOBS_STORAGE_KEY));
    expect(after.status).toBe('done');
    expect(after.steps?.workDoneAt).toBeGreaterThan(0);
  });
});
