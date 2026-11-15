import AsyncStorage from '@react-native-async-storage/async-storage';
import { repaintRestart } from '../lib/useColorSchemeReload';

describe('repaintRestart', () => {
  beforeEach(() => AsyncStorage.clear());
  it('restarts once, then not again for the same colors', async () => {
    const restart = jest.fn(async () => undefined);
    expect(await repaintRestart('dark', restart)).toBe(true);
    expect(await repaintRestart('dark', restart)).toBe(false);
    expect(restart).toHaveBeenCalledTimes(1);
  });
  it('still switches the other way', async () => {
    const restart = jest.fn(async () => undefined);
    await repaintRestart('dark', restart);
    expect(await repaintRestart('light', restart)).toBe(true);
  });
});
