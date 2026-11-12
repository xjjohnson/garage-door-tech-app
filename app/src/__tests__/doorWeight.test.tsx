import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { renderApp } from '../testing/renderApp';
import { DEFAULT_DOOR_WEIGHT_FORM, runDoorWeight } from '../screens/DoorWeightScreen';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('door weight estimate', () => {
  it('estimates a 16x7 insulated steel door by default', () => {
    expect(runDoorWeight(DEFAULT_DOOR_WEIGHT_FORM).estimate).toMatchObject({ lowLb: 165, highLb: 180 });
    expect(runDoorWeight({ ...DEFAULT_DOOR_WEIGHT_FORM, width: 'other' }).error).toBeTruthy();
  });

  it('opens from Size from door, marked as an estimate, and closes back', async () => {
    const app = await renderApp('/springs');
    await fireEvent.press(screen.getByTestId('tab-door'));
    await fireEvent.press(screen.getByTestId('door-estimate-weight'));
    expect(app.getPathname()).toBe('/door-weight');
    expect(screen.getByText('ESTIMATE')).toBeTruthy();
    expect(screen.getByTestId('dw-result')).toHaveTextContent(/165–180 lb/);
    await fireEvent.press(within(screen.getByTestId('dw-build')).getByText('Wood, older'));
    expect(screen.getByTestId('dw-result')).toHaveTextContent(/350–360 lb/);
    await fireEvent.press(screen.getByTestId('door-weight-page-close'));
    expect(app.getPathname()).toBe('/springs');
  });
});
