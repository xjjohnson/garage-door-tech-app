import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadThemePref, saveThemePref } from '../lib/themePref';

test('theme choice defaults to match phone and is saved', async () => {
  await AsyncStorage.clear();
  expect(await loadThemePref()).toBe('match');
  await saveThemePref('dark');
  expect(await loadThemePref()).toBe('dark');
  await saveThemePref('match');
  expect(await loadThemePref()).toBe('match');
});
