import AsyncStorage from '@react-native-async-storage/async-storage';
import { BRAND_KEY, fetchCompanyBrand, loadCompanyBrand, logoDataUrl, refreshBrandIfStale, reportLogo, saveCompanyBrand } from '../lib/companyBrand';
import { LOGO_DATA_URL } from '../data/logoPng';
import { loadLook, saveLook } from '../lib/lookPref';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function fake(rows: Record<string, unknown>[], failColor = false) {
  const calls: string[][] = [];
  return {
    calls,
    client: {
      session: { uid: 7 } as never,
      call: jest.fn(async (model: string, method: string, _args: unknown[], kw?: { fields?: string[] }) => {
        if (model === 'res.users') return [{ company_id: [3, 'Co'] }];
        calls.push(kw?.fields ?? []);
        if (failColor && kw?.fields?.includes('primary_color')) throw new Error('Invalid field');
        return rows;
      }),
    },
  };
}

describe('company brand', () => {
  beforeEach(() => AsyncStorage.clear());
  it('turns Odoo base64 into a data URL and drops unknown or huge ones', () => {
    expect(logoDataUrl(PNG)).toBe(`data:image/png;base64,${PNG}`);
    expect(logoDataUrl('/9j/abc')).toMatch(/^data:image\/jpeg/);
    expect(logoDataUrl('zzzz')).toBe('');
    expect(logoDataUrl(false)).toBe('');
    expect(logoDataUrl('iVBOR' + 'A'.repeat(800_000))).toBe('');
  });
  it('reads logo and color, and still gets the logo when Odoo has no color field', async () => {
    const f = fake([{ logo_web: PNG, primary_color: '#336699' }]);
    expect(await fetchCompanyBrand(f.client as never, 5)).toEqual({ logo: `data:image/png;base64,${PNG}`, color: '#336699', fetchedAt: 5 });
    const g = fake([{ logo_web: PNG }], true);
    const b = await fetchCompanyBrand(g.client as never, 6);
    expect(b.logo).toContain('base64');
    expect(b.color).toBe('');
    expect(g.calls[1]).toEqual(['logo_web']);
  });
  it('keeps the brand for offline use and only reads again when stale', async () => {
    const f = fake([{ logo_web: PNG, primary_color: '#336699' }]);
    await refreshBrandIfStale(f.client as never, 1000);
    expect((await loadCompanyBrand()).color).toBe('#336699');
    const reads = f.calls.length;
    await refreshBrandIfStale(f.client as never, 1000 + 60_000);
    expect(f.calls.length).toBe(reads);
    await refreshBrandIfStale(f.client as never, 1000 + 7 * 3600_000);
    expect(f.calls.length).toBe(reads + 1);
  });
  it('an unreachable Odoo keeps the old copy', async () => {
    await saveCompanyBrand({ logo: 'data:image/png;base64,AA', color: '#112233', fetchedAt: 1 });
    const bad = { session: {} as never, call: jest.fn(async () => { throw new Error('offline'); }) };
    await refreshBrandIfStale(bad as never, 9e12);
    expect((await loadCompanyBrand()).color).toBe('#112233');
  });
  it('PDF logo: built-in unless the switch is on and the phone has an Odoo one', async () => {
    expect(await reportLogo(false)).toBe(LOGO_DATA_URL);
    expect(await reportLogo(true)).toBe(LOGO_DATA_URL);
    await AsyncStorage.setItem(BRAND_KEY, JSON.stringify({ logo: 'data:image/png;base64,QQ', color: '', fetchedAt: 1 }));
    expect(await reportLogo(true)).toBe('data:image/png;base64,QQ');
    expect(await reportLogo(undefined)).toBe(LOGO_DATA_URL);
  });
});

describe('look pref', () => {
  beforeEach(() => AsyncStorage.clear());
  it('defaults to legacy and saves a pick', async () => {
    expect(await loadLook()).toEqual({ shape: 'round', size: 'legacy', palette: 'johnsons' });
    await saveLook({ shape: 'square', size: 'compact', palette: 'brand' });
    expect(await loadLook()).toEqual({ shape: 'square', size: 'compact', palette: 'brand' });
  });
});
