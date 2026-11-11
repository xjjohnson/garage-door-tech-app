import { buildNumberFrom, displayVersion, formatBuildInfo, releaseFrom } from '../lib/buildInfo';

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

describe('release numbers', () => {
  const withRelease = (release: unknown) => ({ extra: { expoClient: { extra: { release }, android: { versionCode: 9 } } } });

  it('shows the release of the running update, with the APK version beside it', () => {
    expect(releaseFrom(withRelease('0.4.3'))).toBe('0.4.3');
    expect(displayVersion('0.4.0', withRelease('0.4.3'))).toBe('0.4.3');
    expect(
      formatBuildInfo({ runtimeVersion: '0.4.0', updateId: 'abcdef1234', createdAt: null, isEmbeddedLaunch: false, manifest: withRelease('0.4.3') }),
    ).toBe('Version 0.4.3 · APK 0.4.0 · build 9 · update abcdef12');
  });

  it('falls back to the APK version for code from before releases were numbered', () => {
    expect(releaseFrom(withRelease(undefined))).toBeUndefined();
    expect(releaseFrom(withRelease('next'))).toBeUndefined();
    expect(displayVersion('0.4.0', {})).toBe('0.4.0');
    expect(displayVersion(null, withRelease('0.4.3'))).toBeNull();
  });

  it('leaves out the APK part when they match', () => {
    expect(
      formatBuildInfo({ runtimeVersion: '0.5.0', updateId: null, createdAt: null, isEmbeddedLaunch: true, manifest: withRelease('0.5.0') }),
    ).toBe('Version 0.5.0 · build 9 · as installed');
  });
});

describe('app.json release number', () => {
  // The bump rule (app/README.md, "Release numbers"): every change that ships
  // goes up one in extra.release; a new APK sets version and release to X.Y.0.
  const expo = require('../../app.json').expo;
  const parse = (v: string) => v.split('.').map(Number);

  it('is a plain x.y.z on the same x.y as the APK version, never below it', () => {
    expect(expo.extra.release).toMatch(/^\d+\.\d+\.\d+$/);
    const [rMaj, rMin, rPatch] = parse(expo.extra.release);
    const [vMaj, vMin, vPatch] = parse(expo.version);
    expect([rMaj, rMin]).toEqual([vMaj, vMin]);
    expect(rPatch).toBeGreaterThanOrEqual(vPatch);
  });
});
