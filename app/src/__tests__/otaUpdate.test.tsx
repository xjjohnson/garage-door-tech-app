import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { ApkUpdateBanner } from '../components/ApkUpdateBanner';
import { UpdateReadyBar } from '../components/UpdateReadyBar';
import { checkAndFetchOta, isCheckDue, OTA_CHECK_GAP_MS, type OtaApi } from '../lib/otaUpdate';

function fakeApi({ isEnabled = true, isAvailable = true, isNew = true, fail = false } = {}) {
  return {
    isEnabled,
    checkForUpdateAsync: jest.fn(async () => {
      if (fail) throw new Error('Network request failed');
      return { isAvailable };
    }),
    fetchUpdateAsync: jest.fn(async () => ({ isNew })),
  } satisfies OtaApi;
}

/** Capture the AppState listener so a test can send the app away and back. */
function captureAppState() {
  let listener: ((s: AppStateStatus) => void) | undefined;
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
    listener = fn as (s: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  return {
    spy,
    async goAwayAndBack() {
      await act(async () => {
        listener?.('background');
        listener?.('active');
        await Promise.resolve();
      });
    },
  };
}

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

afterEach(() => jest.restoreAllMocks());

describe('isCheckDue', () => {
  it('is due the first time and after the gap, not before', () => {
    expect(isCheckDue(undefined, 1000)).toBe(true);
    expect(isCheckDue(1000, 1000 + OTA_CHECK_GAP_MS - 1)).toBe(false);
    expect(isCheckDue(1000, 1000 + OTA_CHECK_GAP_MS)).toBe(true);
  });
});

describe('checkAndFetchOta', () => {
  it('is off in Expo Go and dev builds', async () => {
    const api = fakeApi({ isEnabled: false });
    expect(await checkAndFetchOta(api)).toBe('off');
    expect(api.checkForUpdateAsync).not.toHaveBeenCalled();
  });
  it('downloads a new update and says it is ready', async () => {
    const api = fakeApi();
    expect(await checkAndFetchOta(api)).toBe('ready');
    expect(api.fetchUpdateAsync).toHaveBeenCalled();
  });
  it('stays quiet when nothing is new', async () => {
    const api = fakeApi({ isAvailable: false });
    expect(await checkAndFetchOta(api)).toBe('current');
    expect(api.fetchUpdateAsync).not.toHaveBeenCalled();
    expect(await checkAndFetchOta(fakeApi({ isNew: false }))).toBe('current');
  });
  it('never throws with no signal', async () => {
    expect(await checkAndFetchOta(fakeApi({ fail: true }))).toBe('unknown');
  });
});

describe('UpdateReadyBar', () => {
  it('shows nothing when there is no update', async () => {
    await render(<UpdateReadyBar api={fakeApi({ isAvailable: false })} restart={jest.fn()} />);
    await flush();
    expect(screen.queryByTestId('update-ready-bar')).toBeNull();
  });

  it('shows the bar when launch already downloaded an update', async () => {
    await render(<UpdateReadyBar pending api={fakeApi({ isAvailable: false })} restart={jest.fn()} />);
    expect(screen.getByTestId('update-ready-bar')).toBeTruthy();
  });

  it('finds an update on open and restarts into it only on tap', async () => {
    const restart = jest.fn(async () => undefined);
    await render(<UpdateReadyBar api={fakeApi()} restart={restart} />);
    expect(await screen.findByTestId('update-ready-bar')).toBeTruthy();
    expect(screen.getByText('Update ready')).toBeTruthy();
    expect(restart).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('update-restart'));
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('says so when the restart fails', async () => {
    const restart = jest.fn(async () => {
      throw new Error('not allowed');
    });
    await render(<UpdateReadyBar pending api={fakeApi({ isAvailable: false })} restart={restart} />);
    await fireEvent.press(screen.getByTestId('update-restart'));
    await flush();
    expect(screen.getByText(/Close and reopen the app/)).toBeTruthy();
  });

  it('hides on Later', async () => {
    await render(<UpdateReadyBar pending api={fakeApi({ isAvailable: false })} restart={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('update-later'));
    expect(screen.queryByTestId('update-ready-bar')).toBeNull();
  });

  it('looks again when the app comes back, at most every ten minutes', async () => {
    const appState = captureAppState();
    let clock = 0;
    const api = fakeApi({ isAvailable: false });
    await render(<UpdateReadyBar api={api} restart={jest.fn()} now={() => clock} />);
    await flush();
    expect(api.checkForUpdateAsync).toHaveBeenCalledTimes(1);

    clock = 60 * 1000; // a minute later: too soon
    await appState.goAwayAndBack();
    expect(api.checkForUpdateAsync).toHaveBeenCalledTimes(1);

    api.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    clock = OTA_CHECK_GAP_MS + 1;
    await appState.goAwayAndBack();
    await flush();
    expect(api.checkForUpdateAsync).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('update-ready-bar')).toBeTruthy();
  });
});

describe('ApkUpdateBanner re-check', () => {
  const URL = 'https://example.com/version.json';
  const APK = 'https://example.com/spring-calc.apk';

  it('looks again when the app comes back after the gap', async () => {
    const appState = captureAppState();
    let clock = 0;
    let body: unknown = { version: '0.1.0', apkUrl: APK };
    const f = jest.fn(async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;
    await render(<ApkUpdateBanner manifestUrl={URL} currentVersion="0.1.0" fetchImpl={f} openUrl={jest.fn()} now={() => clock} />);
    await flush();
    expect(screen.queryByTestId('apk-update-banner')).toBeNull();

    body = { version: '0.3.0', apkUrl: APK };
    clock = OTA_CHECK_GAP_MS;
    await appState.goAwayAndBack();
    await flush();
    expect(f).toHaveBeenCalledTimes(2);
    expect(screen.getByText('New app version 0.3.0')).toBeTruthy();
  });
});
