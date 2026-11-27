import { renderHook, waitFor } from '@testing-library/react-native';
import { setRolePreview } from '../lib/devFlags';
import { barFor, DISPATCH_ONLY_HREFS, SECTIONS } from '../lib/sections';
import { useDispatcherOnly } from '../lib/useDepartments';

let held: string[] = [];
let mockSignedIn = true;
const mockClient = {
  session: { kind: 'oca', uid: 5, name: 'Dee', me: 9 },
  call: async (model: string, method: string, args: unknown[] = []) => (`${model}.${method}` === 'res.users.has_group' ? held.includes(args[1] as string) : []),
};
jest.mock('../lib/useOdoo', () => ({ useOdoo: () => (mockSignedIn ? { status: 'signedIn', client: mockClient } : { status: 'signedOut', client: null }) }));

const hrefs = (kind: 'dispatcher' | 'tech' | 'other') => barFor(kind).map((id) => SECTIONS.find((s) => s.id === id)?.href);

beforeEach(() => {
  held = [];
  mockSignedIn = true;
  setRolePreview(null);
});

describe('dispatcher bottom bar', () => {
  it('is Today, Jobs, Needs you, Week and More, with no Customers, Sales or field tools', () => {
    expect(hrefs('dispatcher')).toEqual(['/', '/jobs', '/needs', '/week', '/tools']);
    expect(DISPATCH_ONLY_HREFS).toEqual(['/needs', '/week']);
  });

  it('techs and everyone else keep the bars they had', () => {
    expect(hrefs('tech')).toEqual(['/', '/jobs', '/tools']);
    expect(hrefs('other')).toEqual(['/', '/jobs', '/customers', '/sales', '/tools']);
  });

  it('a person whose only role is Dispatcher gets it', async () => {
    held = ['fieldservice.group_fsm_dispatcher'];
    const { result } = await renderHook(() => useDispatcherOnly());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it.each([['owner', 'fieldservice.group_fsm_manager'], ['office', 'account.group_account_manager']])('a dispatcher who is also %s keeps the full bar', async (_n, group) => {
    held = ['fieldservice.group_fsm_dispatcher', group];
    const { result } = await renderHook(() => useDispatcherOnly());
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current).toBe(false);
  });

  it('a plain tech does not get it', async () => {
    const { result } = await renderHook(() => useDispatcherOnly());
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current).toBe(false);
  });

  it('Look as a dispatcher gives it, signed out too', async () => {
    mockSignedIn = false;
    setRolePreview('dispatcher');
    const { result } = await renderHook(() => useDispatcherOnly());
    await waitFor(() => expect(result.current).toBe(true));
  });
});
