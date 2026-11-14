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
});
