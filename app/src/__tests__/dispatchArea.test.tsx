import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DispatchAreaScreen } from '../screens/DispatchAreaScreen';
import { NO_BADGES, setBadges } from '../lib/deptBadges';

let held: string[] = [];
const unassigned = [{ id: 603, name: 'Opener noisy', customer: 'Kim Ortega', address: '3 Pine', assignees: [], stage: 'New' }];

const mockClient = {
  session: { kind: 'oca', uid: 5, name: 'Dee', me: 9 },
  canSchedule: true,
  call: async (model: string, method: string, args: unknown[] = []) => {
    if (`${model}.${method}` === 'res.users.has_group') return held.includes(args[1] as string);
    return [];
  },
  unassignedTasks: async () => unassigned,
  jobsBetween: async () => [{ id: 601, name: 'Broken spring', customer: 'Pat Smith', assignees: [40], start: Date.now(), minutes: 60 }],
  techs: async () => [{ id: 40, name: 'Sam Ruiz', login: '' }],
};

jest.mock('../lib/useOdoo', () => ({ useOdoo: () => ({ status: 'signedIn', client: mockClient }) }));
jest.mock('../lib/useInvoices', () => ({ useInvoices: () => ({ business: { name: 'Johnsons' } }) }));

beforeEach(() => {
  held = [];
  setBadges(NO_BADGES);
});

describe('Dispatch area', () => {
  it('is closed to someone who is not a dispatcher', async () => {
    held = ['stock.group_stock_manager'];
    await render(<DispatchAreaScreen />);
    expect(await screen.findByTestId('dispatch-no-access')).toBeTruthy();
    expect(screen.queryByTestId('dispatch-tabs')).toBeNull();
  });

  it('shows the grouped list with a red number for jobs nobody has, and opens each page', async () => {
    held = ['fieldservice.group_fsm_dispatcher'];
    setBadges({ ...NO_BADGES, dispatch: { unassigned: 3 } });
    await render(<DispatchAreaScreen />);
    expect(await screen.findByTestId('dispatch-tabs')).toBeTruthy();
    expect(screen.getByText('Needs you now')).toBeTruthy();
    expect(screen.getByTestId('dispatch-tab-unassigned-badge')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('dispatch-tab-unassigned'));
    expect(await screen.findByTestId('dispatch-open-603')).toBeTruthy();
    // This page is only the jobs nobody has: no tech lanes.
    expect(screen.queryByTestId('dispatch-lane-40')).toBeNull();

    await fireEvent.press(screen.getByTestId('dispatch-back'));
    await fireEvent.press(await screen.findByTestId('dispatch-tab-board'));
    expect(await screen.findByTestId('dispatch-lane-40')).toBeTruthy();
    expect(screen.queryByTestId('dispatch-unassigned')).toBeNull();
  });
});
