import { Page } from '../components/Page';
import { FollowUpsScreen } from '../screens/FollowUpsScreen';

export default function FollowUpsRoute() {
  return (
    <Page title="Follow-ups" testID="followups-page">
      <FollowUpsScreen />
    </Page>
  );
}
