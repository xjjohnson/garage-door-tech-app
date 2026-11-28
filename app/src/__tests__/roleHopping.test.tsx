import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { RoleChip } from '../components/RoleChip';
import { setActiveRole } from '../lib/activeRole';
import { setRolePreviews } from '../lib/devFlags';
import { useDispatcherOnly, useSalesOnly, useTech } from '../lib/useDepartments';
import { useRoles } from '../lib/useRoles';
import { RolesScreen } from '../screens/RolesScreen';

let held: string[] = [];
const mockClient = {
  session: { kind: 'oca', uid: 5, name: 'Dee', me: 9, url: 'u', db: 'd', login: 'l' },
  call: async (model: string, method: string, args: unknown[] = []) => (`${model}.${method}` === 'res.users.has_group' ? held.includes(args[1] as string) : []),
};
jest.mock('../lib/useOdoo', () => ({ useOdoo: () => ({ status: 'signedIn', client: mockClient }) }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), router: { replace: (...a: unknown[]) => mockReplace(...a), navigate: jest.fn(), push: jest.fn() } }));

const DISPATCH = 'fieldservice.group_fsm_dispatcher';
const SALES = 'sales_team.group_sale_manager';

beforeEach(() => {
  held = [];
  mockReplace.mockClear();
  setActiveRole(null);
  setRolePreviews([]);
});

describe('working in more than one role', () => {
  it('one role means no start screen', async () => {
    const { result } = await renderHook(() => useRoles());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.roles).toEqual(['tech']);
    expect(result.current.needsPick).toBe(false);
    expect(result.current.current).toBe('tech');
  });

  it('two roles ask for a pick, then the bar follows the pick', async () => {
    held = [DISPATCH, SALES];
    const { result } = await renderHook(() => ({ r: useRoles(), sales: useSalesOnly(), disp: useDispatcherOnly(), tech: useTech() }));
    await waitFor(() => expect(result.current.r.needsPick).toBe(true));
    expect(result.current.r.roles).toEqual(['tech', 'dispatch', 'sales']);
    await act(async () => setActiveRole('sales'));
    await waitFor(() => expect(result.current.sales).toBe(true));
    expect(result.current.r.needsPick).toBe(false);
    expect(result.current.disp).toBe(false);
    await act(async () => setActiveRole('dispatch'));
    await waitFor(() => expect(result.current.disp).toBe(true));
    expect(result.current.sales).toBe(false);
    await act(async () => setActiveRole('tech'));
    await waitFor(() => expect(result.current.tech).toBe(true));
  });

  it('Developer can look as two roles at once', async () => {
    setRolePreviews(['dispatcher', 'sales']);
    const { result } = await renderHook(() => useRoles());
    await waitFor(() => expect(result.current.roles).toEqual(['tech', 'dispatch', 'sales']));
    expect(result.current.needsPick).toBe(true);
  });

  it('the start screen offers only the roles held and opens the pick', async () => {
    held = [DISPATCH, SALES];
    await render(<RolesScreen />);
    await waitFor(() => expect(screen.getByTestId('role-big')).toBeTruthy());
    expect(screen.getByTestId('role-big')).toHaveTextContent(/Dispatch/);
    expect(screen.getByTestId('role-sales')).toBeTruthy();
    expect(screen.getByTestId('role-tech')).toBeTruthy();
    expect(screen.queryByTestId('role-owner')).toBeNull();
    expect(screen.queryByTestId('role-warehouse')).toBeNull();
    await fireEvent.press(screen.getByTestId('role-sales'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    const { result } = await renderHook(() => useRoles());
    await waitFor(() => expect(result.current.current).toBe('sales'));
  });

  it('the role chip shows the current role and hops through a sheet', async () => {
    await render(<RoleChip roles={['tech', 'dispatch', 'sales']} current="dispatch" />);
    expect(screen.getByTestId('role-chip')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('role-chip'));
    expect(screen.getByTestId('role-sheet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('role-tech'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('the chip is hidden with one role', async () => {
    await render(<RoleChip roles={['tech']} current="tech" />);
    expect(screen.queryByTestId('role-chip')).toBeNull();
  });
});
