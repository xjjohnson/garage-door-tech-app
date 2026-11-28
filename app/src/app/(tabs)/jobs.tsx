import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ChipOption, Segmented } from '../../components/controls';
import { SectionScroll } from '../../components/SectionScroll';
import { useCalculatorLink } from '../../lib/useCalculatorLink';
import { useDispatcherOnly } from '../../lib/useDepartments';
import { DispatchScreen, Part, useCanDispatch } from '../../screens/DispatchScreen';
import { JobsScreen } from '../../screens/JobsScreen';
import { TodayMapScreen } from '../../screens/TodayMapScreen';
import { layouts, sp } from '../../theme';
import { makeStyles } from '../../lib/makeStyles';

type Whose = 'mine' | 'team';
const WHOSE: ChipOption<Whose>[] = [
  { label: 'Mine', value: 'mine' },
  { label: 'Team', value: 'team' },
];

type Board = 'all' | 'unassigned' | 'upcoming';
const BOARD: ChipOption<Board>[] = [
  { label: 'Team', value: 'all' },
  { label: 'Not assigned', value: 'unassigned' },
  { label: 'Upcoming', value: 'upcoming' },
];

/** The dispatcher-only Jobs tab: the team board first, with Not assigned and Upcoming one tap away. */
function DispatcherJobs() {
  const styles = useStyles();
  const [board, setBoard] = useState<Board>('all');
  return (
    <SectionScroll>
      <View style={styles.switch}>
        <Segmented options={BOARD} value={board} onChange={setBoard} testID="jobs-whose" />
      </View>
      <DispatchScreen part={board as Part} />
    </SectionScroll>
  );
}

export default function JobsRoute() {
  const dispatcherOnly = useDispatcherOnly();
  return dispatcherOnly ? <DispatcherJobs /> : <AllJobs />;
}

function AllJobs() {
  const styles = useStyles();
  const { requestOpen } = useCalculatorLink();
  // Team (the dispatch board) only shows for an Odoo dispatcher, manager or admin.
  const canDispatch = useCanDispatch();
  const [whose, setWhose] = useState<Whose>(layouts.jobsTeamFirst ? 'team' : 'mine');
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
        <>
          {layouts.jobsMap ? <TodayMapScreen /> : null}
        <JobsScreen
          onOpen={(job) => {
            requestOpen(job);
            router.navigate('/springs');
          }}
        />
        </>
      )}
    </SectionScroll>
  );
}

const useStyles = makeStyles(() => ({ switch: { marginBottom: sp(12) } }));
