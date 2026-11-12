import { Page } from '../components/Page';
import { NewJobScreen } from '../screens/NewJobScreen';

export default function NewJobRoute() {
  return (
    <Page title="New job" testID="new-job-page">
      <NewJobScreen />
    </Page>
  );
}
