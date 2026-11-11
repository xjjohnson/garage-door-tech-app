/**
 * The spring math lives outside the app (../spring-calc), where there is no
 * @babel/runtime to resolve. Some syntax (tuple destructuring, for one) makes
 * Babel import a runtime helper, which breaks the app's bundle and its tests.
 * This keeps every math file free of such imports.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
declare const require: { (id: string): any; resolve(id: string, opts?: { paths: string[] }): string };
declare const __dirname: string;
const babel = require('@babel/core');
const { readdirSync } = require('fs') as { readdirSync(p: string): string[] };
const { join } = require('path') as { join(...p: string[]): string };
const preset = require.resolve('babel-preset-expo', { paths: [require.resolve('expo')] });
const dir = join(__dirname, '../../../spring-calc/src');

describe('spring math bundles without the Babel runtime', () => {
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
    it(f, () => {
      const { code } = babel.transformFileSync(join(dir, f), { presets: [preset], babelrc: false, configFile: false, caller: { name: 'metro', platform: 'android' } });
      expect(code.match(/require\("@babel\/runtime[^"]*"\)/g) ?? []).toEqual([]);
    });
  }
});
