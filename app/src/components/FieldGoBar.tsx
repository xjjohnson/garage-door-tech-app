import { StyleSheet, View } from 'react-native';
import { useMemo } from 'react';
import { onDay, visitDone } from '../lib/schedule';
import { useJobs } from '../lib/useJobs';
import { useStartJob } from '../lib/useStartJob';
import { useVisits } from '../lib/useVisits';
import { colors, bw, sp } from '../theme';
import { Action } from './Buttons';

/** Field Home: the next visit's one big action, pinned at the bottom for the thumb. */
export function FieldGoBar({ now = Date.now }: { now?: () => number }) {
  const appointments = useVisits();
  const { jobs } = useJobs();
  const startJob = useStartJob();
  const t = now();
  const next = useMemo(() => onDay(appointments, t).filter((a) => a.status === 'booked' && !visitDone(a, jobs)).find((a) => a.start + a.minutes * 60000 > t), [appointments, jobs, t]);
  // Every visit today is done: nothing to open, so no bar (a done visit still opens from the list).
  if (!next) return null;
  const label = `${next.jobId ? 'Open' : 'On my way'} · ${next.name}`;
  return (
    <View style={styles.bar} testID="field-go-bar">
      <Action label={label} primary onPress={() => startJob(next)} testID="today-next-go" />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { padding: sp(12), borderTopWidth: bw(1), borderTopColor: colors.line, backgroundColor: colors.bg },
});
