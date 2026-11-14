import { ComponentProps } from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput } from 'react-native';
import { familyFor, useFontsReady } from '../lib/fonts';

/** Picks the Figtree file for the style's fontWeight. Custom fonts on Android have one file per weight, so the weight is dropped once the family is set. */
function withFont<S>(style: S, ready: boolean): S | unknown[] {
  if (!ready) return style;
  const flat = StyleSheet.flatten(style as never) as Record<string, unknown> | undefined;
  const base = flat ?? {};
  if (base.fontFamily) return style;
  const { fontWeight, ...rest } = base;
  return [rest, { fontFamily: familyFor(fontWeight) }];
}

/** Text in the app's font. Drop-in for react-native's Text. */
export function Text({ style, ...props }: ComponentProps<typeof RNText>) {
  const ready = useFontsReady();
  return <RNText {...props} style={withFont(style, ready) as never} />;
}

/** TextInput in the app's font. Drop-in for react-native's TextInput. */
export function TextInput({ style, ...props }: ComponentProps<typeof RNTextInput>) {
  const ready = useFontsReady();
  return <RNTextInput {...props} style={withFont(style, ready) as never} />;
}
