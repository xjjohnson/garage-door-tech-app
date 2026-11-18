import { DEFAULT_LIMITS } from '../lib/deptLimits';
import { closedWithoutOrder, NO_TRACKING, notSeenPlaces, openedByInvoice, plansAboutToRenew, readTerms, saleLinkField, SALE_LINK_MISSING, saveTerms, sentNotOpened } from '../lib/odooOffice';

const NOW = Date.UTC(2026, 10, 18, 18);
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString().slice(0, 19).replace('T', ' ');

type Handler = (model: string, method: string, args: unknown[], kw: Record<string, unknown>) => unknown;
const client = (h: Handler, fields = ['date_end']) => ({ session: { uid: 5, fields }, call: async (m: string, method: string, args: unknown[] = [], kw: Record<string, unknown> = {}) => h(m, method, args, kw) }) as never;

describe('invoices sent, not opened', () => {
  it('counts an invoice as opened when any recipient opened any message', () => {
    const r = openedByInvoice([{ messageId: 1, state: 'sent' }, { messageId: 2, state: 'opened' }, { messageId: 3, state: 'delivered' }, { messageId: 9, state: 'sent' }], new Map([[1, 70], [2, 70], [3, 71]]));
    expect([...r.entries()]).toEqual([[70, true], [71, false]]);
  });
  it('says plainly when Odoo does not track opens', async () => {
    const c = client((m) => {
      if (m === 'mail.tracking.email') throw new Error("doesn't exist");
      return [];
    });
    await expect(sentNotOpened(c, NOW)).rejects.toThrow(NO_TRACKING);
  });
  it('lists the unpaid invoices whose emails were never opened', async () => {
    const c = client((m, method) => {
      if (method === 'fields_get') return { state: {}, mail_message_id: {} };
      if (m === 'mail.tracking.email') return [{ id: 1, mail_message_id: [11, 'x'], state: 'sent' }, { id: 2, mail_message_id: [12, 'y'], state: 'opened' }];
      if (m === 'mail.message') return [{ id: 11, res_id: 70 }, { id: 12, res_id: 71 }];
      if (m === 'account.move') return [{ id: 70, name: 'INV/70', partner_id: [9, 'Maria'], amount_residual: 90, invoice_date_due: '2026-11-01' }];
      return [];
    });
    const r = await sentNotOpened(c, NOW);
    expect(r.map((x) => x.id)).toEqual([70]);
  });
});

describe('closed jobs with no order', () => {
  it('finds the link field either Odoo spelling', async () => {
    expect(await saleLinkField(client(() => ({ sale_id: {} })))).toBe('sale_id');
    expect(await saleLinkField(client(() => ({ sale_order_id: {} })))).toBe('sale_order_id');
    expect(await saleLinkField(client(() => ({ name: {} })))).toBeUndefined();
  });
  it('says so when Field Service Sale is missing', async () => {
    await expect(closedWithoutOrder(client(() => ({ name: {} })), DEFAULT_LIMITS, NOW)).rejects.toThrow(SALE_LINK_MISSING);
  });
  it('asks only for closed jobs with no order inside the look-back', async () => {
    let domain: unknown[] = [];
    const c = client((m, method, args) => {
      if (method === 'fields_get') return { sale_id: {} };
      if (m === 'fsm.stage') return [4];
      if (m === 'fsm.order') {
        domain = args[0] as unknown[];
        return [{ id: 8, name: 'FSO8', location_id: [3, 'Pat Smith'], person_id: [2, 'Sam'], date_end: day(3) }];
      }
      return [];
    });
    const r = await closedWithoutOrder(c, DEFAULT_LIMITS, NOW);
    expect(r[0]).toMatchObject({ id: 8, place: 'Pat Smith', tech: 'Sam' });
    expect(JSON.stringify(domain)).toContain('["sale_id","=",false]');
    expect(JSON.stringify(domain)).toContain('["stage_id","in",[4]]');
  });
});

describe('terms', () => {
  it('reads plain or web page terms and writes plain text', async () => {
    const writes: unknown[][] = [];
    const c = client((m, method, args) => {
      if (m === 'ir.attachment') return [];
      if (m === 'res.company' && method === 'search_read') return [{ id: 1 }];
      if (m === 'res.company' && method === 'read') return [{ terms_type: 'plain', invoice_terms: 'Pay in 30 days' }];
      if (method === 'write') {
        writes.push(args);
        return true;
      }
      return [{ company_id: [1, 'Johnsons'] }];
    });
    expect(await readTerms(c)).toEqual({ type: 'plain', text: 'Pay in 30 days' });
    await saveTerms(c, '  New wording ');
    expect(writes[0]![1]).toEqual({ invoice_terms: 'New wording' });
    const web = client((m) => (m === 'res.company' ? [{ terms_type: 'html', invoice_terms: '' }] : [{ company_id: [1, 'J'] }]));
    expect((await readTerms(web)).type).toBe('html');
  });
});

describe('not seen in a year', () => {
  it('leaves out customers who were seen recently even when their old jobs are in the read', async () => {
    const jobs = (when: string) => {
      const old = [
        { id: 1, name: 'A-old', location_id: [1, 'House A'], person_id: false, date_end: day(500) },
        { id: 2, name: 'B-old', location_id: [2, 'House B'], person_id: false, date_end: day(450) },
      ];
      const recent = [{ id: 3, name: 'A-new', location_id: [1, 'House A'], person_id: false, date_end: day(20) }];
      return when === 'old' ? old : recent;
    };
    const c = client((m, _method, args) => {
      if (m !== 'fsm.order') return [];
      const domain = args[0] as unknown[][];
      return jobs(domain.length === 2 ? 'old' : 'recent');
    });
    const r = await notSeenPlaces(c, DEFAULT_LIMITS, NOW);
    expect(r.map((v) => v.placeName)).toEqual(['House B']);
  });
});

describe('plans about to renew', () => {
  it('goes by the name when the agreement has no description field', async () => {
    let domain: unknown[] = [];
    const c = client((m, method, args) => {
      if (method === 'fields_get') return { name: {}, end_date: {} };
      domain = args[0] as unknown[];
      return [{ id: 1, name: 'Maintenance plan: Yearly', partner_id: [9, 'Maria'], end_date: new Date(NOW + 10 * 86_400_000).toISOString().slice(0, 10) }];
    });
    const r = await plansAboutToRenew(c, DEFAULT_LIMITS, NOW);
    expect(r).toHaveLength(1);
    expect(JSON.stringify(domain)).toContain('["name","ilike","Maintenance plan"]');
  });
});
