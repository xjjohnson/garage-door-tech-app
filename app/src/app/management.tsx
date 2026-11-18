import { OwnerOnly } from '../components/OwnerOnly';
import { Page } from '../components/Page';
import { ManagementScreen } from '../screens/ManagementScreen';

export default function PageRoute() {
  return (
    <Page title="Management" testID="management-page">
      <OwnerOnly what="Management">
        <ManagementScreen />
      </OwnerOnly>
    </Page>
  );
}
