import { Page } from '../components/Page';
import { StatsScreen } from '../screens/StatsScreen';

export default function StatsRoute() {
  return (
    <Page title="Business numbers" testID="stats-page">
      <StatsScreen />
    </Page>
  );
}
