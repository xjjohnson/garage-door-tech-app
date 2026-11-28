import { act, screen } from '@testing-library/react-native';
import { resetLaunchPicked, setActiveRole } from '../lib/activeRole';
import { renderApp } from '../testing/renderApp';

let held: string[] = [];
const mockClient = {
  session: { kind: 'oca', uid: 5, name: 'Dee', me: 9, url: 'u', db: 'd', login: 'l', apps: { invoicing: false, sales: false, fieldservice: true, inventory: false, purchase: false, timesheets: false, helpdesk: false, attendance: false, project: false } },
  call: async (model: string, method: string, args: unknown[] = []) => (`${model}.${method}` === 'res.users.has_group' ? held.includes(args[1] as string) : []),
};
jest.mock('../lib/useOdoo', () => ({ ...jest.requireActual('../lib/useOdoo'), useOdoo: () => ({ status: 'signedIn', client: mockClient, saved: null, error: null, signIn: jest.fn(), signOut: jest.fn(), refresh: jest.fn() }) }));

const settle = async (n = 15) => {
  for (let k = 0; k < n; k++) await act(async () => undefined);
};

describe('launching the app', () => {
  beforeEach(() => {
    setActiveRole(null);
    resetLaunchPicked();
  });

  it('opens on the role screen, not stuck on Opening, for someone with more than one role', async () => {
    held = ['fieldservice.group_fsm_dispatcher', 'sales_team.group_sale_manager'];
    await renderApp('/');
    await settle();
    expect(screen.getByTestId('roles-screen')).toBeTruthy();
  });

  it('goes straight to the app for someone with one role', async () => {
    held = [];
    await renderApp('/');
    await settle();
    expect(screen.queryByTestId('roles-screen')).toBeNull();
    expect(screen.queryByTestId('opening-screen')).toBeNull();
  });
});
