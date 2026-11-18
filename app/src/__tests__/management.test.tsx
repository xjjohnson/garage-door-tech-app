import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { act } from 'react';
import { runBackStep } from '../lib/backStep';
import { ManagementScreen } from '../screens/ManagementScreen';

const calls: [string, string, unknown[]][] = [];
let vehicleFields: Record<string, unknown> = { name: {}, person_id: {} };
const mockClient = {
  session: { kind: 'oca', uid: 1, fields: [] },
  call: async (model: string, method: string, args: unknown[]) => {
    calls.push([model, method, args]);
    if (method === 'has_group') return true;
    if (model === 'fsm.vehicle' && method === 'fields_get') return vehicleFields;
    if (model === 'agreement' && method === 'fields_get') return { name: {}, description: {}, active: {}, is_template: {}, code: {} };
    if (model === 'agreement' && method === 'search_read') return [];
    if (model === 'agreement' && method === 'create') return 31;
    if (model === 'ir.sequence') return 'AGR1';
    if (method === 'fields_get') return { name: {}, instructions: {}, duration: {}, type_id: {}, active: {} };
    if (model === 'fsm.template' && method === 'search_read') return [{ id: 7, name: 'Opener', instructions: '<p>Check eyes</p>', duration: 1, type_id: [2, 'Repair'] }];
    if (model === 'fsm.person' && method === 'search_read') return [{ id: 4, name: 'Sam', phone: '555', email: '' }];
    if (model === 'fsm.person' && method === 'fields_get') return { name: {}, phone: {}, email: {} };
    if (model === 'stock.location' && method === 'search_read') {
      const dom = JSON.stringify(args[0]);
      if (dom.includes('=ilike')) return [];
      if (dom.includes('"Stock"')) return [{ id: 20, complete_name: 'JHS/Stock' }];
      return [{ id: 20, complete_name: 'JHS/Stock' }, { id: 21, complete_name: 'JHS/Stock/Truck 1' }];
    }
    if (model === 'stock.location' && method === 'create') return 22;
    if (model === 'fsm.vehicle' && method === 'search_read') return [{ id: 6, name: 'Truck - Sam', person_id: [4, 'Sam'] }];
    if (model === 'fsm.order.type') return [{ id: 2, name: 'Repair' }, { id: 3, name: 'Install' }];
    return true;
  },
};
jest.mock('../lib/useOdoo', () => ({ useOdoo: () => ({ status: 'signedIn', client: mockClient }) }));

const goBack = () => act(async () => { runBackStep(); });

