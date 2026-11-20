import { ReactNode, useEffect, useRef } from 'react';
import { ScrollView, ScrollViewInstance, StyleSheet } from 'react-native';
import { onDevFlags } from '../lib/devFlags';
import { colors, sp } from '../theme';

/**
 * A section that scrolls as one page under the header, e.g. Jobs or Manuals.
 * Tabs stay open once visited, so when the page gets shorter while it is out
 * of sight (a different role or theme shows less), the old scroll position
 * can sit past the end and leave the screen blank. It is pulled back to the
 * end of the page, and to the top when Look at the app as changes.
 */
export function SectionScroll({ children }: { children: ReactNode }) {
  const ref = useRef<ScrollViewInstance>(null);
  const offset = useRef(0);
  const viewport = useRef(0);
  useEffect(() => onDevFlags(() => ref.current?.scrollTo({ y: 0, animated: false })), []);
  return (
    <ScrollView
      ref={ref}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={32}
      onScroll={(e) => {
        offset.current = e.nativeEvent.contentOffset.y;
      }}
      onLayout={(e) => {
        viewport.current = e.nativeEvent.layout.height;
      }}
      onContentSizeChange={(_w, h) => {
        const max = Math.max(0, h - viewport.current);
        if (offset.current > max) {
          offset.current = max;
          ref.current?.scrollTo({ y: max, animated: false });
        }
      }}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sp(16), paddingBottom: sp(48) },
});
