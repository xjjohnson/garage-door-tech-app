import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ManagementScreen } from '../screens/ManagementScreen';

const calls: [string, string, unknown[]][] = [];
const mockClient = {
  session: { kind: 'oca', uid: 1, fields: [] },
  call: async (model: string, method: string, args: unknown[]) => {
    calls.push([model, method, args]);
    if (method === 'has_group') return true;
    if (method === 'fields_get') return { name: {}, instructions: {}, duration: {}, type_id: {}, active: {} };
    if (model === 'fsm.template' && method === 'search_read') return [{ id: 7, name: 'Opener', instructions: 'Check eyes', duration: 1, type_id: [2, 'Repair'] }];
    if (model === 'fsm.person' && method === 'search_read') return [{ id: 4, name: 'Sam', phone: '555', email: '' }];
    if (model === 'fsm.person' && method === 'fields_get') return { name: {}, phone: {}, email: {} };
    if (model === 'fsm.vehicle' && method === 'fields_get') return { name: {}, person_id: {} };
    if (model === 'fsm.vehicle' && method === 'search_read') return [{ id: 6, name: 'Truck - Sam', person_id: [4, 'Sam'] }];
    if (model === 'fsm.order.type') return [{ id: 2, name: 'Repair' }, { id: 3, name: 'Install' }];
    return true;
  },
};
jest.mock('../lib/useOdoo', () => ({ useOdoo: () => ({ status: 'signedIn', client: mockClient }) }));

describe('Management screen', () => {
  it('edits a job type and saves it to Odoo', async () => {
    await render(<ManagementScreen />);
    await fireEvent.press(await screen.findByTestId('manage-jt-7'));
    await fireEvent.changeText(await screen.findByTestId('manage-jt-name'), 'Opener repair');
    await fireEvent.press(await screen.findByTestId('manage-jt-type-3'));
    await waitFor(() => expect(screen.getByTestId('manage-save')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('manage-save'));
    await waitFor(() => expect(calls.some((c) => c[1] === 'write' && c[0] === 'fsm.template')).toBe(true));
    const w = calls.find((c) => c[1] === 'write')!;
    expect(w[2]).toEqual([[7], { name: 'Opener repair', instructions: 'Check eyes', duration: 1, type_id: 3 }]);
  });

  it('edits a tech and a truck', async () => {
    await render(<ManagementScreen />);
    await fireEvent.press(await screen.findByTestId('manage-tab-techs'));
    await fireEvent.press(await screen.findByTestId('manage-tech-4'));
    await fireEvent.changeText(await screen.findByTestId('manage-tech-phone'), '512');
    await fireEvent.press(await screen.findByTestId('manage-save'));
    await waitFor(() => expect(calls.some((c) => c[0] === 'fsm.person' && c[1] === 'write')).toBe(true));
    await fireEvent.press(await screen.findByTestId('manage-tab-trucks'));
    await fireEvent.press(await screen.findByTestId('manage-truck-6'));
    await fireEvent.changeText(await screen.findByTestId('manage-truck-name'), 'Truck 2');
    await fireEvent.press(await screen.findByTestId('manage-save'));
    await waitFor(() => expect(calls.some((c) => c[0] === 'fsm.vehicle' && c[1] === 'write')).toBe(true));
  });
});
