import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, touch, type } from '../theme';

type CameraModule = typeof import('expo-camera');

/** expo-camera, built into the APK from 0.5.0. Null where it isn't (web, an older APK). */
function loadCamera(): CameraModule | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('expo-camera') as CameraModule;
  } catch {
    return null;
  }
}

/** The barcode kinds parts come with: UPC and EAN on retail boxes, Code 128 and QR on supplier and Odoo labels. */
export const PART_BARCODES = ['upc_a', 'upc_e', 'ean13', 'ean8', 'code128', 'code39', 'qr'] as const;

/**
 * A full-screen sheet that reads one barcode with the camera and hands it
 * back. The code can also be typed in, for a torn label or a phone without
 * camera permission.
 */
export function BarcodeScanner({ visible, title, hint, onCode, onClose }: { visible: boolean; title: string; hint?: string; onCode: (code: string) => void; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (visible) setTyped('');
  }, [visible]);
  if (!visible) return null;
  const submit = () => {
    const c = typed.trim();
    if (c) onCode(c);
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet} testID="scanner">
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button" testID="scanner-close">
              <Text style={styles.cancelText}>Close</Text>
            </Pressable>
          </View>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
          <CameraBox onCode={onCode} />
          <Text style={styles.label}>Or type the code</Text>
          <View style={styles.row}>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              onSubmitEditing={submit}
              placeholder="Barcode or part number"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Barcode or part number"
              testID="scanner-typed"
              style={styles.input}
            />
            <Pressable onPress={submit} accessibilityRole="button" testID="scanner-use" style={({ pressed }) => [styles.use, pressed && styles.pressed]}>
              <Text style={styles.useText}>Use</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CameraBox({ onCode }: { onCode: (code: string) => void }) {
  const cam = useRef(loadCamera()).current;
  if (!cam) return <Text style={styles.note}>The camera scanner needs app version 0.5.0 or newer on this phone.</Text>;
  return <LiveCamera cam={cam} onCode={onCode} />;
}

function LiveCamera({ cam, onCode }: { cam: CameraModule; onCode: (code: string) => void }) {
  const [permission, requestPermission] = cam.useCameraPermissions();
  // The camera reports the same code many times a second; take it once.
  const last = useRef<{ code: string; at: number } | null>(null);
  if (!permission) return <View style={styles.camera} />;
  if (!permission.granted) {
    return (
      <View style={[styles.camera, styles.center]}>
        <Text style={styles.note}>{permission.canAskAgain ? 'The app needs the camera to read barcodes.' : 'Camera is turned off for this app. Turn it on in the phone settings, or type the code below.'}</Text>
        {permission.canAskAgain ? (
          <Pressable onPress={() => requestPermission()} accessibilityRole="button" testID="scanner-allow" style={({ pressed }) => [styles.use, pressed && styles.pressed]}>
            <Text style={styles.useText}>Allow camera</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  const Camera = cam.CameraView;
  return (
    <Camera
      style={styles.camera}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: [...PART_BARCODES] }}
      onBarcodeScanned={({ data }) => {
        const code = data.trim();
        const now = Date.now();
        if (!code || (last.current && last.current.code === code && now - last.current.at < 2500)) return;
        last.current = { code, at: now };
        onCode(code);
      }}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, fontSize: type.value, fontWeight: '900', color: colors.text },
  hint: { fontSize: 16, fontWeight: '600', color: colors.muted },
  cancel: { minHeight: touch.min, paddingHorizontal: 12, justifyContent: 'center' },
  cancelText: { fontSize: type.body, fontWeight: '800', color: colors.text, textDecorationLine: 'underline' },
  camera: { height: 280, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.text },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16, backgroundColor: colors.card },
  note: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
  label: { fontSize: type.label, fontWeight: '800', color: colors.text },
  row: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minHeight: touch.min, borderRadius: 10, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 14, fontSize: type.body, fontWeight: '700', color: colors.text, backgroundColor: colors.bg },
  use: { minHeight: touch.min, minWidth: 88, borderRadius: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selected },
  useText: { fontSize: type.body, fontWeight: '900', color: colors.onSelected },
  pressed: { opacity: 0.8 },
});
