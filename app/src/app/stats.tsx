import { OwnerOnly } from '../components/OwnerOnly';
import { Page } from '../components/Page';
import { StatsScreen } from '../screens/StatsScreen';

export default function StatsRoute() {
  return (
    <Page title="Business numbers" testID="stats-page">
      <OwnerOnly what="Business numbers">
        <StatsScreen />
      </OwnerOnly>
    </Page>
  );
}
