import { useLocalSearchParams } from 'expo-router';
import { Page } from '../../components/Page';
import { JobHubScreen } from '../../screens/JobHubScreen';

export default function JobHubRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Page title="Job" testID="job-page">
      <JobHubScreen id={String(id)} />
    </Page>
  );
}
