import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ColorsTab } from '../screens/ColorsTab';
import type { OdooClient } from '../lib/odoo';
import { refreshIndustry, resetIndustryForTests } from '../lib/industry';
import { setFirstRunForTests, firstRunEnabled } from '../lib/firstRun';
import { renderApp } from '../testing/renderApp';

function fake(file?: object) {
  const calls: [string, string, unknown[]][] = [];
  let datas: string | null = file ? btoa(JSON.stringify(file)) : null;
  const client = {
    calls,
    session: { uid: 7 },
    call: async (model: string, method: string, args: unknown[]) => {
      calls.push([model, method, args]);
      if (model === 'res.users') return [{ company_id: [3, 'Co'] }];
      if (model === 'ir.attachment' && method === 'search_read') return datas ? [{ id: 9, datas }] : [];
      if (model === 'ir.attachment' && (method === 'create' || method === 'write')) {
        datas = ((method === 'create' ? args[0] : args[1]) as { datas: string }).datas;
        return 9;
      }
      return true;
    },
  };
  return client as never as OdooClient & { calls: typeof calls };
}
const settle = async (n = 5) => {
  for (let k = 0; k < n; k++) await act(async () => undefined);
};

describe('Management colors', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resetIndustryForTests(null);
  });

  it('owner pick saves to Odoo and the phone, then offers a restart', async () => {
    const c = fake();
    const restart = jest.fn(async () => undefined);
    await render(<ColorsTab client={c} canEdit restart={restart} />);
    await settle();
    expect(screen.queryByTestId('settings-look-restart')).toBeNull();
    await fireEvent.press(screen.getByText('Company brand (Odoo)'));
    await settle();
    expect(c.calls.some((x) => x[0] === 'ir.attachment' && x[1] === 'create')).toBe(true);
    expect(JSON.parse((await AsyncStorage.getItem('johnsons.theme')) as string).palette).toBe('brand');
    await fireEvent.press(screen.getByTestId('settings-look-restart'));
    expect(restart).toHaveBeenCalled();
  });

  it('a non-owner cannot change it', async () => {
    const c = fake();
    await render(<ColorsTab client={c} canEdit={false} />);
    await settle();
    await fireEvent.press(screen.getByText('Company brand (Odoo)'));
    await settle();
    expect(c.calls.some((x) => x[1] === 'create' || x[1] === 'write')).toBe(false);
  });

  it("the company's color reaches the phone on refresh, and refresh never writes", async () => {
    const c = fake({ version: 1, palette: 'brand' });
    await refreshIndustry(c);
    expect(JSON.parse((await AsyncStorage.getItem('johnsons.theme')) as string).palette).toBe('brand');
    expect(c.calls.some((x) => x[1] === 'create' || x[1] === 'write')).toBe(false);
  });
});

describe('First-run setup', () => {
  it('is off in tests unless turned on', () => {
    expect(firstRunEnabled()).toBe(false);
  });

  it('the app starts on the setup screen when no database is saved', async () => {
    setFirstRunForTests(true);
    try {
      await renderApp('/');
      await settle(10);
      expect(screen.getByTestId('first-run-setup')).toBeTruthy();
      expect(screen.getByTestId('first-run-signin')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('first-run-skip'));
      await settle(10);
      expect(screen.queryByTestId('first-run-setup')).toBeNull();
    } finally {
      setFirstRunForTests(false);
    }
  });
});
