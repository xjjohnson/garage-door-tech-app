import { EMPTY_BUSINESS } from '../lib/invoices';
import { companyDetails, readSettings, SETTINGS_FILE, writeSettings } from '../lib/odooSettings';
import { clearPending, onQueued, pendingBusiness, queueBusiness } from '../lib/settingsSync';

type Call = [string, string, unknown[], Record<string, unknown>?];
function fake(files: { id: number; datas: string }[] = []) {
  const calls: Call[] = [];
  const client = {
    calls,
    session: { uid: 7 },
    call: async (model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) => {
      calls.push([model, method, args, kwargs]);
      if (model === 'res.users') return [{ company_id: [3, 'Johnsons'] }];
      if (model === 'res.company') return [{ name: 'Johnsons Garage Doors', phone: '555-0100' }];
      if (method === 'search_read') return files;
      if (method === 'create') return 90;
      return true;
    },
  };
  return client as never as Parameters<typeof readSettings>[0] & { calls: Call[] };
}
const BIZ = { ...EMPTY_BUSINESS, name: 'Johnsons', cashtag: '$Johnsons', zelle: 'pay@johnsons.test', reviewUrl: 'g.page/r/x' };

describe('business details on the Odoo company', () => {
  it('creates the settings file on the company the first time, then writes into it', async () => {
    const c = fake();
    await writeSettings(c, { business: BIZ });
    const create = c.calls.find((x) => x[1] === 'create')!;
    expect(create[0]).toBe('ir.attachment');
    expect(create[2][0]).toMatchObject({ name: SETTINGS_FILE, res_model: 'res.company', res_id: 3, mimetype: 'application/json' });
    const datas = (create[2][0] as { datas: string }).datas;

    const c2 = fake([{ id: 90, datas }]);
    await writeSettings(c2, { business: { ...BIZ, venmo: '@johnsons' } });
    expect(c2.calls.some((x) => x[1] === 'create')).toBe(false);
    expect(c2.calls.at(-1)?.slice(0, 2)).toEqual(['ir.attachment', 'write']);
    expect((await readSettings(fake([{ id: 90, datas }])))?.business).toEqual(BIZ);
  });

  it('reads nothing when no file is saved or it is damaged', async () => {
    expect(await readSettings(fake())).toBeNull();
    expect(await readSettings(fake([{ id: 1, datas: btoa('not json') }]))).toBeNull();
    expect(await readSettings(fake([{ id: 1, datas: '' }]))).toBeNull();
  });

  it('keeps non-ASCII text', async () => {
    const c = fake();
    await writeSettings(c, { business: { ...BIZ, name: 'Peña Doors' } });
    const datas = (c.calls.find((x) => x[1] === 'create')![2][0] as { datas: string }).datas;
    expect((await readSettings(fake([{ id: 1, datas }])))?.business.name).toBe('Peña Doors');
  });

  it('reads the company name and phone', async () => {
    expect(await companyDetails(fake())).toEqual({ name: 'Johnsons Garage Doors', phone: '555-0100' });
  });

  it("holds the owner's edit until it is sent", () => {
    const seen = jest.fn();
    const off = onQueued(seen);
    queueBusiness(BIZ);
    expect(pendingBusiness()).toBe(BIZ);
    expect(seen).toHaveBeenCalled();
    clearPending({ ...BIZ });
    expect(pendingBusiness()).toBe(BIZ);
    clearPending(BIZ);
    expect(pendingBusiness()).toBeNull();
    off();
  });
});
