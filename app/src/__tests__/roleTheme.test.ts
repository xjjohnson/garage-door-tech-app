import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadLook, loadLookSource, saveLook } from '../lib/lookPref';
import { roleDefaultTheme } from '../lib/themes';
import { pendingRoleTheme } from '../lib/useRoleTheme';

const none = { owner: false, dispatch: false, office: false, sales: false, warehouse: false, purchasing: false };

describe('role default theme', () => {
  beforeEach(() => AsyncStorage.clear());

  it('picks the theme for each role, owner first', () => {
    expect(roleDefaultTheme(none)).toBeNull();
    expect(roleDefaultTheme({ ...none, dispatch: true })).toBe('dispatch');
    expect(roleDefaultTheme({ ...none, office: true })).toBe('office');
    expect(roleDefaultTheme({ ...none, sales: true })).toBe('sales');
    expect(roleDefaultTheme({ ...none, warehouse: true })).toBe('warehouse');
    expect(roleDefaultTheme({ ...none, purchasing: true })).toBe('warehouse');
    expect(roleDefaultTheme({ ...none, owner: true, dispatch: true, office: true })).toBe('owner');
    expect(roleDefaultTheme({ ...none, dispatch: true, office: true, sales: true })).toBe('dispatch');
    expect(roleDefaultTheme({ ...none, office: true, sales: true, warehouse: true })).toBe('office');
    expect(roleDefaultTheme({ ...none, sales: true, warehouse: true })).toBe('sales');
  });

  it('applies the role theme when nothing is saved', async () => {
    expect(await pendingRoleTheme('office')).toBe('office');
    expect(await pendingRoleTheme(null)).toBeNull();
  });

  it('never replaces a theme the person picked', async () => {
    await saveLook({ theme: 'classic', palette: 'johnsons' });
    expect(await loadLookSource()).toBe('manual');
    expect(await pendingRoleTheme('owner')).toBeNull();
  });

  it('keeps an old saved pick (saved before this change) as the person\'s own', async () => {
    await AsyncStorage.setItem('johnsons.theme', JSON.stringify({ theme: 'field', palette: 'brand' }));
    expect(await pendingRoleTheme('sales')).toBeNull();
  });

  it('saves the role theme as automatic, keeps the palette, and does not repeat', async () => {
    await saveLook({ theme: 'office', palette: 'brand' }, true);
    expect(await loadLookSource()).toBe('auto');
    expect(await loadLook()).toEqual({ theme: 'office', palette: 'brand' });
    expect(await pendingRoleTheme('office')).toBeNull();
  });

  it('changes an automatic theme when the role changes', async () => {
    await saveLook({ theme: 'sales', palette: 'johnsons' }, true);
    expect(await pendingRoleTheme('owner')).toBe('owner');
  });
});
