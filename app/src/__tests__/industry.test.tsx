import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { currentIndustry, garageToolsOn, INDUSTRY_FILE, INDUSTRY_KEY, loadIndustry, parseIndustry, readIndustry, refreshIndustry, resetIndustryForTests, writeIndustry } from '../lib/industry';
import { renderApp } from '../testing/renderApp';

function fake(file?: string | null) {
  const calls: [string, string, unknown[], Record<string, unknown>?][] = [];
  let datas: string | null | undefined = file;
  const client = {
    calls,
    session: { uid: 7 },
    call: async (model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) => {
      calls.push([model, method, args, kwargs]);
      if (model === 'res.users') return [{ company_id: [3, 'Co'] }];
      if (model === 'ir.attachment' && method === 'search_read') return datas ? [{ id: 9, datas }] : [];
      if (model === 'ir.attachment' && (method === 'create' || method === 'write')) {
        datas = ((method === 'create' ? args[0] : args[1]) as { datas: string }).datas;
        return 9;
      }
      return true;
    },
  };
  return client as never as Parameters<typeof readIndustry>[0] & { calls: typeof calls };
}
const enc = (o: unknown) => btoa(JSON.stringify(o));
const settle = async (n = 5) => {
  for (let k = 0; k < n; k++) await act(async () => undefined);
};

describe('industry setting', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resetIndustryForTests(null);
  });

  it('parses only known industries', () => {
    expect(parseIndustry('garage-doors')).toBe('garage-doors');
    expect(parseIndustry('other')).toBe('other');
    expect(parseIndustry('plumbing')).toBeNull();
    expect(parseIndustry(undefined)).toBeNull();
  });

  it('starts on the app default (Johnsons: garage doors) until an owner picks', () => {
    expect(currentIndustry()).toBe('garage-doors');
    expect(garageToolsOn()).toBe(true);
  });

  it('reads the pick from the Odoo company file; nothing saved reads as null', async () => {
    expect(await readIndustry(fake(enc({ version: 1, industry: 'other' })))).toBe('other');
    expect(await readIndustry(fake(null))).toBeNull();
    expect(await readIndustry(fake('not json'))).toBeNull();
  });

  it('saving writes one small file on the company and keeps a copy on the phone', async () => {
    const c = fake(null);
    await writeIndustry(c, 'other');
    const create = c.calls.find((x) => x[1] === 'create');
    expect(create?.[2][0]).toMatchObject({ name: INDUSTRY_FILE, res_model: 'res.company', res_id: 3 });
    expect(garageToolsOn()).toBe(false);
    expect(await AsyncStorage.getItem(INDUSTRY_KEY)).toBe('other');
    await writeIndustry(c, 'garage-doors');
    expect(c.calls.some((x) => x[1] === 'write')).toBe(true);
    expect(garageToolsOn()).toBe(true);
  });

  it('refresh only reads Odoo, never writes', async () => {
    const c = fake(enc({ version: 1, industry: 'other' }));
    await refreshIndustry(c);
    expect(currentIndustry()).toBe('other');
    expect(c.calls.some((x) => x[1] === 'create' || x[1] === 'write')).toBe(false);
  });

  it('the phone copy is used offline', async () => {
    await AsyncStorage.setItem(INDUSTRY_KEY, 'other');
    await loadIndustry();
    expect(currentIndustry()).toBe('other');
  });

  it('Tools shows the garage door tools on garage doors and hides them on Other', async () => {
    await renderApp('/tools');
    await settle();
    for (const id of ['tools-springs', 'tools-door-weight', 'tools-diagnose', 'tools-manuals']) expect(screen.getByTestId(id)).toBeTruthy();
    await act(async () => resetIndustryForTests('other'));
    for (const id of ['tools-springs', 'tools-door-weight', 'tools-diagnose', 'tools-manuals', 'tools-springs-big']) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.getByTestId('tools-end-of-day')).toBeTruthy();
    expect(screen.queryByTestId('open-stock-tile') ?? screen.queryByTestId('open-stock')).toBeTruthy();
    await act(async () => resetIndustryForTests('garage-doors'));
    expect(screen.getByTestId('tools-springs')).toBeTruthy();
  });
});
