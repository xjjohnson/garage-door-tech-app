import { buildNumberFrom, formatBuildInfo } from '../lib/buildInfo';

const manifest = (versionCode?: unknown) => ({ extra: { expoClient: { android: { versionCode } } } });

describe('buildNumberFrom', () => {
  it('reads the build number from the running code', () => {
    expect(buildNumberFrom(manifest(7))).toBe(7);
  });
  it('ignores a missing or default build number', () => {
    expect(buildNumberFrom(undefined)).toBeUndefined();
    expect(buildNumberFrom({})).toBeUndefined();
    expect(buildNumberFrom(manifest(1))).toBeUndefined();
    expect(buildNumberFrom(manifest('7'))).toBeUndefined();
  });
});

describe('formatBuildInfo', () => {
  it('shows the installed build when no update is running', () => {
    expect(
      formatBuildInfo({ runtimeVersion: '0.1.0', updateId: null, createdAt: null, isEmbeddedLaunch: true, manifest: manifest(7) }),
    ).toBe('Version 0.1.0 · build 7 · as installed');
  });
  it('shows the update id and date when an update is running', () => {
    expect(
      formatBuildInfo({
        runtimeVersion: '0.1.0',
        updateId: '1a2b3c4d-5e6f-7081-92a3-b4c5d6e7f809',
        createdAt: new Date(2026, 10, 10, 12, 0),
        isEmbeddedLaunch: false,
        manifest: manifest(9),
      }),
    ).toBe('Version 0.1.0 · build 9 · update 1a2b3c4d, Nov 10');
  });
  it('leaves out what it does not know', () => {
    expect(
      formatBuildInfo({ runtimeVersion: '0.1.0', updateId: 'abcdef1234', createdAt: null, isEmbeddedLaunch: false, manifest: {} }),
    ).toBe('Version 0.1.0 · update abcdef12');
  });
  it('says so in development', () => {
    expect(formatBuildInfo({ runtimeVersion: null, updateId: null, createdAt: null, isEmbeddedLaunch: true, manifest: {} })).toBe(
      'Development version',
    );
  });
});
