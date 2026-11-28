import { appIdFromPath, currentFlavor, FLAVORS, flavorForAppId } from '../flavor';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const build = require('../../flavors') as Record<string, { appId: string; manifestFile: string; apkFile: string; name: string }>;

describe('app versions (flavors)', () => {
  it('reads the app id from the phone folder path', () => {
    expect(appIdFromPath('file:///data/user/0/com.xjjohnson.fscrew/files/')).toBe('com.xjjohnson.fscrew');
    expect(appIdFromPath('file:///data/data/com.xjjohnson.garagedoortech/files/')).toBe('com.xjjohnson.garagedoortech');
    expect(appIdFromPath('file:///var/mobile/Containers/Data/Application/ABC/Documents/')).toBeNull();
    expect(appIdFromPath(undefined)).toBeNull();
  });

  it('knows each version by its app id, and anything unknown is Johnsons', () => {
    expect(flavorForAppId('com.xjjohnson.fscrew').id).toBe('fscrew');
    expect(flavorForAppId('com.xjjohnson.garagedoortech').id).toBe('johnsons');
    expect(flavorForAppId(null).id).toBe('johnsons');
    expect(flavorForAppId('com.someone.else').id).toBe('johnsons');
  });

  it('is Johnsons where the app folder is not an Android path (tests, old APKs)', () => {
    expect(currentFlavor().id).toBe('johnsons');
  });

  it('the build file and the app agree on ids and where each APK is announced', () => {
    for (const id of ['johnsons', 'fscrew'] as const) {
      expect(build[id].appId).toBe(FLAVORS[id].appId);
      expect(FLAVORS[id].manifestUrl.endsWith(`/${build[id].manifestFile}`)).toBe(true);
    }
    expect(new Set(Object.values(FLAVORS).map((f) => f.appId)).size).toBe(2);
    expect(new Set(Object.values(FLAVORS).map((f) => f.manifestUrl)).size).toBe(2);
    expect(build.johnsons.appId).toBe('com.xjjohnson.garagedoortech'); // phones update in place
  });

  it('app.config.js builds each version with its own name and id, and Johnsons by default', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const make = require('../../app.config.js') as (a: { config: Record<string, any> }) => Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const base = require('../../app.json').expo as Record<string, any>;
    const saved = process.env.APP_FLAVOR;
    try {
      delete process.env.APP_FLAVOR;
      expect(make({ config: base })).toMatchObject({ name: 'Johnsons', android: { package: 'com.xjjohnson.garagedoortech' }, extra: { flavor: 'johnsons' } });
      process.env.APP_FLAVOR = 'fscrew';
      const fs = make({ config: base });
      expect(fs).toMatchObject({ name: 'FS Crew', android: { package: 'com.xjjohnson.fscrew' }, extra: { flavor: 'fscrew', release: base.extra.release } });
      expect(fs.version).toBe(base.version); // same runtime version, so one update reaches both
      expect(fs.updates).toEqual(base.updates); // same channel
      process.env.APP_FLAVOR = 'nope';
      expect(() => make({ config: base })).toThrow(/Unknown APP_FLAVOR/);
    } finally {
      if (saved === undefined) delete process.env.APP_FLAVOR;
      else process.env.APP_FLAVOR = saved;
    }
  });
});
