import { Page } from '../components/Page';
import { PurchasingScreen } from '../screens/PurchasingScreen';

/** /purchasing: the buyer's area. */
export default function PurchasingRoute() {
  return (
    <Page title="Purchasing" testID="purchasing-page">
      <PurchasingScreen />
    </Page>
  );
}
