import { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, touch, type } from '../theme';

/** A full-screen page over the app, with its title and a big Close button. */
export function FullSheet({ visible, title, onClose, children, testID }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; testID?: string }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']} testID={testID}>
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
            {title}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" testID={testID ? `${testID}-close` : undefined} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 3, borderBottomColor: colors.border },
  title: { flex: 1, fontSize: type.big, fontWeight: '900', color: colors.text },
  close: { minHeight: touch.min, minWidth: touch.min + 16, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  pressed: { backgroundColor: colors.safety },
  closeText: { fontSize: type.body, fontWeight: '800', color: colors.text },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
});
