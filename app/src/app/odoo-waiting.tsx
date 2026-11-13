import { Page } from '../components/Page';
import { WaitingScreen } from '../screens/WaitingScreen';

/** /odoo-waiting: what's on this phone that Odoo doesn't have yet, with Sync now. */
export default function WaitingRoute() {
  return (
    <Page title="Waiting for Odoo" testID="waiting-page">
      <WaitingScreen />
    </Page>
  );
}
