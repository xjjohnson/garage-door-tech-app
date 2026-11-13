import { Page } from '../components/Page';
import { PriceBookScreen } from '../screens/PriceBookScreen';

/** /price-sheet: the price book open on its Estimates tab (good / better / best prices). */
export default function PriceSheetRoute() {
  return (
    <Page title="Price book" testID="prices-sheet">
      <PriceBookScreen initialTab="estimate" />
    </Page>
  );
}
