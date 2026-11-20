const mockFiles = new Map<string, string>();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'doc' },
  File: class {
    key: string;
    constructor(dir: string, name: string) {
      this.key = `${dir}/${name}`;
    }
    get exists() {
      return mockFiles.has(this.key);
    }
    create() {
      mockFiles.set(this.key, '');
    }
    // Like the real one: asynchronous, so the caller must wait for it.
    write(text: string) {
      return new Promise<void>((r) => setTimeout(() => (mockFiles.set(this.key, text), r()), 10));
    }
    async text() {
      return mockFiles.get(this.key) as string;
    }
  },
}));
import { deviceSnapshots } from '../lib/dbSnapshots';

it('waits for the file to be written before it can be read back', async () => {
  const s = deviceSnapshots();
  await s.write('a|b', '{"x":"1"}');
  expect(await s.read('a|b')).toBe('{"x":"1"}');
  expect(await s.read('missing')).toBeNull();
});
