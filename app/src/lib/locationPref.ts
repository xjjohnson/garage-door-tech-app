import AsyncStorage from '@react-native-async-storage/async-storage';

/** Whether this phone shares its position with Odoo while clocked in. On unless the tech turns it off. */
export const SHARE_LOCATION_KEY = 'johnsons.shareLocation';

export async function loadShareLocation(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SHARE_LOCATION_KEY)) !== 'off';
  } catch {
    return true;
  }
}

export async function saveShareLocation(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SHARE_LOCATION_KEY, on ? 'on' : 'off');
  } catch {
    // Not saved; it still applies until the app closes.
  }
}
