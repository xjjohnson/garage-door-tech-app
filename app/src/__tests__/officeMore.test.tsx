import { render, screen } from '@testing-library/react-native';
import ToolsRoute from '../app/(tabs)/tools';
import { OfficeMore } from '../screens/OfficeMore';

let mockOfficeOnly = true;
jest.mock('../lib/useDepartments', () => ({
  ...jest.requireActual('../lib/useDepartments'),
  useDispatcherOnly: () => false,
  useOfficeOnly: () => mockOfficeOnly,
  useSalesOnly: () => false,
  useDepartments: () => ({ access: { owner: false, office: true, sales: false, dispatch: false, warehouse: false, purchasing: false }, ready: true }),
  useOwner: () => ({ owner: false, ready: true }),
}));
jest.mock('../screens/ToolsScreen', () => {
  const { View } = require('react-native');
  return { ToolsScreen: () => <View testID="tools" /> };
});
jest.mock('../components/SectionScroll', () => ({ SectionScroll: ({ children }: { children: React.ReactNode }) => children }));

const FIELD_AND_TRUCK = ['tools-springs', 'tools-door-weight', 'tools-diagnose', 'tools-manuals', 'tools-end-of-day', 'open-stock', 'tools-schedule', 'stock-alert'];

describe('office-only More', () => {
  it('shows office items and none of the field or truck tools', async () => {
    await render(<OfficeMore />);
    expect(screen.getByTestId('more-office')).toBeTruthy();
    expect(screen.getByTestId('more-price-book')).toBeTruthy();
    expect(screen.getByTestId('more-followups')).toBeTruthy();
    for (const id of FIELD_AND_TRUCK) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.queryByText('Wrap up the day')).toBeNull();
    expect(screen.queryByText('In the field')).toBeNull();
    expect(screen.queryByText('Truck and day')).toBeNull();
  });

  it('is what the More tab draws for an Office-only person', async () => {
    mockOfficeOnly = true;
    await render(<ToolsRoute />);
    expect(screen.getByTestId('office-more')).toBeTruthy();
    expect(screen.queryByTestId('tools')).toBeNull();
  });

  it('leaves the full Tools screen for everyone else', async () => {
    mockOfficeOnly = false;
    await render(<ToolsRoute />);
    expect(screen.getByTestId('tools')).toBeTruthy();
    expect(screen.queryByTestId('office-more')).toBeNull();
  });
});
