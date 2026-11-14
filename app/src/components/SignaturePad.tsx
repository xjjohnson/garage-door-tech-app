import { useRef, useState } from 'react';
import { KeyboardAvoidingView, LayoutChangeEvent, Modal, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './AppText';
import Svg, { Path } from 'react-native-svg';
import { strokePath } from '../lib/attachments';
import { colors, touch, type } from '../theme';

export interface SignatureResult {
  name: string;
  paths: string[];
  w: number;
  h: number;
}

/**
 * A sheet where the customer signs with a finger, with their name typed above.
 * Strokes are kept as SVG paths, so a signature is a few hundred bytes.
 */
export function SignatureSheet({ visible, title, agreement, initialName, onSave, onCancel }: { visible: boolean; title: string; agreement: string; initialName: string; onSave: (s: SignatureResult) => void; onCancel: () => void }) {
  const [name, setName] = useState(initialName);
  const [paths, setPaths] = useState<string[]>([]);
  const [size, setSize] = useState({ w: 320, h: 180 });
  const current = useRef<{ x: number; y: number }[]>([]);
  const [live, setLive] = useState('');

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        current.current = [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
        setLive(strokePath(current.current));
      },
      onPanResponderMove: (e) => {
        current.current.push({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY });
        setLive(strokePath(current.current));
      },
      onPanResponderRelease: () => {
        const d = strokePath(current.current);
        current.current = [];
        setLive('');
        if (d) setPaths((p) => [...p, d]);
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => setSize({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) });
  const reset = () => {
    setPaths([]);
    setLive('');
  };
  const canSave = paths.length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel} onShow={() => setName(initialName)}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet} testID="signature-sheet">
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onCancel} style={styles.cancel} accessibilityRole="button" testID="signature-cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
          <Text style={styles.agreement}>{agreement}</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Customer's name" placeholderTextColor={colors.muted} accessibilityLabel="Name" testID="signature-name" style={styles.input} />
          <View style={styles.pad} onLayout={onLayout} {...pan.panHandlers} testID="signature-pad" accessibilityLabel="Sign here with a finger">
            <Svg width="100%" height="100%">
              {[...paths, live].filter(Boolean).map((d, i) => (
                <Path key={i} d={d} stroke="#000" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </Svg>
            {!canSave && !live ? (
              <Text style={styles.hint} pointerEvents="none">
                Sign here
              </Text>
            ) : null}
          </View>
          <View style={styles.row}>
            <Pressable onPress={reset} accessibilityRole="button" testID="signature-clear" style={({ pressed }) => [styles.button, styles.grow, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>Clear</Text>
            </Pressable>
            <Pressable
              onPress={() => canSave && onSave({ name: name.trim(), paths, w: size.w, h: size.h })}
              disabled={!canSave}
              accessibilityRole="button"
              testID="signature-save"
              style={({ pressed }) => [styles.button, styles.grow, styles.primary, !canSave && styles.off, pressed && styles.pressed]}
            >
              <Text style={[styles.buttonText, styles.primaryText]}>Save signature</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, fontSize: type.value, fontWeight: '900', color: colors.text },
  cancel: { minHeight: touch.min, paddingHorizontal: 12, justifyContent: 'center' },
  cancelText: { fontSize: type.body, fontWeight: '800', color: colors.text, textDecorationLine: 'underline' },
  agreement: { fontSize: type.body, fontWeight: '700', color: colors.text },
  input: { minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.bg },
  pad: { height: 200, borderRadius: 10, borderWidth: 3, borderColor: colors.border, backgroundColor: '#FFFFFF', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  hint: { position: 'absolute', fontSize: type.body, color: colors.muted, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  button: { minHeight: touch.min, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: colors.bg },
  primary: { backgroundColor: colors.selected },
  primaryText: { color: colors.onSelected },
  off: { backgroundColor: colors.muted },
  pressed: { backgroundColor: colors.info },
  buttonText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
});
