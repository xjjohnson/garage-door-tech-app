import { OwnerOnly } from '../components/OwnerOnly';
import { Page } from '../components/Page';
import { DeveloperScreen } from '../screens/DeveloperScreen';

export default function DeveloperRoute() {
  return (
    <Page title="Developer" testID="developer-page">
      <OwnerOnly what="The Developer screen" realOwner>
        <DeveloperScreen />
      </OwnerOnly>
    </Page>
  );
}
