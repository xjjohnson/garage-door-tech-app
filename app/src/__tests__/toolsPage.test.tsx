import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { loadProfile, teamHours } from '../lib/odooProfile';
import { STOCK_STORAGE_KEY } from '../lib/stock';
import { renderApp } from '../testing/renderApp';

const settle = async (n = 5) => {
  for (let k = 0; k < n; k++) await act(async () => undefined);
};

describe('Tools page layout', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('has the end-of-day button, the four tiles and no Settings row; the gear opens Settings', async () => {
    const app = await renderApp('/tools');
    await settle();
    expect(screen.getByTestId('tools-end-of-day')).toHaveTextContent('Wrap up the day');
    for (const id of ['tools-springs', 'tools-door-weight', 'tools-diagnose', 'tools-manuals']) expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.queryByTestId('tools-settings')).toBeNull();
    expect(screen.queryByTestId('tools-team')).toBeNull();
    expect(screen.queryByTestId('stock-alert')).toBeNull();
    await fireEvent.press(screen.getByTestId('open-settings'));
    expect(app.getPathname()).toBe('/settings');
  });

  it('shows one alert banner with a Review button when truck stock runs low', async () => {
    await AsyncStorage.setItem(
      STOCK_STORAGE_KEY,
      JSON.stringify({ items: [{ id: 'a', name: 'Rollers', sku: '', category: 'parts', onHand: 0, min: 2, par: 6, supplier: '', costCents: 0 }], suppliers: [], purchases: [] }),
    );
    const app = await renderApp('/tools');
    await settle();
    expect(screen.getByTestId('stock-alert')).toHaveTextContent(/Truck stock: 1 low/);
    await fireEvent.press(screen.getByLabelText('Review: Truck stock: 1 low'));
    expect(app.getPathname()).toBe('/stock');
  });

  it('Settings account card goes to Odoo sign-in when signed out', async () => {
    const app = await renderApp('/settings');
    await settle();
    await fireEvent.press(screen.getByTestId('settings-odoo'));
    expect(app.getPathname()).toBe('/team');
  });

  it('the profile page asks to sign in when signed out', async () => {
    await renderApp('/profile');
    await settle();
    expect(screen.getByTestId('profile-sign-in')).toBeTruthy();
  });
});

describe('Odoo profile', () => {
  it('reads the employee with tags, presence, certificates and badges', async () => {
    const call = jest.fn(async (model: string, method: string, args: unknown[]) => {
      if (method === 'fields_get' && model === 'hr.employee') {
        return {
          name: { type: 'char' },
          work_email: { type: 'char' },
          work_phone: { type: 'char' },
          mobile_phone: { type: 'char' },
          category_ids: { type: 'many2many', relation: 'hr.employee.category' },
          attendance_state: { type: 'selection' },
          x_portal_certs: { type: 'one2many', string: 'Portal Certificates', relation: 'x.cert' },
        };
      }
      if (method === 'fields_get') return { x_label: { type: 'char', string: 'Button Label' }, x_file: { type: 'binary', string: 'PDF' } };
      if (model === 'hr.employee' && method === 'search_read') {
        return [{ id: 7, name: 'Justin Johnson', work_email: 'j@x.com', work_phone: '5127367891', mobile_phone: '', category_ids: [3], attendance_state: 'checked_in' }];
      }
      if (model === 'hr.employee.category') return [{ id: 3, name: 'Founder' }];
      if (model === 'hr.employee' && method === 'read') return [{ id: 7, x_portal_certs: [11, 12] }];
      if (model === 'x.cert') return [{ id: 11, x_label: 'Residential Safety' }, { id: 12, x_label: 'Gate Safety' }];
      return [];
    });
    const p = await loadProfile({ call, session: { uid: 2 } } as never);
    expect(p).toMatchObject({ id: 7, name: 'Justin Johnson', tags: ['Founder'], present: true, badges: [] });
    expect(p?.certificates.map((c) => c.label)).toEqual(['Residential Safety', 'Gate Safety']);
  });

  it('returns null with no employee, and sums team hours', async () => {
    const none = jest.fn(async (_m: string, method: string) => (method === 'fields_get' ? {} : []));
    expect(await loadProfile({ call: none, session: { uid: 2 } } as never)).toBeNull();
    const att = jest.fn(async () => [
      { employee_id: [1, 'Ana'], worked_hours: 3 },
      { employee_id: [1, 'Ana'], worked_hours: 4.5 },
      { employee_id: [2, 'Bo'], worked_hours: 8 },
    ]);
    expect(await teamHours({ call: att, session: { uid: 2 } } as never, '2026-11-09 00:00:00')).toEqual([
      { name: 'Ana', hours: 7.5 },
      { name: 'Bo', hours: 8 },
    ]);
  });
});
