import { useLocalSearchParams } from 'expo-router';
import { Text } from '../../components/AppText';
import { Page } from '../../components/Page';
import { useJobs } from '../../lib/useJobs';
import { InspectionScreen } from '../../screens/InspectionScreen';
import { colors, type } from '../../theme';

/** /inspection/<job id>: the inspection for one saved job. */
export default function InspectionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { jobs, loaded } = useJobs();
  const job = jobs.find((j) => j.id === id);
  return (
    <Page title="Inspection" testID="inspection-page">
      {job ? (
        <InspectionScreen job={job} />
      ) : loaded ? (
        <Text style={{ fontSize: type.body, color: colors.text }}>That job isn't saved on this phone any more.</Text>
      ) : null}
    </Page>
  );
}
