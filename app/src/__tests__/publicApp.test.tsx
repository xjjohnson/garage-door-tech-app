import { render, screen } from '@testing-library/react-native';
import { OpeningFs } from '../components/OpeningFs';
import { setFlavorForTests } from '../flavor';
import { builtInLogo, odooLogoOn } from '../lib/companyBrand';
import { reminderText, quoteText } from '../lib/deptActions';
import { defaultJobTypes, GENERAL_JOB_TYPES } from '../lib/jobTypes';
import { SERVICE_PRODUCT_CODE, SERVICE_PRODUCT_NAME, serviceProduct } from '../lib/odooSales';
import { parsePalette, PALETTES } from '../lib/themeLook';
import { parseBusiness } from '../lib/invoices';

afterEach(() => setFlavorForTests(null));

describe('the public app (FS Crew) and the Johnsons app share code but start differently', () => {
  it('color choice: a saved choice always wins; otherwise Johnsons is green and FS Crew uses the Odoo company color', () => {
    setFlavorForTests('johnsons');
    expect(parsePalette(undefined)).toBe('johnsons');
    expect(parsePalette('brand')).toBe('brand');
    setFlavorForTests('fscrew');
    expect(parsePalette(undefined)).toBe('brand');
    expect(parsePalette('johnsons')).toBe('johnsons');
    expect(PALETTES.map((p) => p.value)).toEqual(['johnsons', 'brand']);
  });

  it('logo: Johnsons keeps its own unless the owner switches to Odoo; FS Crew uses Odoo unless switched off, and has no built-in logo', () => {
    setFlavorForTests('johnsons');
    expect(odooLogoOn(undefined)).toBe(false);
    expect(odooLogoOn(true)).toBe(true);
    expect(builtInLogo()).toMatch(/^data:image/);
    setFlavorForTests('fscrew');
    expect(odooLogoOn(undefined)).toBe(true);
    expect(odooLogoOn(false)).toBe(false);
    expect(builtInLogo()).toBe('');
  });

  it('keeps an owner\'s explicit "no Odoo logo" when business details are read back', () => {
    expect(parseBusiness({ useOdooLogo: false }).useOdooLogo).toBe(false);
    expect(parseBusiness({ useOdooLogo: true }).useOdooLogo).toBe(true);
    expect(parseBusiness({}).useOdooLogo).toBeUndefined();
  });

  it('texts do not name Johnsons or garage doors when the business has no name set', () => {
    const r = reminderText({ customer: 'Pat Lee', name: 'INV/1', cents: 5000, days: 3 }, '');
    expect(r).toContain("it's your service team");
    expect(r).not.toMatch(/Johnsons|garage/i);
    expect(quoteText({ customer: 'Pat Lee', name: 'S0001' }, '')).not.toMatch(/Johnsons|garage/i);
    expect(reminderText({ customer: 'Pat Lee', name: 'INV/1', cents: 5000, days: 3 }, 'Ace Doors')).toContain("it's Ace Doors");
  });

  it('starting job types: garage door kinds for garage doors, general ones for any other business', () => {
    expect(defaultJobTypes(true)).toContain('Broken spring');
    expect(defaultJobTypes(false)).toEqual(GENERAL_JOB_TYPES);
    expect(defaultJobTypes(false)).not.toContain('Broken spring');
  });

  it('the loading mark shows FS and its percent', async () => {
    setFlavorForTests('fscrew');
    await render(<OpeningFs stage={2} />);
    expect(screen.getByTestId('opening-fs')).toHaveProp('accessibilityLabel', 'Opening, 50 percent');
    expect(screen.getByText('FS')).toBeTruthy();
  });
});

function oddoFake(existing: { id: number; name: string } | null) {
  const calls: [string, string, unknown[]][] = [];
  const client = {
    session: { uid: 1 },
    call: async (model: string, method: string, args: unknown[]) => {
      calls.push([model, method, args]);
      if (method === 'search') return existing ? [existing.id] : [];
      if (method === 'read') return existing ? [{ id: existing.id, name: existing.name }] : [];
      if (method === 'create') return 77;
      return true;
    },
  };
  return { client: client as never as Parameters<typeof serviceProduct>[0], calls };
}

describe('the catch-all service product in Odoo', () => {
  it('is made as "Service" the first time', async () => {
    const f = oddoFake(null);
    expect(await serviceProduct(f.client)).toBe(77);
    const create = f.calls.find((c) => c[1] === 'create');
    expect(create?.[2][0]).toMatchObject({ name: SERVICE_PRODUCT_NAME, default_code: SERVICE_PRODUCT_CODE });
    expect(SERVICE_PRODUCT_NAME).toBe('Service');
  });

  it('renames the old "Garage door service" once, keeping its code and id', async () => {
    const f = oddoFake({ id: 12, name: 'Garage door service' });
    expect(await serviceProduct(f.client)).toBe(12);
    expect(f.calls.find((c) => c[1] === 'write')?.[2]).toEqual([[12], { name: 'Service' }]);
    expect(f.calls.some((c) => c[1] === 'create')).toBe(false);
  });

  it('leaves a name the owner chose alone', async () => {
    const f = oddoFake({ id: 12, name: 'Labor' });
    expect(await serviceProduct(f.client)).toBe(12);
    expect(f.calls.some((c) => c[1] === 'write')).toBe(false);
  });

  it('still returns the product when Odoo will not let this user rename it', async () => {
    const f = oddoFake({ id: 12, name: 'Garage door service' });
    const base = f.client.call.bind(f.client);
    (f.client as { call: typeof base }).call = async (m, meth, a, k) => {
      if (meth === 'write') throw new Error('Access denied');
      return base(m, meth, a, k);
    };
    expect(await serviceProduct(f.client)).toBe(12);
  });
});
