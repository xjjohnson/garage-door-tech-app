import { act, render, screen } from '@testing-library/react-native';
import { Keyboard, Platform, StyleSheet, Text } from 'react-native';
import { KeyboardBackdrop } from '../components/KeyboardBackdrop';

describe('KeyboardBackdrop', () => {
  it('pads the sheet up by the keyboard while it is open on Android', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    const listeners: Record<string, (e?: { endCoordinates: { height: number } }) => void> = {};
    const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, fn: (e?: { endCoordinates: { height: number } }) => void) => {
      listeners[name] = fn;
      return { remove: () => undefined };
    }) as never);
    await render(
      <KeyboardBackdrop style={{ flex: 1 }} testID="backdrop">
        <Text testID="inside">Order it</Text>
      </KeyboardBackdrop>,
    );
    const backdrop = () => StyleSheet.flatten(screen.getByTestId('backdrop').props.style);
    expect(backdrop().paddingBottom || 0).toBe(0);
    await act(async () => listeners.keyboardDidShow!({ endCoordinates: { height: 300 } }));
    expect(backdrop().paddingBottom).toBe(300);
    await act(async () => listeners.keyboardDidHide!());
    expect(backdrop().paddingBottom || 0).toBe(0);
    spy.mockRestore();
    os.restore();
  });
});
