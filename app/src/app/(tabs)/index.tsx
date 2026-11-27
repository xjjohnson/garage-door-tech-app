import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FieldGoBar } from '../../components/FieldGoBar';
import { ChipOption, Segmented } from '../../components/controls';
import { SectionScroll } from '../../components/SectionScroll';
import { TodayMapScreen } from '../../screens/TodayMapScreen';
import { TodayScreen } from '../../screens/TodayScreen';
import { WeekScreen } from '../../screens/WeekScreen';
import { useBadges } from '../../lib/useBadges';
import { useDispatcherOnly, useOfficeOnly, useOwnerBar, useSalesOnly } from '../../lib/useDepartments';
import { SalesHome } from '../../screens/SalesDesk';
import { OwnerHome } from '../../screens/OwnerDesk';
import { OfficeHomePage } from '../../screens/OfficeAreaScreen';
import { DispatchChips } from '../../components/DispatchChips';
import { colors, layouts, sp } from '../../theme';

type View_ = 'week' | 'today' | 'map';
const VIEWS: ChipOption<View_>[] = [
  { label: 'Week', value: 'week' },
  { label: 'Today', value: 'today' },
  { label: 'Map', value: 'map' },
];

export default function TodayRoute() {
  const dispatcherOnly = useDispatcherOnly();
  const salesOnly = useSalesOnly();
  const ownerBar = useOwnerBar();
  const officeOnly = useOfficeOnly();
  const startsOnMap = layouts.homeStartsOnMap || dispatcherOnly;
  const [view, setView] = useState<View_>(startsOnMap ? 'map' : 'today');
  useBadges();
  const switcher = <Segmented options={VIEWS} value={view} onChange={setView} testID="today-view" />;
  // The owner's Home: the money board and what needs the owner, not a day of visits (Jobs has those).
  if (ownerBar) {
    return (
      <SectionScroll>
        <OwnerHome />
      </SectionScroll>
    );
  }
  // An office person's Home: the money board, not a day of visits.
  if (officeOnly) {
    return (
      <SectionScroll>
        <OfficeHomePage />
      </SectionScroll>
    );
  }
  // A salesperson's Home: quote numbers and the quotes to chase, not a day of visits.
  if (salesOnly) {
    return (
      <SectionScroll>
        <SalesHome />
      </SectionScroll>
    );
  }
  // Dispatch and Map: the map is the page. It fills the screen, with a small sheet under it.
  if (view === 'map' && startsOnMap) {
    return (
      <View style={styles.page}>
        {dispatcherOnly ? <DispatchChips /> : null}
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
