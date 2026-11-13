import { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleProp, ViewStyle } from 'react-native';
import { useKeyboardHeight } from '../lib/useKeyboardHeight';

/**
 * A bottom sheet's backdrop that lifts the sheet above the keyboard, so the
 * field being typed in and the buttons under it stay in view (iOS pads; on
 * Android, where a Modal ignores the window resize, it pads by the keyboard's height).
 */
export function KeyboardBackdrop({ style, children, testID }: { style: StyleProp<ViewStyle>; children: ReactNode; testID?: string }) {
  const kb = useKeyboardHeight();
  return (
    <KeyboardAvoidingView style={[style, Platform.OS !== 'ios' && kb > 0 && { paddingBottom: kb }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} testID={testID}>
      {children}
    </KeyboardAvoidingView>
  );
}
