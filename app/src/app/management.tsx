import { Page } from '../components/Page';
import { ManagementScreen } from '../screens/ManagementScreen';

export default function PageRoute() {
  return (
    <Page title="Management" testID="management-page">
      <ManagementScreen />
    </Page>
  );
}
