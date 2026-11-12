import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChipOption, Segmented } from '../../components/controls';
import { SectionScroll } from '../../components/SectionScroll';
import { useCalculatorLink } from '../../lib/useCalculatorLink';
import { DispatchScreen, useCanDispatch } from '../../screens/DispatchScreen';
import { JobsScreen } from '../../screens/JobsScreen';

type Whose = 'mine' | 'team';
const WHOSE: ChipOption<Whose>[] = [
  { label: 'Mine', value: 'mine' },
  { label: 'Team', value: 'team' },
];

export default function JobsRoute() {
  const { requestOpen } = useCalculatorLink();
  // Team (the dispatch board) only shows for an Odoo dispatcher, manager or admin.
  const canDispatch = useCanDispatch();
  const [whose, setWhose] = useState<Whose>('mine');
  const team = canDispatch && whose === 'team';
  return (
    <SectionScroll>
      {canDispatch ? (
        <View style={styles.switch}>
          <Segmented options={WHOSE} value={whose} onChange={setWhose} testID="jobs-whose" />
        </View>
      ) : null}
      {team ? (
        <DispatchScreen />
      ) : (
        <JobsScreen
          onOpen={(job) => {
            requestOpen(job);
            router.navigate('/springs');
          }}
        />
      )}
    </SectionScroll>
  );
}

const styles = StyleSheet.create({ switch: { marginBottom: 12 } });
