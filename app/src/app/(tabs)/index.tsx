import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChipOption, Segmented } from '../../components/controls';
import { SectionScroll } from '../../components/SectionScroll';
import { TodayMapScreen } from '../../screens/TodayMapScreen';
import { TodayScreen } from '../../screens/TodayScreen';

type View_ = 'list' | 'map';
const VIEWS: ChipOption<View_>[] = [
  { label: 'List', value: 'list' },
  { label: 'Map', value: 'map' },
];

export default function TodayRoute() {
  const [view, setView] = useState<View_>('list');
  return (
    <SectionScroll>
      <View style={styles.switch}>
        <Segmented options={VIEWS} value={view} onChange={setView} testID="today-view" />
      </View>
      {view === 'map' ? <TodayMapScreen /> : <TodayScreen />}
    </SectionScroll>
  );
}

const styles = StyleSheet.create({ switch: { marginBottom: 14 } });
