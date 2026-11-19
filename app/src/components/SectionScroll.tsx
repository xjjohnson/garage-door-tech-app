import { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { colors, sp } from '../theme';

/** A section that scrolls as one page under the header, e.g. Jobs or Manuals. */
export function SectionScroll({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sp(16), paddingBottom: sp(48) },
});
