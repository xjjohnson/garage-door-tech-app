import { fireEvent, render, screen } from '@testing-library/react-native';
import { DispatchMore } from '../screens/DispatchMore';

jest.mock('../lib/useOdoo', () => ({ useOdoo: () => ({ status: 'signedIn', client: { session: { uid: 1 }, call: async () => [], jobsWithoutDate: async () => [], unassignedTasks: async () => [], jobsBetween: async () => [], techs: async () => [] } }) }));
jest.mock('../screens/DispatchScreen', () => ({ DispatchScreen: () => null }));
jest.mock('../screens/DispatchTeamPages', () => ({ FollowUpsDue: () => null, TimeOff: () => null, TruckAlerts: () => null, WhoIsWorking: () => null }));

describe('dispatcher More', () => {
  it('opens a page and comes back with the ‹ More button', async () => {
    await render(<DispatchMore />);
    await fireEvent.press(screen.getByTestId('more-waiting'));
    expect(screen.queryByTestId('dispatch-more')).toBeNull();
    await fireEvent.press(screen.getByTestId('dispatch-more-back'));
    expect(screen.getByTestId('dispatch-more')).toBeTruthy();
  });
});
