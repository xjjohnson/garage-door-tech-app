import { activityWindow, asFollowUpInvoice, completeActivity, ensureActivity, liveActivities, notOnPhone, readOdooInvoices } from '../lib/odooFollowUps';
import { DAY, DEFAULT_FOLLOW_UP, followUps, FollowUp, parseFollowUpStore } from '../lib/followups';

type Call = [string, string, unknown[], Record<string, unknown>?];
function fake(handler: (model: string, method: string, args: unknown[]) => unknown) {
  const calls: Call[] = [];
  return {
    calls,
    session: { uid: 7 },
    call: async (model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) => {
      calls.push([model, method, args, kwargs]);
      return handler(model, method, args);
    },
  } as never as Parameters<typeof ensureActivity>[0] & { calls: Call[] };
}

const NOW = new Date(2026, 10, 13, 12).getTime();
const row = (id: number, daysAgo: number, partnerId = 20) => ({ id, name: `INV/2026/${id}`, partnerId, partnerName: 'Pat Lee', at: NOW - daysAgo * DAY });

describe('follow-ups from Odoo invoices', () => {
  it('reads posted customer invoices', async () => {
    const c = fake(() => [
      { id: 1, name: 'INV/1', partner_id: [20, 'Pat Lee'], invoice_date: '2025-11-10' },
      { id: 2, name: 'INV/2', partner_id: false, invoice_date: '2025-11-10' },
      { id: 3, name: 'INV/3', partner_id: [21, 'Sam'], invoice_date: false },
    ]);
    const rows = await readOdooInvoices(c, NOW);
    expect(rows.map((r) => [r.id, r.partnerId])).toEqual([[1, 20]]);
    expect(c.calls[0][2][0]).toEqual([['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['invoice_date', '>=', '2025-09-09']]);
  });

  it('gives a tune-up a year after an Odoo invoice, but no spring or warranty reminders', () => {
    const inv = asFollowUpInvoice(row(5, 350), 'c1');
    const list = followUps([inv], DEFAULT_FOLLOW_UP, { name: 'Johnsons', phone: '' }, NOW);
    expect(list.map((f) => f.kind)).toEqual(['tuneup']);
    expect(list[0].invoice.customerId).toBe('c1');
  });

  it("leaves out Odoo invoices the phone already has", () => {
    expect(notOnPhone([row(5, 1), row(6, 1)], [{ odoo: { id: 5 } as never }]).map((r) => r.id)).toEqual([6]);
  });

  it('only puts follow-ups due soon into Odoo', () => {
    const f = (due: number) => ({ due }) as FollowUp;
    expect(activityWindow([f(NOW - 30 * DAY), f(NOW - 5 * DAY), f(NOW + 10 * DAY), f(NOW + 90 * DAY)], NOW).map((x) => Math.round((x.due - NOW) / DAY))).toEqual([-5, 10]);
  });
});

describe('follow-up activities', () => {
  const f = { kind: 'tuneup', title: 'Tune-up due', message: 'Hi Pat <b>', due: new Date(2026, 10, 20, 12).getTime() } as FollowUp;

  it('makes a to-do on the contact, once', async () => {
    const c = fake((m, method) => (m === 'mail.activity' && method === 'search' ? [] : m === 'ir.model' ? [88] : m === 'ir.model.data' ? [{ res_id: 4 }] : 301));
    expect(await ensureActivity(c, 20, f, 'tuneup:x')).toBe(301);
    const create = c.calls.find((x) => x[1] === 'create')!;
    expect(create[2][0]).toMatchObject({ res_model_id: 88, res_id: 20, summary: 'Tune-up due', user_id: 7, activity_type_id: 4 });
    expect((create[2][0] as { note: string }).note).toContain('johnsons-followup:tuneup:x');
    expect((create[2][0] as { note: string }).note).toContain('Hi Pat &lt;b&gt;');
    const again = fake((_m, method) => (method === 'search' ? [301] : 0));
    expect(await ensureActivity(again, 20, f, 'tuneup:x')).toBe(301);
    expect(again.calls.some((x) => x[1] === 'create')).toBe(false);
  });

  it('knows which activities are still there, and completes one', async () => {
    expect([...(await liveActivities(fake(() => [{ id: 2 }]), [1, 2]))]).toEqual([2]);
    expect((await liveActivities(fake(() => []), [])).size).toBe(0);
    const c = fake(() => true);
    await completeActivity(c, 2);
    expect(c.calls[0].slice(0, 3)).toEqual(['mail.activity', 'action_done', [[2]]]);
  });

  it('keeps the activity links in saved follow-ups', () => {
    expect(parseFollowUpStore({ activities: { 'tuneup:a': 5, bad: 'x' } }).activities).toEqual({ 'tuneup:a': 5 });
    expect(parseFollowUpStore(null).activities).toEqual({});
  });
});
