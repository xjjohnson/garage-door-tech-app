import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { RoleChip } from '../components/RoleChip';
import { setActiveRole } from '../lib/activeRole';
import { setRolePreviews } from '../lib/devFlags';
import { useDispatcherOnly, useSalesOnly, useTech } from '../lib/useDepartments';
import { useRoles } from '../lib/useRoles';
import { RolesScreen } from '../screens/RolesScreen';
import { useRoleTheme } from '../lib/useRoleTheme';
import { switchRole } from '../lib/roleSwitch';
import { applyTheme, colors, themeDef } from '../theme';

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
const TECH = 'fieldservice.group_fsm_user';

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
    expect(result.current.r.roles).toEqual(['dispatch', 'sales']); // a dispatcher is not a tech
    await act(async () => setActiveRole('sales'));
    await waitFor(() => expect(result.current.sales).toBe(true));
    expect(result.current.r.needsPick).toBe(false);
    expect(result.current.disp).toBe(false);
    await act(async () => setActiveRole('dispatch'));
    await waitFor(() => expect(result.current.disp).toBe(true));
    expect(result.current.sales).toBe(false);
  });

  it('a tech who also sells can work in either', async () => {
    held = [SALES, TECH];
    const { result } = await renderHook(() => ({ r: useRoles(), tech: useTech(), sales: useSalesOnly() }));
    await waitFor(() => expect(result.current.r.roles).toEqual(['tech', 'sales']));
    await act(async () => setActiveRole('tech'));
    await waitFor(() => expect(result.current.tech).toBe(true));
    await act(async () => setActiveRole('sales'));
    await waitFor(() => expect(result.current.sales).toBe(true));
  });

  it('Developer can look as two roles at once', async () => {
    setRolePreviews(['dispatcher', 'sales']);
    const { result } = await renderHook(() => useRoles());
    await waitFor(() => expect(result.current.roles).toEqual(['dispatch', 'sales']));
    expect(result.current.needsPick).toBe(true);
  });

  it('the start screen offers only the roles held and opens the pick', async () => {
    held = [DISPATCH, SALES];
    await render(<RolesScreen />);
    await waitFor(() => expect(screen.getByTestId('role-big')).toBeTruthy());
    expect(screen.getByTestId('role-big')).toHaveTextContent(/Dispatch/);
    expect(screen.getByTestId('role-sales')).toBeTruthy();
    expect(screen.queryByTestId('role-tech')).toBeNull(); // not assigned
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

  it('switching roles changes the look at once, with no restart', async () => {
    await act(async () => applyTheme('classic'));
    const before = colors.bg;
    await act(async () => switchRole('owner'));
    expect(themeDef.id).toBe('owner');
    expect(colors.bg).not.toBe(before);
    await act(async () => switchRole('dispatch'));
    expect(themeDef.id).toBe('dispatch');
  });

  it('the first launch applies the role theme live too', async () => {
    await act(async () => applyTheme('classic'));
    held = [DISPATCH];
    await renderHook(() => useRoleTheme());
    await waitFor(() => expect(themeDef.id).toBe('dispatch'));
  });
});
