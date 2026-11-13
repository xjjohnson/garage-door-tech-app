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

  it('opens from the header on any section and links to the backend pages', async () => {
    const app = await renderApp('/diagnose');
    await fireEvent.press(screen.getByTestId('open-settings'));
    expect(app.getPathname()).toBe('/settings');
    for (const [id, path] of [
      ['settings-business', '/business'],
      ['settings-price-book', '/price-book'],
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
