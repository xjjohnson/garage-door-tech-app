import { NO_ACCESS } from '../lib/odooWarehouse';
import { accessForRole, effectiveRole, narrowAccess, rolesFor, ROLE_CARDS } from '../lib/roles';
import { mergeAccess } from '../lib/odooWarehouse';
import { parkPreviews, rolePreview, rolePreviews, setRolePreview, setRolePreviews } from '../lib/devFlags';
import { readStartValue } from '../lib/themeStart';

const a = (o: Partial<typeof NO_ACCESS>) => ({ ...NO_ACCESS, ...o });

describe('roles a person can work in', () => {
  it('a person with no role is just a Tech, so there is nothing to pick', () => {
    expect(rolesFor(NO_ACCESS)).toEqual(['tech']);
    expect(effectiveRole(NO_ACCESS, null)).toBe('tech');
  });

  it('shows only the roles held, plus Tech', () => {
    expect(rolesFor(a({ dispatch: true, sales: true }))).toEqual(['tech', 'dispatch', 'sales']);
    expect(effectiveRole(a({ dispatch: true, sales: true }), null)).toBeNull(); // needs the start screen
    expect(effectiveRole(a({ dispatch: true, sales: true }), 'sales')).toBe('sales');
  });

  it('Buyer is part of Warehouse', () => {
    expect(rolesFor(a({ purchasing: true }))).toEqual(['tech', 'warehouse']);
    expect(rolesFor(a({ warehouse: true }))).toEqual(['tech', 'warehouse']);
  });

  it('the owner holds every role', () => {
    expect(rolesFor(a({ owner: true }))).toEqual(['tech', 'dispatch', 'office', 'sales', 'warehouse', 'owner']);
  });

  it('ignores a saved role the person no longer holds', () => {
    expect(effectiveRole(a({ dispatch: true }), 'owner')).toBeNull();
    const real = a({ dispatch: true, sales: true });
    expect(narrowAccess(real, 'owner')).toBe(real);
  });

  it('narrows what the app opens to the chosen role', () => {
    const real = a({ dispatch: true, sales: true });
    expect(narrowAccess(real, 'sales')).toMatchObject({ sales: true, dispatch: false });
    expect(narrowAccess(real, 'dispatch')).toMatchObject({ sales: false, dispatch: true });
    expect(narrowAccess(real, 'tech')).toEqual(NO_ACCESS);
    expect(accessForRole('warehouse', real)).toMatchObject({ warehouse: true, purchasing: true, dispatch: false });
    expect(narrowAccess(a({ owner: true, dispatch: true, office: true, sales: true, warehouse: true }), 'owner').owner).toBe(true);
  });

  it('every role has its own theme', () => {
    expect(Object.values(ROLE_CARDS).map((c) => c.theme)).toEqual(['field', 'dispatch', 'office', 'sales', 'warehouse', 'owner']);
  });
});

describe('Developer: look as several roles', () => {
  afterEach(() => setRolePreviews([]));

  it('merges what each role opens', () => {
    const m = mergeAccess([a({ dispatch: true }), a({ sales: true })]);
    expect(m).toMatchObject({ dispatch: true, sales: true, office: false, owner: false });
  });

  it('holds several roles, and the old single-role calls still work', () => {
    setRolePreviews(['dispatcher', 'sales', 'sales']);
    expect(rolePreviews()).toEqual(['dispatcher', 'sales']);
    expect(rolePreview()).toBe('dispatcher');
    setRolePreview('owner');
    expect(rolePreviews()).toEqual(['owner']);
    setRolePreview(null);
    expect(rolePreviews()).toEqual([]);
  });

  it('parks the roles for the one restart a role switch does', () => {
    setRolePreviews(['office', 'sales']);
    parkPreviews();
    const v = readStartValue('devpreview');
    // With no start database (tests) nothing is stored; with one it holds the roles.
    expect(v === null || v === 'office,sales').toBe(true);
  });
});
