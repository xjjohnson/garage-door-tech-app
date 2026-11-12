import { Page } from '../components/Page';
import { SetupCheckScreen } from '../screens/SetupCheckScreen';

export default function SetupRoute() {
  return (
    <Page title="Odoo setup check" testID="setup-page">
      <SetupCheckScreen />
    </Page>
  );
}
