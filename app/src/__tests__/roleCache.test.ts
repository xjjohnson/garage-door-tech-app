import AsyncStorage from '@react-native-async-storage/async-storage';
import { departmentAccess, realAccess } from '../lib/odooWarehouse';
import { isOwner } from '../lib/scorecard';
import { setRolePreview } from '../lib/devFlags';

function client(login: string, state: { up: boolean; groups: string[] }) {
  return {
    session: { kind: 'oca', uid: 5, url: 'https://x.test', db: 'd', login },
    call: async (model: string, method: string, args: unknown[] = []) => {
      if (!state.up) throw new Error('Network request failed');
      if (`${model}.${method}` === 'res.users.has_group') return state.groups.includes(args[1] as string);
      throw new Error('unexpected');
    },
  } as never;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  setRolePreview(null);
});

describe('last known role when Odoo can not be reached', () => {
  it('keeps the owner an owner offline', async () => {
    const st = { up: true, groups: ['base.group_system'] };
    const c = client('justin', st);
    expect((await realAccess(c)).owner).toBe(true);
    st.up = false;
    expect(await isOwner(c)).toBe(true);
    expect((await departmentAccess(c)).warehouse).toBe(true);
  });

  it('shows nothing offline when no role was ever saved', async () => {
    const c = client('new', { up: false, groups: [] });
    expect((await realAccess(c)).owner).toBe(false);
  });

  it('takes a role away once Odoo says so, and Look as a tech still wins offline', async () => {
    const st = { up: true, groups: ['fieldservice.group_fsm_manager'] };
    const c = client('sam', st);
    expect(await isOwner(c)).toBe(true);
    st.groups = [];
    expect(await isOwner(c)).toBe(false);
    st.up = false;
    expect(await isOwner(c)).toBe(false);
    st.up = true;
    st.groups = ['base.group_system'];
    expect(await isOwner(c)).toBe(true);
    st.up = false;
    setRolePreview('tech');
    expect(await isOwner(c)).toBe(false);
  });
});
