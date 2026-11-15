import { useLocalSearchParams } from 'expo-router';
import { Text } from '../../components/AppText';
import { Page } from '../../components/Page';
import { jobName } from '../../lib/jobs';
import { useJobs } from '../../lib/useJobs';
import { PhotosScreen } from '../../screens/PhotosScreen';
import { colors, type } from '../../theme';

/** /photos/<job id>: before and after photos for one job. */
export default function PhotosRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { jobs, loaded } = useJobs();
  const job = jobs.find((j) => j.id === id);
  return (
    <Page title={job ? `Photos: ${jobName(job)}` : 'Photos'} testID="photos-page">
      {job ? <PhotosScreen jobId={job.id} /> : loaded ? <Text style={{ fontSize: type.body, color: colors.text }}>That job isn't saved on this phone any more.</Text> : null}
    </Page>
  );
}
