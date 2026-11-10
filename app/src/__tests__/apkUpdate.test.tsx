import { fireEvent, render, screen } from '@testing-library/react-native';
import { ApkUpdateBanner } from '../components/ApkUpdateBanner';
import { checkForApk, compareVersions, parseManifest } from '../lib/apkUpdate';

const URL = 'https://example.com/version.json';
const APK = 'https://example.com/spring-calc.apk';

function fakeFetch(body: unknown, ok = true) {
  return jest.fn(async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
}

describe('compareVersions', () => {
  it('compares part by part as numbers', () => {
    expect(compareVersions('0.2.0', '0.1.0')).toBe(1);
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
    expect(compareVersions('0.1', '0.1.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
  });
});

describe('parseManifest', () => {
  it('accepts a version and an https link', () => {
    expect(parseManifest({ version: '0.2.0', apkUrl: APK })).toEqual({ version: '0.2.0', apkUrl: APK });
  });
  it('rejects anything else', () => {
    expect(parseManifest(null)).toBeUndefined();
    expect(parseManifest({ version: '0.2.0', apkUrl: 'http://example.com/a.apk' })).toBeUndefined();
    expect(parseManifest({ version: '0.2.0', apkUrl: 'javascript:alert(1)' })).toBeUndefined();
    expect(parseManifest({ version: 'latest', apkUrl: APK })).toBeUndefined();
    expect(parseManifest({ version: 2, apkUrl: APK })).toBeUndefined();
  });
});

describe('checkForApk', () => {
  it('is off without an address or outside an APK', async () => {
    const f = fakeFetch({});
    expect(await checkForApk('', '0.1.0', f)).toEqual({ status: 'off' });
    expect(await checkForApk(URL, null, f)).toEqual({ status: 'off' });
    expect(f).not.toHaveBeenCalled();
  });
  it('reports a newer APK', async () => {
    expect(await checkForApk(URL, '0.1.0', fakeFetch({ version: '0.2.0', apkUrl: APK }))).toEqual({ status: 'update', version: '0.2.0', apkUrl: APK });
  });
  it('stays quiet when the APK is current or newer', async () => {
    expect(await checkForApk(URL, '0.2.0', fakeFetch({ version: '0.2.0', apkUrl: APK }))).toEqual({ status: 'current' });
    expect(await checkForApk(URL, '0.3.0', fakeFetch({ version: '0.2.0', apkUrl: APK }))).toEqual({ status: 'current' });
  });
  it('never throws on no signal or a bad file', async () => {
    const offline = jest.fn(async () => {
      throw new Error('Network request failed');
    }) as unknown as typeof fetch;
    expect(await checkForApk(URL, '0.1.0', offline)).toEqual({ status: 'unknown' });
    expect(await checkForApk(URL, '0.1.0', fakeFetch({}, false))).toEqual({ status: 'unknown' });
    expect(await checkForApk(URL, '0.1.0', fakeFetch({ nope: true }))).toEqual({ status: 'unknown' });
  });
});

describe('ApkUpdateBanner', () => {
  it('offers the download when a newer APK exists', async () => {
    const openUrl = jest.fn(async () => true);
    await render(<ApkUpdateBanner manifestUrl={URL} currentVersion="0.1.0" fetchImpl={fakeFetch({ version: '0.2.0', apkUrl: APK })} openUrl={openUrl} />);
    expect(await screen.findByTestId('apk-update-banner')).toBeTruthy();
    expect(screen.getByText('New app version 0.2.0')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('apk-download'));
    expect(openUrl).toHaveBeenCalledWith(APK);
  });
  it('hides on Later', async () => {
    await render(<ApkUpdateBanner manifestUrl={URL} currentVersion="0.1.0" fetchImpl={fakeFetch({ version: '0.2.0', apkUrl: APK })} openUrl={jest.fn()} />);
    await screen.findByTestId('apk-update-banner');
    await fireEvent.press(screen.getByTestId('apk-later'));
    expect(screen.queryByTestId('apk-update-banner')).toBeNull();
  });
  it('shows nothing when the APK is current', async () => {
    const f = fakeFetch({ version: '0.1.0', apkUrl: APK });
    await render(<ApkUpdateBanner manifestUrl={URL} currentVersion="0.1.0" fetchImpl={f} openUrl={jest.fn()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(f).toHaveBeenCalled();
    expect(screen.queryByTestId('apk-update-banner')).toBeNull();
  });
});
