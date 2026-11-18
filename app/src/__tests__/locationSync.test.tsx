import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, waitFor } from '@testing-library/react-native';
import { OdooLocationSync } from '../components/OdooLocationSync';
import { saveShareLocation } from '../lib/locationPref';

const mockShare = jest.fn(async () => undefined);
let mockClockedIn = true;

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
  requestForegroundPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 30.2, longitude: -97.7 } }),
}));
jest.mock('../lib/odooLocation', () => ({ sharePosition: (...a: unknown[]) => mockShare(...(a as [])) }));
jest.mock('../lib/useOdoo', () => ({ useOdoo: () => ({ status: 'signedIn', client: { session: {} } }) }));
jest.mock('../lib/useWorkLog', () => ({ useWorkLog: () => ({ shifts: mockClockedIn ? [{ id: 's', start: 1, trips: [] }] : [] }) }));
jest.mock('../lib/worklog', () => ({ openShift: (s: unknown[]) => s[0] }));

beforeEach(async () => {
  mockShare.mockClear();
  mockClockedIn = true;
  await AsyncStorage.clear();
});

describe('sharing the truck position', () => {
  it('sends the position to Odoo while clocked in', async () => {
    await render(<OdooLocationSync />);
    await waitFor(() => expect(mockShare).toHaveBeenCalledWith(expect.anything(), 30.2, -97.7));
  });

  it('sends nothing when the tech has turned it off, or is not clocked in', async () => {
    await saveShareLocation(false);
    await render(<OdooLocationSync />);
    mockClockedIn = false;
    await render(<OdooLocationSync />);
    await new Promise((r) => setTimeout(r, 50));
    expect(mockShare).not.toHaveBeenCalled();
  });
});
