import { installCrashHandler, lastCrash, resetCrashHandler } from '../lib/crash';
import { Db, migrate } from '../lib/db';
import { DEFAULT_MATCH_FORM } from '../lib/forms';
import { Invoice } from '../lib/invoices';
import { jobSteps, nextStep, onSiteFor, smsLink } from '../lib/jobSteps';
import { createJob, Job } from '../lib/jobs';
import { formatLog, KEEP_MS, Logger, LogStore, memoryStore, redact } from '../lib/log';
import { describePending, pendingSync } from '../lib/pending';
import { CheckClient, runSetupCheck, setupSummary } from '../lib/setupCheck';
import type { Customer } from '../lib/customers';

describe('log', () => {
  it('blanks out passwords, keys and tokens', () => {
    expect(redact('password=hunter2 user=pat')).toBe('password=[hidden] user=pat');
    expect(redact('{"api_key": "abc", "x": 1}')).toBe('{"api_key": [hidden], "x": 1}');
    expect(redact('Authorization: Bearer abc.def')).toContain('[hidden]');
    expect(redact('Authorization: Bearer abc.def')).not.toContain('abc.def');
    expect(redact('key 0123456789abcdef0123456789abcdef01234567 sent')).toBe('key [hidden] sent');
    expect(redact('res.partner search ok 38 ms')).toBe('res.partner search ok 38 ms');
  });

  it('keeps 7 days, redacts before keeping, and lists oldest first', () => {
    let t = 1_000_000_000_000;
    const store = memoryStore();
    const logger = new Logger(() => store, () => t);
    logger.info('app', 'old');
    t += KEEP_MS + 1;
    logger.warn('odoo', 'token=xyz failed');
    logger.error('sync', new Error('boom'));
    const lines = logger.entries();
    expect(lines.map((e) => e.msg.split('\n')[0])).toEqual(['token=[hidden] failed', 'Error: boom']);
    logger.prune();
    expect(store.all(0)).toHaveLength(2);
  });

  it('keeps going in memory when the database fails', () => {
    const broken: LogStore = { add: () => { throw new Error('disk'); }, all: () => [], prune: () => undefined, clear: () => undefined };
    const logger = new Logger(() => broken);
    logger.info('app', 'still here');
    expect(logger.entries().map((e) => e.msg)).toEqual(['still here']);
  });

  it('formats a shareable text with a header', () => {
    const text = formatLog([{ t: 0, level: 'error', area: 'odoo', msg: 'a\nb' }], ['Johnsons 0.5.0']);
    expect(text.split('\n')[0]).toBe('Johnsons 0.5.0');
    expect(text).toContain('ERROR odoo   a');
  });
});

describe('local database', () => {
  it('runs each migration once and remembers how far it got', () => {
    let version = 0;
    const ran: string[] = [];
    const db: Db = {
      execSync: (sql) => {
        const m = /user_version = (\d+)/.exec(sql);
        if (m) version = Number(m[1]);
        else ran.push(sql);
      },
      runSync: () => undefined,
      getAllSync: <T,>() => [{ user_version: version }] as T[],
    };
    migrate(db);
    expect(ran).toHaveLength(1);
    expect(ran[0]).toContain('CREATE TABLE IF NOT EXISTS log');
    migrate(db);
    expect(ran).toHaveLength(1);
  });
});

describe('crash reports', () => {
  afterEach(resetCrashHandler);

  it('logs an uncaught error, then hands it on', () => {
    const store = memoryStore();
    const logger = new Logger(() => store, () => 5);
    const previous = jest.fn();
    let handler: (e: unknown, fatal?: boolean) => void = previous;
    installCrashHandler(logger, { getGlobalHandler: () => handler, setGlobalHandler: (h) => (handler = h) });
    handler(new Error('kaboom'), true);
    expect(previous).toHaveBeenCalled();
    const crash = lastCrash(logger.entries());
    expect(crash?.msg).toMatch(/^App closed: Error: kaboom/);
    expect(lastCrash(logger.entries(), 5)).toBeUndefined();
  });
});

const job = (over: Partial<Job> = {}): Job => ({ ...createJob({ mode: 'match', form: DEFAULT_MATCH_FORM }, { customer: 'Pat Lee', address: '1 Elm', phone: '555-0100', notes: '' }, { title: 'Spring' }, 1, 'j1'), ...over }) as Job;

const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'i1', number: '1001', jobId: 'j1', billTo: 'Pat', address: '', tier: 'good', lines: [], subtotal: 100, tax: 0, total: 100, payments: [], createdAt: 1, updatedAt: 1, ...over,
}) as Invoice;

