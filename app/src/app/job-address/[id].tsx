import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { Page } from '../../components/Page';
import { useJobs } from '../../lib/useJobs';
import { JobAddressScreen } from '../../screens/JobAddressScreen';
import { colors, type } from '../../theme';

/** /job-address/<job id>: which of the customer's addresses the job is at. */
export default function JobAddressRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { jobs, loaded } = useJobs();
  const job = jobs.find((j) => j.id === id);
  return (
    <Page title="Job address" testID="job-address-page">
      {job ? <JobAddressScreen job={job} /> : loaded ? <Text style={{ fontSize: type.body, color: colors.text }}>That job isn&apos;t saved on this phone any more.</Text> : null}
    </Page>
  );
}
