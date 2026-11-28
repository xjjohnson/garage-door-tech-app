import { act, render, screen, waitFor } from '@testing-library/react-native';
import { OwnerOnly } from '../components/OwnerOnly';
import { setRolePreview } from '../lib/devFlags';
import { ToolsScreen } from '../screens/ToolsScreen';
import { Text } from 'react-native';

let held: string[] = [];
const mockClient = {
  session: { kind: 'oca', uid: 5, name: 'Sam' },
  call: async (model: string, method: string, args: unknown[] = []) => {
    if (`${model}.${method}` === 'res.users.has_group') return held.includes(args[1] as string);
    return [];
  },
};
jest.mock('../lib/useOdoo', () => ({ useOdoo: () => ({ status: 'signedIn', client: mockClient }) }));

jest.mock('../lib/useStock', () => ({ useStock: () => ({ items: [] }) }));
jest.mock('../lib/useWorkLog', () => ({ useWorkLog: () => ({ shifts: [] }) }));
jest.mock('../lib/useFollowUps', () => ({ useFollowUps: () => ({ settings: {}, dismissed: [] }) }));
jest.mock('../lib/followups', () => ({ followUps: () => [] }));
jest.mock('../lib/useInvoices', () => ({ useInvoices: () => ({ invoices: [], business: {} }) }));
jest.mock('../lib/useStats', () => ({ useStats: () => ({ stats: { openJobs: 0, owed: 0, week: { collected: 0 }, months: [] }, fromOdoo: false }) }));

beforeEach(() => {
  held = [];
  setRolePreview(null);
});

describe('owner-only screens', () => {
  it('shows an owner page to the owner and a note to a tech', async () => {
    held = ['base.group_system'];
    await render(<OwnerOnly what="Management"><Text>secret</Text></OwnerOnly>);
    await waitFor(() => expect(screen.getByText('secret')).toBeTruthy());
    await screen.unmount();
    held = ['stock.group_stock_manager'];
    await render(<OwnerOnly what="Management"><Text>secret</Text></OwnerOnly>);
    await waitFor(() => expect(screen.getByTestId('owner-only')).toBeTruthy());
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('Tools hides owner rows for a tech but keeps job tools and the price book', async () => {
    held = [];
    await render(<ToolsScreen />);
    expect(await screen.findByTestId('tools-price-book')).toBeTruthy();
    expect(screen.queryByTestId('tools-stats')).toBeNull();
    expect(screen.queryByTestId('tools-scorecard')).toBeNull();
    expect(screen.queryByTestId('stats-card')).toBeNull();
    expect(screen.getByTestId('open-time-log')).toBeTruthy();
    expect(screen.getByTestId('tools-springs')).toBeTruthy();
  });

  it('The owner bar keeps Tools to the field and day tools: business numbers, price book and departments live in Money, Areas and Manage', async () => {
    held = ['base.group_system'];
    await render(<ToolsScreen />);
    expect(await screen.findByTestId('tools-springs')).toBeTruthy();
    expect(screen.getByTestId('open-time-log')).toBeTruthy();
    expect(screen.queryByTestId('tools-scorecard')).toBeNull();
    expect(screen.queryByTestId('tools-price-book')).toBeNull();
    expect(screen.queryByTestId('tools-warehouse')).toBeNull();
    expect(screen.queryByTestId('stats-card')).toBeNull();
  });

  it('A warehouse-only person gets the shop tools and none of the field tools', async () => {
    held = ['stock.group_stock_manager'];
    await render(<ToolsScreen />);
    expect(await screen.findByTestId('open-stock')).toBeTruthy();
    expect(screen.getByTestId('tools-price-book')).toBeTruthy();
    for (const id of ['tools-end-of-day', 'tools-springs', 'tools-door-weight', 'tools-diagnose', 'tools-manuals', 'tools-schedule', 'tools-followups']) expect(screen.queryByTestId(id)).toBeNull();
  });

  it('Look as a tech takes the owner rows and departments away at once, and Developer still opens for the owner', async () => {
    held = ['base.group_system'];
    await render(<ToolsScreen />);
    expect(await screen.findByTestId('tools-springs')).toBeTruthy();
    await act(async () => setRolePreview('tech'));
    await waitFor(() => expect(screen.queryByTestId('tools-scorecard')).toBeNull());
    expect(screen.queryByTestId('tools-warehouse')).toBeNull();
    expect(screen.queryByTestId('tools-purchasing')).toBeNull();
    await render(<OwnerOnly what="Developer" realOwner><Text>dev</Text></OwnerOnly>);
    await waitFor(() => expect(screen.getByText('dev')).toBeTruthy());
    await screen.unmount();
    await render(<OwnerOnly what="Management"><Text>mgmt</Text></OwnerOnly>);
    await waitFor(() => expect(screen.getByTestId('owner-only')).toBeTruthy());
  });
});
