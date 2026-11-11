/**
 * The Odoo password or API key, kept in the phone's keystore (expo-secure-store,
 * in the APK from 0.4.0), never in AsyncStorage or backups. Where the keystore
 * isn't there (web, or an older APK), nothing is saved and the tech signs in
 * again next time.
 */
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const NO_SECRETS: SecretStore = {
  get: async () => null,
  set: async () => undefined,
  remove: async () => undefined,
};

export function deviceSecrets(): SecretStore {
  let ss: typeof import('expo-secure-store');
  try {
    ss = require('expo-secure-store');
    if (typeof ss.getItemAsync !== 'function') return NO_SECRETS;
  } catch {
    return NO_SECRETS;
  }
  return {
    get: (k) => ss.getItemAsync(k).catch(() => null),
    set: (k, v) => ss.setItemAsync(k, v).catch(() => undefined),
    remove: (k) => ss.deleteItemAsync(k).catch(() => undefined),
  };
}
