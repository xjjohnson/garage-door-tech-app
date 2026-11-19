import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ReactNode } from 'react';
import { shortVersion } from '../lib/buildInfo';
import type { OtaApi } from '../lib/otaUpdate';
import { InvoicesProvider } from '../lib/useInvoices';
import { OdooProvider } from '../lib/useOdoo';
import { SettingsScreen } from '../screens/SettingsScreen';
import { renderApp } from '../testing/renderApp';

const wrap = ({ children }: { children: ReactNode }) => (
  <InvoicesProvider>
    <OdooProvider>{children}</OdooProvider>
  </InvoicesProvider>
);

async function settle() {
  for (let i = 0; i < 5; i++) await act(async () => undefined);
}

function fakeApi({ isEnabled = true, isAvailable = true, isNew = true, fail = false } = {}): OtaApi {
  return {
    isEnabled,
    checkForUpdateAsync: async () => {
      if (fail) throw new Error('Network request failed');
      return { isAvailable };
    },
    fetchUpdateAsync: async () => ({ isNew }),
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('shortVersion', () => {
  it('reads v and the version, or dev without one', () => {
    expect(shortVersion('0.4.0')).toBe('v0.4.0');
    expect(shortVersion(null)).toBe('dev');
  });
});

describe('Settings', () => {
  it('shows the build line and channel', async () => {
    await render(<SettingsScreen buildInfo="Version 0.4.0 · build 12 · as installed" channel="production" api={fakeApi()} />, { wrapper: wrap });
    await settle();
    expect(screen.getByTestId('build-info')).toHaveTextContent('Version 0.4.0 · build 12 · as installed');
    expect(screen.getByText('Update channel: production')).toBeTruthy();
    expect(screen.getByTestId('settings-odoo')).toHaveTextContent(/Not set up/);
  });

  it('checks for an update and offers a restart once it is downloaded', async () => {
    const restart = jest.fn(async () => undefined);
    await render(<SettingsScreen api={fakeApi()} restart={restart} />, { wrapper: wrap });
    await settle();
    expect(screen.queryByTestId('settings-restart')).toBeNull();
    await fireEvent.press(screen.getByTestId('settings-check-update'));
    await settle();
    expect(screen.getByTestId('settings-update-note')).toHaveTextContent(/Update downloaded/);
    await fireEvent.press(screen.getByTestId('settings-restart'));
    expect(restart).toHaveBeenCalled();
  });

  it('says when it is already current', async () => {
    await render(<SettingsScreen api={fakeApi({ isAvailable: false })} />, { wrapper: wrap });
    await settle();
    await fireEvent.press(screen.getByTestId('settings-check-update'));
    await settle();
    expect(screen.getByTestId('settings-update-note')).toHaveTextContent('You have the latest.');
    expect(screen.queryByTestId('settings-restart')).toBeNull();
  });

  it('says when there is no signal', async () => {
    await render(<SettingsScreen api={fakeApi({ fail: true })} />, { wrapper: wrap });
    await settle();
    await fireEvent.press(screen.getByTestId('settings-check-update'));
    await settle();
    expect(screen.getByTestId('settings-update-note')).toHaveTextContent(/Couldn't reach the update server/);
  });

  it('opens from the gear on Tools (and nowhere else) and links to the backend pages', async () => {
    const app = await renderApp('/diagnose');
    expect(screen.queryByTestId('open-settings')).toBeNull();
    await act(async () => router.navigate('/tools'));
    await fireEvent.press(screen.getByTestId('open-settings'));
    expect(app.getPathname()).toBe('/settings');
    for (const [id, path] of [
      ['settings-management', '/management'],
      ['settings-odoo', '/team'],
      ['settings-backup', '/backup'],
    ] as const) {
      await fireEvent.press(screen.getByTestId(id));
      expect(app.getPathname()).toBe(path);
      await act(async () => router.back());
      expect(app.getPathname()).toBe('/settings');
    }
  });
});

describe('Settings theme', () => {
  it('saves a theme pick and offers a restart, and can go back to Classic', async () => {
    const restart = jest.fn(async () => undefined);
    await render(<SettingsScreen api={fakeApi()} restart={restart} />, { wrapper: wrap });
    await settle();
    expect(screen.queryByTestId('settings-look-restart')).toBeNull();
    await fireEvent.press(screen.getByTestId('settings-theme-office'));
    await settle();
    const saved = JSON.parse((await AsyncStorage.getItem('johnsons.theme')) as string);
    expect(saved).toEqual({ theme: 'office', palette: 'johnsons' });
    await fireEvent.press(screen.getByTestId('settings-look-restart'));
    expect(restart).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('settings-look-legacy'));
    await settle();
    expect(JSON.parse((await AsyncStorage.getItem('johnsons.theme')) as string)).toEqual({ theme: 'classic', palette: 'johnsons' });
  });

  it('lists all six themes plus Classic', async () => {
    await render(<SettingsScreen api={fakeApi()} />, { wrapper: wrap });
    await settle();
    for (const id of ['classic', 'field', 'dispatch', 'office', 'owner', 'map', 'simple']) expect(screen.getByTestId(`settings-theme-${id}`)).toBeTruthy();
  });
});
