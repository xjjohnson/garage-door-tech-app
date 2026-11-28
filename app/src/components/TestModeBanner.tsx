/**
 * A small label that floats on every screen while any Developer testing
 * switch is on (viewing as another role, weak signal, pretend time, pretend
 * offline), so nobody forgets one is on. Shows nothing normally. Taps go
 * through it.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { onDevFlags, pretendOffline, pretendTime, PREVIEWS, rolePreviews, weakSignal } from '../lib/devFlags';
import { colors, fs, sp } from '../theme';

export function testModeLabels(): string[] {
  const out: string[] = [];
  const p = rolePreviews();
  if (p.length) out.push(`Viewing as ${p.map((id) => PREVIEWS.find((x) => x.id === id)?.label ?? id).join(' + ')}`);
  const s = weakSignal();
  if (s !== 'normal') out.push(s === 'slow' ? 'Slow signal' : 'Signal drops');
  if (pretendTime() !== null) out.push('Pretend time');
  if (pretendOffline()) out.push('Pretend offline');
  return out;
}

export function TestModeBanner() {
  const [, tick] = useState(0);
  useEffect(() => onDevFlags(() => tick((n) => n + 1)), []);
  const labels = testModeLabels();
  if (!labels.length) return null;
  return (
    <View pointerEvents="none" style={styles.wrap} testID="test-mode-banner">
      <Text style={styles.text}>{`TEST MODE: ${labels.join(' · ')}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 8, bottom: 96, backgroundColor: colors.stop, borderRadius: 999, paddingHorizontal: sp(12), paddingVertical: sp(6) },
  text: { color: '#FFFFFF', fontSize: fs(13), fontWeight: '800' },
});
