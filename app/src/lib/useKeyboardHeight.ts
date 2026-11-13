import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * How tall the on-screen keyboard is right now, 0 when it's down. A sheet in
 * a Modal on Android isn't resized for the keyboard, so it pads its bottom by
 * this much to keep the field being typed in, and Save, above the keys.
 */
export function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setH(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return h;
}
