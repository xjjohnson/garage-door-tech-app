import { Page } from '../components/Page';
import { PriceSheetScreen } from '../screens/PriceSheetScreen';

export default function PriceSheetRoute() {
  return (
    <Page title="Price sheet" testID="prices-sheet">
      <PriceSheetScreen />
    </Page>
  );
}
