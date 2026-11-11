import { Platform } from 'react-native';

/** What the Backup screen needs from the phone to write and read backup files. */
export interface BackupFiles {
  /**
   * Asks the tech for a folder (Downloads, Google Drive, an SD card...) and
   * writes the file there. Resolves to the folder's name, or null if they
   * backed out of the picker.
   */
  save(name: string, text: string): Promise<string | null>;
  /** Asks the tech to pick a backup file and reads it. Null if they backed out. */
  pick(): Promise<string | null>;
}

/**
 * The phone's own folder and file pickers, through expo-file-system (already
 * built into the APK, so this ships over the air). Null on the web build and
 * in tests; the screen then says backups need the phone app.
 */
export function deviceBackupFiles(): BackupFiles | null {
  if (Platform.OS === 'web') return null;
  let fs: typeof import('expo-file-system');
  try {
    fs = require('expo-file-system');
  } catch {
    return null;
  }
  const { Directory, File } = fs;
  if (typeof Directory?.pickDirectoryAsync !== 'function' || typeof File?.pickFileAsync !== 'function') return null;
  return {
    async save(name, text) {
      let dir: InstanceType<typeof Directory>;
      try {
        dir = await Directory.pickDirectoryAsync();
      } catch (e) {
        if (isCancel(e)) return null;
        throw e;
      }
      if (!dir) return null;
      const file = dir.createFile(name, 'application/json');
      await file.write(text);
      return dir.name || 'the folder you picked';
    },
    async pick() {
      let picked;
      try {
        // Drive and some file apps label .json files as plain text or "binary".
        picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/plain', 'application/octet-stream'] });
      } catch (e) {
        if (isCancel(e)) return null;
        throw e;
      }
      if (picked.canceled) return null;
      return picked.result.text();
    },
  };
}

function isCancel(e: unknown): boolean {
  return /cancel/i.test(String((e as { message?: unknown })?.message ?? e));
}
