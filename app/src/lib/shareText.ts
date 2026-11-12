import { Platform } from 'react-native';

/**
 * Saves text to a file in the app's cache and opens the phone's share sheet
 * for it (email, messages, Drive...). Returns false where sharing isn't
 * there (tests, web).
 */
export async function shareTextFile(name: string, text: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  let fs: typeof import('expo-file-system');
  let sharing: typeof import('expo-sharing');
  try {
    fs = require('expo-file-system');
    sharing = require('expo-sharing');
  } catch {
    return false;
  }
  if (typeof fs.File !== 'function' || !(await sharing.isAvailableAsync().catch(() => false))) return false;
  const file = new fs.File(fs.Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  await sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: name });
  return true;
}
