import { OwnerOnly } from '../components/OwnerOnly';
import { Page } from '../components/Page';
import { SetupCheckScreen } from '../screens/SetupCheckScreen';

export default function SetupRoute() {
  return (
    <Page title="Odoo setup check" testID="setup-page">
      <OwnerOnly what="The Odoo setup check">
        <SetupCheckScreen />
      </OwnerOnly>
    </Page>
  );
}
