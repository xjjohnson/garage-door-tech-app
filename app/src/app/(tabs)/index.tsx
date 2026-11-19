import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FieldGoBar } from '../../components/FieldGoBar';
import { ChipOption, Segmented } from '../../components/controls';
import { SectionScroll } from '../../components/SectionScroll';
import { TodayMapScreen } from '../../screens/TodayMapScreen';
import { TodayScreen } from '../../screens/TodayScreen';
import { WeekScreen } from '../../screens/WeekScreen';
import { colors, layouts, sp } from '../../theme';

type View_ = 'week' | 'today' | 'map';
const VIEWS: ChipOption<View_>[] = [
  { label: 'Week', value: 'week' },
  { label: 'Today', value: 'today' },
  { label: 'Map', value: 'map' },
];

export default function TodayRoute() {
  const [view, setView] = useState<View_>(layouts.homeStartsOnMap ? 'map' : 'today');
  const switcher = <Segmented options={VIEWS} value={view} onChange={setView} testID="today-view" />;
  // Dispatch and Map: the map is the page. It fills the screen, with a small sheet under it.
  if (view === 'map' && layouts.homeStartsOnMap) {
    return (
      <View style={styles.page}>
        <View style={styles.floating}>{switcher}</View>
        <TodayMapScreen full />
      </View>
    );
  }
  const field = layouts.home === 'field' && view === 'today';
  const content = (
    <SectionScroll>
      <View style={styles.switch}>{switcher}</View>
      {view === 'map' ? <TodayMapScreen /> : view === 'week' ? <WeekScreen /> : <TodayScreen />}
    </SectionScroll>
  );
  // Field: the one big action stays at the bottom, under the thumb.
  return field ? (
    <View style={styles.page}>
      {content}
      <FieldGoBar />
    </View>
  ) : (
    content
  );
}

const styles = StyleSheet.create({
  switch: { marginBottom: sp(14) },
  page: { flex: 1, backgroundColor: colors.bg },
  floating: { paddingHorizontal: sp(12), paddingVertical: sp(6) },
});
