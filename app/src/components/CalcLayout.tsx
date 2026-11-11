import { ReactNode, useRef } from 'react';
import { Pressable, ScrollView, ScrollViewInstance, StyleSheet, Text, View } from 'react-native';
import { colors, touch, type } from '../theme';

export type BarTone = 'waiting' | 'ok' | 'stop';

/** "Enter length of 20 coils" / "Then spring length, door height". */
export function waitingSummary(missing: string[]): BarSummary {
  const [first, ...rest] = missing.map((m) => m.charAt(0).toLowerCase() + m.slice(1));
  return { tone: 'waiting', title: `Enter ${first ?? 'the measurements'}`, detail: rest.length > 0 ? `Then ${rest.join(', ')}` : undefined };
}

export interface BarSummary {
  tone: BarTone;
  /** The answer in a few words, e.g. the spring size. */
  title: string;
  /** One more line, e.g. the turns to wind. */
  detail?: string;
}

/**
 * A calculator screen: the inputs and results scroll, and a bar pinned to
 * the bottom always shows the answer so far. Tapping the bar jumps to the
 * results, which start with the safety banner.
 */
export function CalcLayout({ inputs, results, summary, testID }: { inputs: ReactNode; results: ReactNode; summary: BarSummary; testID?: string }) {
  const scroll = useRef<ScrollViewInstance>(null);
  const resultsY = useRef(0);
  return (
    <View style={styles.root}>
      <ScrollView ref={scroll} style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {inputs}
        <View
          style={styles.results}
          onLayout={(e) => {
            resultsY.current = e.nativeEvent.layout.y;
          }}
        >
          {results}
        </View>
      </ScrollView>
      <ResultBar summary={summary} onPress={() => scroll.current?.scrollTo({ y: Math.max(0, resultsY.current - 8), animated: true })} testID={testID} />
    </View>
  );
}

const TONE = {
  waiting: { box: { backgroundColor: colors.card }, text: { color: colors.text }, sub: { color: colors.muted } },
  ok: { box: { backgroundColor: colors.bg }, text: { color: colors.text }, sub: { color: colors.muted } },
  stop: { box: { backgroundColor: colors.stop }, text: { color: colors.onStop }, sub: { color: colors.onStop } },
} as const;

function ResultBar({ summary, onPress, testID }: { summary: BarSummary; onPress: () => void; testID?: string }) {
  const t = TONE[summary.tone];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${summary.title}${summary.detail ? `. ${summary.detail}` : ''}. Shows the results.`}
      testID={testID}
      style={({ pressed }) => [styles.bar, t.box, pressed && styles.pressed]}
    >
      {({ pressed }) => (
        <>
          <View style={styles.barText}>
            <Text style={[styles.barTitle, t.text, pressed && styles.pressedText]} numberOfLines={1}>
              {summary.title}
            </Text>
            {summary.detail ? (
              <Text style={[styles.barDetail, t.sub, pressed && styles.pressedText]} numberOfLines={2}>
                {summary.detail}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.barGo, t.text, pressed && styles.pressedText]}>Results ↓</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  results: { gap: 14 },
  bar: {
    minHeight: touch.bar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 3,
    borderTopColor: colors.border,
  },
  pressed: { backgroundColor: colors.safety },
  pressedText: { color: colors.text },
  barText: { flex: 1, gap: 2 },
  barTitle: { fontSize: type.value, fontWeight: '900' },
  barDetail: { fontSize: 16, fontWeight: '700' },
  barGo: { fontSize: 16, fontWeight: '900' },
});
