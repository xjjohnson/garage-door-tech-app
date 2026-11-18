import { Page } from '../components/Page';
import { OwnerOverviewScreen } from '../screens/OwnerOverviewScreen';

/** /overview: the owner's overview. */
export default function OverviewRoute() {
  return (
    <Page title="Owner overview" testID="overview-page">
      <OwnerOverviewScreen />
    </Page>
  );
}
