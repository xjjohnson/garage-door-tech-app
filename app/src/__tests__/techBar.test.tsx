import { renderHook, waitFor } from '@testing-library/react-native';
import { setRolePreview } from '../lib/devFlags';
import { SECTIONS, TECH_HIDDEN_HREFS, TECH_SECTION_IDS } from '../lib/sections';
import { useTech } from '../lib/useDepartments';

let held: string[] = [];
let mockSignedIn = true;
const mockClient = {
  session: { kind: 'oca', uid: 5, name: 'Dee', me: 9 },
  call: async (model: string, method: string, args: unknown[] = []) => (`${model}.${method}` === 'res.users.has_group' ? held.includes(args[1] as string) : []),
};
jest.mock('../lib/useOdoo', () => ({ useOdoo: () => (mockSignedIn ? { status: 'signedIn', client: mockClient } : { status: 'signedOut', client: null }) }));

beforeEach(() => {
  held = [];
  mockSignedIn = true;
  setRolePreview(null);
});

describe('tech bottom bar', () => {
  it('is Home, Jobs, Tools, and Customers and Sales are the hidden routes', () => {
    expect(TECH_SECTION_IDS.map((id) => SECTIONS.find((s) => s.id === id)?.href)).toEqual(['/', '/jobs', '/tools']);
    expect(TECH_HIDDEN_HREFS).toEqual(['/customers', '/sales']);
  });

  it('a plain tech gets the short bar', async () => {
    const { result } = await renderHook(() => useTech());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it.each([['dispatch', 'fieldservice.group_fsm_dispatcher'], ['office', 'account.group_account_manager'], ['owner', 'fieldservice.group_fsm_manager']])('%s keeps the full bar', async (_n, group) => {
    held = [group];
    const { result } = await renderHook(() => useTech());
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current).toBe(false);
  });

  it('Look as a tech gives the short bar, signed out too', async () => {
    mockSignedIn = false;
    setRolePreview('tech');
    const { result } = await renderHook(() => useTech());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('signed out with no preview is the one person using the phone: full bar', async () => {
    mockSignedIn = false;
    const { result } = await renderHook(() => useTech());
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current).toBe(false);
  });
});