describe('Management screen', () => {
  it('opens as a grouped list and each row opens its own page with a way back', async () => {
    await render(<ManagementScreen />);
    expect(await screen.findByText('Jobs and scheduling')).toBeTruthy();
    for (const g of ['Parts and prices', 'Team', 'Customers and messages', 'Business']) expect(screen.getByText(g)).toBeTruthy();
    // Nothing is open until a row is tapped.
    expect(screen.getByTestId('manage-menu')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('manage-tab-techs'));
    expect(await screen.findByTestId('manage-tech-4')).toBeTruthy();
    expect(screen.queryByTestId('manage-menu')).toBeNull();
    // One back control only: the page header's, which steps back to the list.
    await goBack();
    expect(await screen.findByTestId('manage-menu')).toBeTruthy();
  });

  it('edits a job type and saves it to Odoo', async () => {
    await render(<ManagementScreen />);
    await fireEvent.press(await screen.findByTestId('manage-tab-jobTypes'));
    await fireEvent.press(await screen.findByTestId('manage-jt-7'));
    await fireEvent.changeText(await screen.findByTestId('manage-jt-name'), 'Opener repair');
    await fireEvent.press(await screen.findByTestId('manage-jt-type-3'));
    await waitFor(() => expect(screen.getByTestId('manage-save')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('manage-save'));
    await waitFor(() => expect(calls.some((c) => c[1] === 'write' && c[0] === 'fsm.template')).toBe(true));
    const w = calls.find((c) => c[1] === 'write')!;
    expect(w[2]).toEqual([[7], { name: 'Opener repair', instructions: '<p>Check eyes</p>', duration: 1, type_id: 3 }]);
  });

  it('edits a tech and a truck', async () => {
    await render(<ManagementScreen />);
    await fireEvent.press(await screen.findByTestId('manage-tab-techs'));
    await fireEvent.press(await screen.findByTestId('manage-tech-4'));
    await fireEvent.changeText(await screen.findByTestId('manage-tech-phone'), '512');
    await fireEvent.press(await screen.findByTestId('manage-save'));
    await waitFor(() => expect(calls.some((c) => c[0] === 'fsm.person' && c[1] === 'write')).toBe(true));
    await goBack();
    await fireEvent.press(await screen.findByTestId('manage-tab-trucks'));
    await fireEvent.press(await screen.findByTestId('manage-truck-6'));
    await fireEvent.changeText(await screen.findByTestId('manage-truck-name'), 'Truck 2');
    await fireEvent.press(await screen.findByTestId('manage-save'));
    await waitFor(() => expect(calls.some((c) => c[0] === 'fsm.vehicle' && c[1] === 'write')).toBe(true));
  });

  it('sets a truck\'s stock location when vehicles link to one', async () => {
    vehicleFields = { name: {}, person_id: {}, inventory_location_id: { type: 'many2one', relation: 'stock.location' } };
    calls.length = 0;
    await render(<ManagementScreen />);
    await fireEvent.press(await screen.findByTestId('manage-tab-trucks'));
    await fireEvent.press(await screen.findByTestId('manage-truck-6'));
    await fireEvent.press(await screen.findByTestId('manage-truck-place-21'));
    await fireEvent.press(await screen.findByTestId('manage-save'));
    await waitFor(() => expect(calls.some((c) => c[0] === 'fsm.vehicle' && c[1] === 'write')).toBe(true));
    expect(calls.find((c) => c[0] === 'fsm.vehicle' && c[1] === 'write')![2]).toEqual([[6], { name: 'Truck - Sam', person_id: 4, inventory_location_id: 21 }]);
  });

  it('makes the truck\'s stock location when vehicles have no link field', async () => {
    vehicleFields = { name: {}, person_id: {} };
    calls.length = 0;
    await render(<ManagementScreen />);
    await fireEvent.press(await screen.findByTestId('manage-tab-trucks'));
    await fireEvent.press(await screen.findByTestId('manage-truck-6'));
    await fireEvent.press(await screen.findByTestId('manage-truck-make-place'));
    await waitFor(() => expect(calls.some((c) => c[0] === 'stock.location' && c[1] === 'create')).toBe(true));
    expect(calls.find((c) => c[0] === 'stock.location' && c[1] === 'create')![2]).toEqual([{ name: 'Truck - Sam', usage: 'internal', location_id: 20 }]);
    expect(await screen.findByTestId('manage-truck-place-msg')).toHaveTextContent(/Made JHS\/Stock\/Truck - Sam/);
  });
});

describe('Management > Maintenance plans', () => {
  it('adds the starter plans from an empty list', async () => {
    calls.length = 0;
    await render(<ManagementScreen />);
    await fireEvent.press(await screen.findByTestId('manage-tab-plans'));
    expect(await screen.findByTestId('manage-plans-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('manage-plans-starter'));
    await waitFor(() => expect(calls.filter((c) => c[0] === 'agreement' && c[1] === 'create')).toHaveLength(3));
  });

  it('adds a plan with a price and saves it as an agreement', async () => {
    calls.length = 0;
    await render(<ManagementScreen />);
    await fireEvent.press(await screen.findByTestId('manage-tab-plans'));
    await fireEvent.press(await screen.findByTestId('manage-plan-new'));
    await fireEvent.changeText(await screen.findByTestId('manage-plan-name'), 'Gold plan');
    await fireEvent.press(screen.getByTestId('manage-plan-every-6'));
    await fireEvent.changeText(screen.getByTestId('manage-plan-price'), '149.50');
    await fireEvent.press(screen.getByTestId('manage-save'));
    await waitFor(() => expect(calls.some((c) => c[0] === 'agreement' && c[1] === 'create')).toBe(true));
    const vals = calls.find((c) => c[0] === 'agreement' && c[1] === 'create')![2][0] as { name: string; description: string };
    expect(vals.name).toBe('Gold plan');
    expect(vals.description).toContain('"priceCents":14950');
    expect(vals.description).toContain('"everyMonths":6');
    expect(vals.description).toContain('"visitsPerYear":2');
  });
});