describe('not synced yet', () => {
  it('counts what Odoo does not have', () => {
    const customers = [
      { id: 'c1', updatedAt: 5 },
      { id: 'c2', odooId: 3, updatedAt: 5, syncedAt: 5 },
      { id: 'c3', odooId: 4, updatedAt: 9, syncedAt: 5 },
    ] as Customer[];
    // Invoices for another job: a job with an invoice already carries its picked option.
    const jobs = [job({ id: 'j2', accepted: { tier: 'good' } as Job['accepted'] })];
    const invoices = [
      invoice(),
      invoice({ id: 'i2', voidedAt: 3 }),
      invoice({ id: 'i3', payments: [{ id: 'p1', method: 'cash', amount: 100, at: 2, reference: '' }], odoo: { sentPayments: [] } as unknown as Invoice['odoo'] }),
    ];
    const p = pendingSync(customers, jobs, invoices);
    expect(p).toEqual({ customers: 2, jobs: 1, quotes: 1, invoices: 1, payments: 1, total: 6 });
    expect(describePending(p)).toBe('2 customers, 1 job, 1 quote, 1 invoice, 1 payment');
    expect(pendingSync([], [job({ odooJob: { model: 'fsm.order', id: 3, name: 'FSO3' } })], []).jobs).toBe(0);
  });
});

describe('job steps', () => {
  it('follows the visit from on my way to paid', () => {
    let steps = jobSteps(job(), []);
    expect(nextStep(steps)?.id).toBe('onMyWay');
    steps = jobSteps(job({ steps: { arrivedAt: 10 } }), []);
    expect(steps.filter((s) => s.done).map((s) => s.id)).toEqual(['onMyWay', 'arrived']);
    steps = jobSteps(job({ steps: { arrivedAt: 10, workDoneAt: 20 }, accepted: { tier: 'good' } as Job['accepted'], inspection: {} as Job['inspection'] }), [invoice({ payments: [{ id: 'p', method: 'cash', amount: 100, at: 3, reference: '' }] })]);
    expect(nextStep(steps)).toBeNull();
  });

  it('shows time on site and builds a text link', () => {
    expect(onSiteFor(0, 100)).toBeNull();
    expect(onSiteFor(1000, 1000 + 84 * 60000)).toBe('1:24');
    expect(smsLink('(555) 010-0100', 'On my way')).toBe('sms:5550100100?body=On%20my%20way');
    expect(smsLink('', 'x')).toBeUndefined();
  });
});

describe('Odoo setup check', () => {
  const fake = (session: Partial<CheckClient['session']>, counts: Record<string, unknown>): CheckClient => ({
    session: { name: 'Justin', kind: 'oca', me: 7, apps: { products: true, sales: true, invoicing: true }, ...session },
    call: async (model) => {
      const v = counts[model];
      if (v instanceof Error || v === undefined) throw v ?? new Error(`${model} doesn't exist`);
      return v;
    },
  });

  it('says to sign in first', async () => {
    const r = await runSetupCheck(null);
    expect(r).toEqual([expect.objectContaining({ id: 'signin', state: 'missing' })]);
  });

  it('is all green when everything is there', async () => {
    const r = await runSetupCheck(fake({}, { 'sale.order.template': 3, 'stock.location': 2, 'ir.mail_server': 1, 'fsm.recurring': { location_id: {} }, agreement: { partner_id: {} } }));
    expect(r.map((x) => [x.id, x.state])).toEqual([
      ['signin', 'ok'], ['fsm', 'ok'], ['worker', 'ok'], ['sales', 'ok'], ['templates', 'ok'], ['invoicing', 'ok'], ['recurring', 'ok'], ['agreements', 'ok'], ['truck', 'ok'], ['email', 'ok'],
    ]);
    expect(setupSummary(r)).toBe('Odoo is ready for this version.');
  });

  it('says what to fix when things are missing', async () => {
    const r = await runSetupCheck(fake({ me: 0, apps: { products: true, sales: true, invoicing: false } }, { 'sale.order.template': 0, 'ir.mail_server': new Error('Access denied') }));
    const by = Object.fromEntries(r.map((x) => [x.id, x]));
    expect(by.worker.state).toBe('missing');
    expect(by.worker.fix).toMatch(/Is a FS Worker/);
    expect(by.templates.state).toBe('warn');
    expect(by.invoicing.state).toBe('missing');
    expect(by.truck.state).toBe('warn');
    expect(by.email.detail).toMatch(/admin/);
    expect(by.recurring.state).toBe('warn');
    expect(by.agreements.state).toBe('warn');
    expect(setupSummary(r)).toBe('2 missing, 5 to look at.');
  });
});

