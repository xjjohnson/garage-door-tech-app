import { Customer } from '../lib/customers';
import { planCustomerDelete, resolveGone, runCustomerDelete } from '../lib/customerDelete';
import { Job } from '../lib/jobs';

const cust = (f: Partial<Customer>): Customer => ({ id: 'c1', name: 'john smith', phone: '', email: '', address: '', notes: '', createdAt: 1, updatedAt: 1, ...f });
const job = (f: Partial<Job>): Job => ({ id: 'j', savedAt: 1, updatedAt: 1, status: 'open', summaryTitle: '', summaryDetail: '', mode: 'door', customer: '', phone: '', address: '', notes: '', ...f }) as unknown as Job;
const client = (counts: Record<string, number>, failUnlink = false) => {
  const calls: string[] = [];
  return {
    calls,
    call: async (model: string, method: string) => {
      calls.push(`${model}.${method}`);
      if (method === 'search_count') return counts[model] ?? 0;
      if (method === 'unlink' && failUnlink) throw new Error('linked');
      return true;
    },
  };
};

describe('customer delete', () => {
  it('archives when Odoo has invoices', async () => {
    const p = await planCustomerDelete(client({ 'account.move': 2 }), cust({ odooId: 5 }), [], []);
    expect(p.kind).toBe('archive');
    expect(p.message).toContain('2 invoices');
  });
  it('deletes when Odoo has nothing, falling back to archive if refused', async () => {
    const c = cust({ odooId: 5 });
    expect((await planCustomerDelete(client({}), c, [], [])).kind).toBe('delete');
    const cl = client({}, true);
    expect(await runCustomerDelete(cl, c, 'delete')).toBe('archived');
    expect(cl.calls).toEqual(['res.partner.unlink', 'res.partner.write']);
  });
  it('phone-only customer just deletes', async () => {
    expect((await planCustomerDelete(null, cust({}), [], [])).kind).toBe('delete');
  });
  it('signed out with an Odoo customer is blocked', async () => {
    expect((await planCustomerDelete(null, cust({ odooId: 5 }), [], [])).kind).toBe('blocked');
  });
  it('gone customers leave with their jobs unless accepted work is only on the phone', () => {
    const a = cust({ id: 'a' });
    const b = cust({ id: 'b', name: 'keep me' });
    const jobs = [job({ id: 'j1', customerId: 'a' }), job({ id: 'j2', customerId: 'b', accepted: { total: 100 } as Job['accepted'] })];
    const r = resolveGone([a, b], jobs, []);
    expect([...r.dropCustomers]).toEqual(['a']);
    expect(r.dropJobs).toEqual(['j1']);
    expect(r.kept).toEqual(['keep me']);
  });
});
