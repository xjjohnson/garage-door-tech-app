import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChipOption, Segmented } from '../../components/controls';
import { SectionScroll } from '../../components/SectionScroll';
import { TodayMapScreen } from '../../screens/TodayMapScreen';
import { TodayScreen } from '../../screens/TodayScreen';
import { WeekScreen } from '../../screens/WeekScreen';
import { layouts, sp } from '../../theme';

type View_ = 'week' | 'today' | 'map';
const VIEWS: ChipOption<View_>[] = [
  { label: 'Week', value: 'week' },
  { label: 'Today', value: 'today' },
  { label: 'Map', value: 'map' },
];

export default function TodayRoute() {
  const [view, setView] = useState<View_>(layouts.homeStartsOnMap ? 'map' : 'today');
  return (
    <SectionScroll>
      <View style={styles.switch}>
        <Segmented options={VIEWS} value={view} onChange={setView} testID="today-view" />
      </View>
      {view === 'map' ? <TodayMapScreen /> : view === 'week' ? <WeekScreen /> : <TodayScreen />}
    </SectionScroll>
  );
}

const styles = StyleSheet.create({ switch: { marginBottom: sp(14) } });
