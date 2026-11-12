import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCalculatorLink } from '../../lib/useCalculatorLink';
import { DoorScreen } from '../../screens/DoorScreen';
import { DrumsScreen } from '../../screens/DrumsScreen';
import { ExtensionScreen } from '../../screens/ExtensionScreen';
import { MatchScreen } from '../../screens/MatchScreen';
import { colors, touch, type } from '../../theme';

type Tab = 'match' | 'door' | 'extension' | 'drums';

const TABS: { id: Tab; label: string }[] = [
  { id: 'match', label: 'Match old' },
  { id: 'door', label: 'From door' },
  { id: 'extension', label: 'Extension' },
  { id: 'drums', label: 'High lift' },
];

/** Springs: torsion (match or size), extension, and drums and high lift. All stay mounted so switching keeps their inputs. */
export default function SpringsRoute() {
  const { openJob } = useCalculatorLink();
  const [tab, setTab] = useState<Tab>('match');
  // A job opened from the Jobs list shows on its own tab.
  useEffect(() => {
    if (openJob) setTab(openJob.job.mode);
  }, [openJob]);

  return (
    <View style={styles.flex}>
      {/* Four ways into the calculator, as one joined switch so it doesn't read like the app's main tabs. */}
      <View style={styles.segmentWrap}>
        <View style={styles.segments} accessibilityRole="tablist">
          {TABS.map((t, i) => {
            const on = tab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTab(t.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                testID={`tab-${t.id}`}
                style={({ pressed }) => [styles.segment, i > 0 && styles.segmentDivider, on && styles.tabOn, pressed && !on && styles.pressed]}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={[styles.flex, tab !== 'match' && styles.hidden]}>
        <MatchScreen open={openJob} />
      </View>
      <View style={[styles.flex, tab !== 'door' && styles.hidden]}>
        <DoorScreen open={openJob} />
      </View>
      <View style={[styles.flex, tab !== 'extension' && styles.hidden]}>
        <ExtensionScreen open={openJob} />
      </View>
      <View style={[styles.flex, tab !== 'drums' && styles.hidden]}>
        <DrumsScreen open={openJob} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hidden: { display: 'none' },
  segmentWrap: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 3, borderBottomColor: colors.border },
  segments: { flexDirection: 'row', borderWidth: 3, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' },
  segment: { flex: 1, minHeight: touch.min, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, backgroundColor: colors.bg },
  segmentDivider: { borderLeftWidth: 3, borderLeftColor: colors.border },
  tabOn: { backgroundColor: colors.selected },
  pressed: { backgroundColor: colors.safety },
  tabText: { fontSize: type.body, fontWeight: '800', color: colors.text, textAlign: 'center' },
  tabTextOn: { color: colors.onSelected },
});
