/**
 * Where database snapshots are kept: plain files in the app's own folder on the phone
 * (expo-file-system, already in the APK). Where files aren't available (tests, web) the
 * store refuses, and switching says it can't keep the data safe rather than risk it.
 */
import type { SnapshotStore } from './dbSwitch';

const fileName = (id: string) => `db-snapshot-${id.replace(/[^a-z0-9]+/gi, '_')}.json`;

export function deviceSnapshots(): SnapshotStore {
  const fs = () => require('expo-file-system') as typeof import('expo-file-system');
  return {
    async read(id) {
      try {
        const { File, Paths } = fs();
        const f = new File(Paths.document, fileName(id));
        return f.exists ? await f.text() : null;
      } catch {
        return null;
      }
    },
    async write(id, text) {
      const { File, Paths } = fs();
      const f = new File(Paths.document, fileName(id));
      if (!f.exists) f.create();
      f.write(text);
    },
  };
}
